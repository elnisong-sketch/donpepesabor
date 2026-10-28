/**
 * EL ORDEN DEL REPARTO.
 *
 * El problema real: hay diez entregas, cada una con una franja de dos horas que
 * se le prometió al cliente, y hacerlas en el orden en que entraron los pedidos
 * significa cruzar Madrid de punta a punta varias veces. Ordenarlas solo por la
 * hora tampoco vale: dentro de la misma franja caben tres, y da igual el orden
 * en que se metieron.
 *
 * Lo que se hace aquí es buscar el recorrido más corto EN TIEMPO DE COCHE, con
 * las franjas metidas como penalización y no como regla: si apretando media hora
 * una entrega se ahorra una vuelta entera a la ciudad, se aprieta y se avisa.
 * Eso es decisión del dueño, dicha con estas palabras: "si me saca de la franja
 * por 30 minutos, que me avise, pero vale la pena para no dar vueltas".
 *
 * De dónde salen los datos, que es la parte que no cuesta dinero:
 * - Las coordenadas de cada portal ya las calcula la tienda al hacer el pedido
 *   (Photon, con Nominatim de respaldo) y ahora se guardan con él. Las que
 *   falten —pedidos viejos, o escritos a mano en la gestión— se buscan una vez
 *   y se quedan guardadas en el móvil.
 * - Los tiempos de un portal a otro los da OSRM, el mismo servicio que la tienda
 *   usa ya para cobrar el envío por kilómetros.
 *
 * Ninguno de los dos es imprescindible: si no hay red, la app se queda con el
 * orden sencillo (franja y código postal) y lo dice.
 */

import { ORIGEN_LAT, ORIGEN_LON, situar } from "./tienda/envio.js";

/** Margen que se acepta fuera de la franja sin que cuente como problema. */
export const MARGEN_POR_DEFECTO = 30;

/**
 * Lo que se tarda en cada puerta: aparcar, subir, cobrar y volver al coche.
 * Ocho minutos es tirando a generoso a propósito; si la ruta se calcula justa,
 * la última entrega sale siempre tarde y el repartidor deja de hacerle caso.
 */
export const MINUTOS_EN_PUERTA = 8;

const CACHE_COORDENADAS = "coordenadasReparto";

/** La misma dirección escrita de dos maneras es la misma dirección. */
const claveDireccion = (p) =>
  `${p.direccion || ""} ${p.cp || ""}`.toLowerCase().replace(/\s+/g, " ").trim();

function leerCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_COORDENADAS) || "{}"); }
  catch { return {}; }
}

function guardarCache(cache) {
  try { localStorage.setItem(CACHE_COORDENADAS, JSON.stringify(cache)); } catch { /* sin sitio */ }
}

const espera = (ms) => new Promise(r => setTimeout(r, ms));

const esPunto = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon);

/**
 * La franja de un pedido, en minutos desde medianoche: "16:00 a 18:00" → 960 y
 * 1080. Devuelve null cuando no hay hora ("Cualquier hora", o vacío), y esos
 * pedidos son los que dan juego: se colocan donde encajen.
 */
