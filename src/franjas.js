/**
 * Franjas de entrega, compartidas por la tienda y la gestión.
 *
 * Ya no son tramos de dos horas: son el TURNO de mañana o el de tarde, y
 * cambian según el día de la semana. El cambio lo pidió el dueño con estas
 * palabras: "el tema de colocar hora está siendo bastante complicado para
 * cumplirle a los clientes". Una franja de dos horas obliga a clavar la hora en
 * una ciudad con tráfico; un turno de tres o cuatro horas sí se cumple.
 *
 * El cliente elige mañana o tarde, y nada más: no hay horas a mano ni un "me da
 * igual" que no ocupaba hueco en ninguna franja y descuadraba la agenda.
 *
 * EL HORARIO, que es lo único que hay que tocar si vuelve a cambiar:
 *   lunes a jueves   mañana 10–13 · tarde 16–20
 *   viernes          mañana 10–13 · tarde 15–18
 *   sábado           todo el día 10–18
 *   domingo          cerrado
 */

export const HORA_INICIO = 10;   // primera entrega del día
export const HORA_FIN = 20;      // última

const dosCifras = (n) => String(n).padStart(2, "0");

/**
 * Un turno. `tope` son los repartos que caben dentro, y es el número que hay
 * que subir o bajar cuando la agenda se queda corta o se queda larga: sale de
 * contar uno y medio por hora, que es el ritmo real con el que se venía
 * trabajando (tres repartos por cada dos horas).
 */
const turno = (id, nombre, desde, hasta, tope) => ({
  id,
  nombre,
  desde: `${dosCifras(desde)}:00`,
  hasta: `${dosCifras(hasta)}:00`,
  etiqueta: `${nombre} · ${dosCifras(desde)}:00 – ${dosCifras(hasta)}:00`,
  inicio: desde * 60,
  fin: hasta * 60,
  tope,
});

export const MANANA        = turno("manana", "Mañana", 10, 13, 5);
export const TARDE         = turno("tarde", "Tarde", 16, 20, 6);
export const TARDE_VIERNES = turno("tarde-v", "Tarde", 15, 18, 5);
export const SABADO        = turno("sabado", "Todo el día", 10, 18, 12);

/** Los turnos de cada día de la semana, con domingo vacío (0 = domingo). */
const SEMANA = {
  0: [],
  1: [MANANA, TARDE],
  2: [MANANA, TARDE],
  3: [MANANA, TARDE],
  4: [MANANA, TARDE],
  5: [MANANA, TARDE_VIERNES],
  6: [SABADO],
};

/** Todos los turnos que existen, para buscar uno por su id sin saber el día. */
export const TODOS_LOS_TURNOS = [MANANA, TARDE, TARDE_VIERNES, SABADO];

/** El día de la semana de "2026-10-28", o null si la fecha no se entiende. */
function diaSemana(iso) {
  const [a, m, d] = String(iso || "").split("-").map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d).getDay();
}

/**
 * Los turnos que se pueden elegir un día concreto. Vacío el domingo, y vacío
 * también si no hay fecha todavía: así la tienda no ofrece horas antes de que
 * el cliente diga qué día quiere.
 */
export function turnosDe(iso) {
  const d = diaSemana(iso);
  return d === null ? [] : SEMANA[d];
}

/** Ese día no se reparte (hoy, solo el domingo). */
export const sinReparto = (iso) => turnosDe(iso).length === 0;

/** El texto que se guarda en el pedido: "10:00 a 13:00". */
export const textoFranja = (f) => `${f.desde} a ${f.hasta}`;

/**
 * Lo que se guarda cuando el pedido no lleva turno.
 *
 * La tienda ya no lo ofrece —ahí hay que elegir mañana o tarde— pero la gestión
 * sí: el dueño puede apuntar un pedido sin hora, y los pedidos viejos la traen
 * así. Un pedido sin turno no ocupa hueco en la agenda.
 */
export const SIN_PREFERENCIA = "Cualquier hora";

/** "17:30" → 1050 minutos. Devuelve null si no se entiende. */
function minutos(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Los turnos que ocupa un pedido de un día, a partir de su `rangoHorario`.
 *
 * Hay que pasar la fecha porque los turnos ya no son los mismos todos los días:
 * las 16:00 de un jueves caen en la tarde de 16 a 20, y las de un viernes no
 * caen en ninguna (ese día la tarde acaba a las 18 y empieza a las 15).
 *
 * Los pedidos antiguos traen tramos de dos horas ("17:00 a 19:00") y los de la
 * gestión pueden traer cualquier cosa; todo lo que se solape con un turno
 * cuenta como ocupado en él. Sin hora no ocupa nada, y por eso un pedido
 * "Cualquier hora" nunca llena la agenda.
 */
export function franjasOcupadas(iso, rangoHorario) {
  const partes = String(rangoHorario || "").split(/\s+a\s+/i);
  const ini = minutos(partes[0]);
  const fin = minutos(partes[1]);
  if (ini === null || fin === null || fin <= ini) return [];
  return turnosDe(iso).filter(t => ini < t.fin && fin > t.inicio).map(t => t.id);
}

/**
 * Cuántos repartos hay apuntados en cada turno de cada día.
 *
 * Solo cuentan los pedidos A DOMICILIO: una recogida no ocupa al repartidor,
 * el cliente se adapta. Los cancelados tampoco cuentan.
 */
export function ocupacion(pedidos = []) {
  const agenda = {};
  for (const p of pedidos) {
    if (!p?.fecha || p.estado === "Cancelado") continue;
    if (p.tipoEntrega === "Recogida") continue;
    for (const id of franjasOcupadas(p.fecha, p.rangoHorario)) {
      agenda[p.fecha] = agenda[p.fecha] || {};
      agenda[p.fecha][id] = (agenda[p.fecha][id] || 0) + 1;
    }
  }
  return agenda;
}

/** Los repartos que caben en un turno; 0 si ese turno no existe ese día. */
export const topeDe = (iso, turnoId) =>
  turnosDe(iso).find(t => t.id === turnoId)?.tope ?? 0;

/** Huecos que quedan en un turno, según la agenda publicada. */
export const huecosEn = (agenda, fecha, turnoId) =>
  Math.max(0, topeDe(fecha, turnoId) - ((agenda?.[fecha] || {})[turnoId] || 0));
