/**
 * Franjas de entrega, compartidas por la tienda y la gestión.
 *
 * El cliente ya no escribe dos horas sueltas: elige una franja de 2 horas, o
 * dice que le da igual. Con horas libres no había forma de saber si quedaba
 * hueco ("de 14:05 a 15:40" solapa a medias con "de 14:00 a 16:00"); con
 * franjas fijas, o queda sitio o no queda.
 *
 * La franja es ORIENTATIVA: se entrega en algún momento dentro de esas dos
 * horas, no a una hora exacta. Eso hay que decírselo al cliente, y por eso
 * está escrito aquí al lado del cálculo.
 */

export const HORA_INICIO = 10;        // primera entrega del día
export const HORA_FIN = 22;           // última
export const HORAS_POR_FRANJA = 2;
export const TOPE_POR_FRANJA = 3;     // repartos que caben en cada franja
export const DIAS_SIN_REPARTO = [0];  // 0 = domingo

const dosCifras = (n) => String(n).padStart(2, "0");

/** Las franjas del día, de la primera a la última. */
export const FRANJAS = Array.from(
  { length: Math.floor((HORA_FIN - HORA_INICIO) / HORAS_POR_FRANJA) },
  (_, i) => {
    const desde = HORA_INICIO + i * HORAS_POR_FRANJA;
    const hasta = desde + HORAS_POR_FRANJA;
    return {
      id: `${dosCifras(desde)}-${dosCifras(hasta)}`,
      desde: `${dosCifras(desde)}:00`,
      hasta: `${dosCifras(hasta)}:00`,
      etiqueta: `${dosCifras(desde)}:00 – ${dosCifras(hasta)}:00`,
      inicio: desde * 60,
      fin: hasta * 60,
    };
  }
);

/** Lo que se guarda en el pedido cuando el cliente no elige hora. */
export const SIN_PREFERENCIA = "Cualquier hora";

export const textoFranja = (f) => `${f.desde} a ${f.hasta}`;

/** "2026-10-26" → true si es domingo (o cualquier día marcado sin reparto). */
export function sinReparto(iso) {
  if (!iso) return false;
  const [a, m, d] = String(iso).split("-").map(Number);
  if (!a || !m || !d) return false;
  return DIAS_SIN_REPARTO.includes(new Date(a, m - 1, d).getDay());
}

/** "17:30" → 1050 minutos. Devuelve null si no se entiende. */
function minutos(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Las franjas que ocupa un pedido, a partir de su `rangoHorario`.
 *
 * Los pedidos antiguos traen horas a mano ("17:00 a 19:00") y los de la
 * gestión pueden traer cualquier cosa; todo lo que se solape con una franja
 * cuenta como ocupado en ella. Sin hora, no ocupa ninguna: justamente por eso
 * "cualquier hora" nunca se llena.
 */
export function franjasDe(rangoHorario) {
  const partes = String(rangoHorario || "").split(/\s+a\s+/i);
  const ini = minutos(partes[0]);
  const fin = minutos(partes[1]);
  if (ini === null || fin === null || fin <= ini) return [];
  return FRANJAS.filter(f => ini < f.fin && fin > f.inicio).map(f => f.id);
}

/**
 * Cuántos repartos hay apuntados en cada franja de cada día.
 *
 * Solo cuentan los pedidos A DOMICILIO: una recogida no ocupa al repartidor,
 * el cliente se adapta. Los cancelados tampoco cuentan.
 */
export function ocupacion(pedidos = []) {
  const agenda = {};
  for (const p of pedidos) {
    if (!p?.fecha || p.estado === "Cancelado") continue;
    if (p.tipoEntrega === "Recogida") continue;
    for (const id of franjasDe(p.rangoHorario)) {
      agenda[p.fecha] = agenda[p.fecha] || {};
      agenda[p.fecha][id] = (agenda[p.fecha][id] || 0) + 1;
    }
  }
  return agenda;
}

/** Huecos que quedan en una franja, según la agenda publicada. */
export const huecosEn = (agenda, fecha, franjaId) =>
  Math.max(0, TOPE_POR_FRANJA - ((agenda?.[fecha] || {})[franjaId] || 0));