export function ventana(rangoHorario) {
  const m = /^(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/.exec(String(rangoHorario || "").trim());
  if (!m) return null;
  const ini = Number(m[1]) * 60 + Number(m[2]);
  const fin = Number(m[3]) * 60 + Number(m[4]);
  return fin > ini ? { ini, fin } : null;
}

/** 965 → "16:05". Para enseñar horas calculadas. */
export const hhmm = (min) => {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * Lo que cuesta llegar tarde, medido en minutos de coche para poder sumarlo al
 * viaje y comparar peras con peras.
 *
 * Dentro del margen es casi gratis —medio minuto por cada minuto de retraso—,
 * lo justo para que entre dos recorridos que duran lo mismo gane el que llega
 * en hora. Pasado el margen sube a doce: cinco minutos de más cuestan como una
 * hora de coche, así que solo ocurre cuando no hay manera de evitarlo.
 *
 * Esto es lo que pidió el dueño: "si la optimización hace que me salga de la
 * franja por 30 minutos, que me dé un mensaje, pero vale la pena para no dar
 * vueltas". Blando, no prohibido, y avisando.
 */
function penalizacion(retraso, margen) {
  return retraso <= margen ? retraso * 0.5 : margen * 0.5 + (retraso - margen) * 12;
}

/**
 * Qué pasa al llegar a una parada: a qué hora se entrega de verdad, cuánto rato
 * queda muerto antes de poder llamar al timbre y cuánto se pasa de la franja.
 *
 * LLEGAR PRONTO NO SE PENALIZA Y NO CUESTA NADA, y esto es deliberado. Con el
 * horario de mañana (10–13) y tarde (16–20) hay tres horas muertas en medio de
 * todos los días: el repartidor no las pasa esperando en el coche, se vuelve a
 * la tienda y hace otra cosa. Si esas horas contaran como coste, el cálculo
 * retorcería la ruta entera para no "esperar", y acabaría plantándose en el
 * portal media hora antes de tiempo para ahorrárselo. Media hora antes no hay
 * nadie en casa: eso es peor que esperar.
 *
 * Así que antes de la franja no se entrega nunca —se espera a que abra— y lo
 * único que se avisa es llegar TARDE, que es lo que de verdad incumple lo que
 * se le prometió al cliente.
 */
function llegarA(reloj, viaje, v) {
  let llegada = reloj + viaje;
  let esperando = 0;
  let desvio = 0;
  if (v) {
    if (llegada < v.ini) {
      esperando = v.ini - llegada;
      llegada = v.ini;
    } else if (llegada > v.fin) {
      desvio = llegada - v.fin;
    }
  }
  return { llegada, esperando, desvio };
}

/**
 * Recorre un orden concreto y devuelve lo que costaría hacerlo.
 *
 * `tiempos` es la matriz de minutos entre puntos, con la tienda en la posición
 * 0, así que la parada `i` está en la fila y columna `i + 1`.
 */
function recorrer(orden, tiempos, ventanas, salida, margen) {
  let reloj = salida, desde = 0;
  let conduciendo = 0, esperando = 0, castigo = 0;
  const visita = [];

  for (const i of orden) {
    const viaje = tiempos[desde][i + 1];
    const r = llegarA(reloj, viaje, ventanas[i]);
    conduciendo += viaje;
    esperando += r.esperando;
    castigo += penalizacion(r.desvio, margen);
    visita.push({ i, llegada: r.llegada, desvio: r.desvio });
    reloj = r.llegada + MINUTOS_EN_PUERTA;
    desde = i + 1;
  }

  // El coste NO incluye la espera: ver `llegarA`. Lo que se minimiza es el
  // tiempo al volante, sin pasarse de las franjas.
  return { visita, coste: conduciendo + castigo, conduciendo, esperando, fin: reloj };
}

/**
 * Primer recorrido: desde donde estés, la parada que menos cueste añadir ahora
 * mismo. Es pan comido y nunca es el mejor orden, pero deja algo decente desde
 * donde empezar a mejorar.
 */
function ordenInicial(n, tiempos, ventanas, salida, margen) {
  const quedan = new Set(Array.from({ length: n }, (_, i) => i));
  const orden = [];
  let reloj = salida, desde = 0;

  while (quedan.size) {
    let elegida = null, menor = Infinity;
    for (const i of quedan) {
      const viaje = tiempos[desde][i + 1];
      const r = llegarA(reloj, viaje, ventanas[i]);
      const coste = viaje + penalizacion(r.desvio, margen);
      if (coste < menor) { menor = coste; elegida = { i, llegada: r.llegada }; }
    }
    orden.push(elegida.i);
    quedan.delete(elegida.i);
    reloj = elegida.llegada + MINUTOS_EN_PUERTA;
    desde = elegida.i + 1;
  }
  return orden;
}

/**
 * Mejorar el recorrido a base de probar cambios y quedarse con los que salen
 * más baratos, hasta que ningún cambio mejore nada.
 *
 * Dos tipos de cambio: dar la vuelta a un tramo (deshace los cruces, que es lo
 * que hace que una ruta parezca un garabato) y mover una parada sola a otro
 * sitio (lo que de verdad arregla las franjas: a veces basta con adelantar una
 * entrega ocho puestos). Con una docena de paradas esto son unos milisegundos.
 */
function mejorar(orden, tiempos, ventanas, salida, margen) {
  const coste = (o) => recorrer(o, tiempos, ventanas, salida, margen).coste;
  let mejor = orden, suCoste = coste(orden);
  const n = orden.length;

  for (let vuelta = 0; vuelta < 40; vuelta++) {
    let mejoro = false;

    for (let a = 0; a < n - 1; a++) {
      for (let b = a + 1; b < n; b++) {
        const vuelta_ = [...mejor.slice(0, a), ...mejor.slice(a, b + 1).reverse(), ...mejor.slice(b + 1)];
        const c = coste(vuelta_);
        if (c < suCoste - 0.01) { mejor = vuelta_; suCoste = c; mejoro = true; }
      }
    }

    for (let de = 0; de < n; de++) {
      for (let a = 0; a < n; a++) {
        if (a === de) continue;
        const resto = mejor.filter((_, k) => k !== de);
        const movida = [...resto.slice(0, a), mejor[de], ...resto.slice(a)];
        const c = coste(movida);
        if (c < suCoste - 0.01) { mejor = movida; suCoste = c; mejoro = true; }
      }
    }

    if (!mejoro) break;
  }
  return mejor;
}

/**
 * Las coordenadas de cada parada: las que trae el pedido, las que ya se
 * buscaron otro día, y las que haya que buscar ahora.
 *
 * Se busca de una en una con un segundo de pausa porque los buscadores son
 * gratis y piden eso a cambio. Solo pasa la primera vez con cada dirección: los
 * pedidos de la web ya vienen situados y el resto se queda en el móvil.
 */
async function puntosDe(paradas, alAvanzar) {
  const cache = leerCache();
  const puntos = paradas.map(p => (esPunto(p) ? { lat: p.lat, lon: p.lon } : cache[claveDireccion(p)] || null));
  const faltan = puntos.reduce((n, p) => n + (p ? 0 : 1), 0);

  let hechas = 0, nuevas = false;
  for (let i = 0; i < paradas.length; i++) {
    if (puntos[i]) continue;
    if (hechas > 0) await espera(1100);
    alAvanzar?.(++hechas, faltan);
    try {
      const { sitio } = await situar(paradas[i].direccion, paradas[i].cp || "");
      if (sitio) {
        puntos[i] = { lat: sitio.lat, lon: sitio.lon };
        cache[claveDireccion(paradas[i])] = puntos[i];
        nuevas = true;
      }
    } catch { /* esa se queda sin situar; las demás siguen */ }
  }

  if (nuevas) guardarCache(cache);
  return puntos;
}

/**
 * Cuánto se tarda en coche de cada punto a cada otro, en minutos.
 *
 * Es una sola petición para toda la ruta, no una por tramo. Son tiempos sin
 * tráfico: OSRM no lo tiene. Para ordenar paradas da igual, porque el atasco
 * afecta más o menos a cualquier orden; para la hora exacta de llegada es un
 * optimista, y por eso se enseña como estimación y no como promesa.
 */
async function matrizDeTiempos(puntos) {
  const coords = puntos.map(p => `${p.lon},${p.lat}`).join(";");
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), 12000);
  try {
    const r = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration`,
      { signal: corte.signal },
    );
    if (!r.ok) throw new Error(`OSRM respondió ${r.status}`);
    const datos = await r.json();
    if (datos.code !== "Ok" || !datos.durations) throw new Error("OSRM no devolvió tiempos");
    return datos.durations.map(fila => fila.map(s => (s == null ? 600 : s / 60)));
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Los kilómetros por carretera desde la tienda hasta cada pedido, para los que
 * no los traen: `{ idDelPedido: 7.4 }`.
 *
 * Hacen falta porque durante un tiempo la gestión los descartaba al aceptar el
 * pedido de la web, y los pedidos escritos a mano nunca los han tenido. Sin
 * ellos, el informe de reparto no puede decir cuántas entregas fueron de menos
 * de 10 km, que es justo lo que se cobra distinto.
 *
 * Se piden en bloque —una consulta por cada noventa pedidos, no una por
 * pedido— y son kilómetros de conducir, no en línea recta: es lo que se cobra.
 * Los que no se puedan situar en el mapa sencillamente no salen en el
 * resultado, y quien llama los deja como estaban.
 */
const PEDIDOS_POR_CONSULTA = 90;

export async function kilometrosDesdeLaTienda(pedidos, alAvanzar) {
  const puntos = await puntosDe(pedidos, alAvanzar);
  const situados = pedidos
    .map((p, i) => ({ p, punto: puntos[i] }))
    .filter(x => x.punto);
  const km = {};

  for (let i = 0; i < situados.length; i += PEDIDOS_POR_CONSULTA) {
    const grupo = situados.slice(i, i + PEDIDOS_POR_CONSULTA);
    const lista = [{ lat: ORIGEN_LAT, lon: ORIGEN_LON }, ...grupo.map(g => g.punto)]
      .map(p => `${p.lon},${p.lat}`).join(";");
    const r = await fetch(
      `https://router.project-osrm.org/table/v1/driving/${lista}?annotations=distance&sources=0`,
    );
    if (!r.ok) throw new Error(`OSRM respondió ${r.status}`);
    const datos = await r.json();
    if (datos.code !== "Ok" || !datos.distances?.[0]) throw new Error("OSRM no devolvió distancias");
    // La fila 0 es la tienda; la columna n+1, el pedido n de este grupo.
    grupo.forEach((g, n) => {
      const metros = datos.distances[0][n + 1];
      if (metros != null) km[g.p.id] = Math.round(metros / 100) / 10;
    });
  }

  return km;
}

/**
 * El orden bueno para un día de reparto.
 *
 * Devuelve, por cada parada, a qué hora se estima que llega y cuántos minutos se
 * sale de su franja (`desvio`: negativo si se adelanta, positivo si se retrasa,
 * 0 si entra en hora). Las direcciones que no se han podido situar en el mapa
 * salen aparte en `sinSituar`: no se pueden ordenar, pero tampoco se pierden.
 *
 * Lanza si no hay forma de calcular (sin red, o ninguna dirección situada).
 * Quien llama se queda entonces con el orden sencillo.
 */
export async function optimizar(paradas, { salida, margen = MARGEN_POR_DEFECTO, alAvanzar } = {}) {
  const puntos = await puntosDe(paradas, alAvanzar);

  const situadas = [];
  const sinSituar = [];
  paradas.forEach((p, i) => (puntos[i] ? situadas : sinSituar).push({ pedido: p, punto: puntos[i] }));
  if (!situadas.length) throw new Error("No se ha podido situar ninguna dirección en el mapa");

  const tiempos = await matrizDeTiempos([
    { lat: ORIGEN_LAT, lon: ORIGEN_LON },
    ...situadas.map(s => s.punto),
  ]);

  const ventanas = situadas.map(s => ventana(s.pedido.rangoHorario));
  const n = situadas.length;
  const orden = mejorar(ordenInicial(n, tiempos, ventanas, salida, margen), tiempos, ventanas, salida, margen);
  const { visita, conduciendo, esperando, fin } = recorrer(orden, tiempos, ventanas, salida, margen);

  return {
    paradas: visita.map(v => ({
      pedido: situadas[v.i].pedido,
      llegada: v.llegada,
      desvio: Math.round(v.desvio),
    })),
    sinSituar: sinSituar.map(s => s.pedido),
    conduciendo: Math.round(conduciendo),
    esperando: Math.round(esperando),
    fin,
  };
}
