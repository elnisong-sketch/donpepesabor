/**
 * Comprobación de la dirección y coste del envío.
 *
 * Se usa Photon (photon.komoot.io) como buscador principal y Nominatim como
 * respaldo. Photon entiende mejor las direcciones españolas con número y acepta
 * peticiones desde el navegador sin bloquearlas; Nominatim, con la misma consulta,
 * devolvía "Calle Toledo 20" de Parla para un código postal del centro de Madrid.
 *
 * Importante: una cosa es que la dirección NO EXISTA (hay que avisar y no dejar
 * pedir) y otra que el buscador esté caído (no se puede castigar al cliente por
 * eso: se deja pedir con la tarifa base y se avisa de que está sin comprobar).
 */

export const ORIGEN_LAT = 40.3381
export const ORIGEN_LON = -3.6752 // Calle Berrocal, 28021 Madrid (Butarque, Villaverde). Es el punto de la calle,
// no el portal: ningun buscador tiene numeros aqui, y la calle entera mide 300 m.

export const TARIFA_BASE = 6
export const TEXTO_TARIFAS = 'Hasta 10 km: 6 € · de 10 a 15 km: 8 € · más de 15 km: 10 €'

/**
 * Los tres tramos de distancia con los que se cobra el envío.
 *
 * Están aquí, junto a la tarifa, porque son la misma decisión: si algún día se
 * cambia dónde empieza a costar más caro, se cambia en un sitio y lo siguen
 * tanto la tienda al cobrar como el informe de reparto al clasificar.
 */
export const TRAMOS_ENVIO = [
  { id: 'corto', etiqueta: 'Menos de 10 km', hasta: 10, tarifa: 6 },
  { id: 'medio', etiqueta: 'De 10 a 15 km', hasta: 15, tarifa: 8 },
  { id: 'largo', etiqueta: 'Más de 15 km', hasta: Infinity, tarifa: 10 },
]

/** En qué tramo cae una distancia, o null si no hay distancia medida. */
export const tramoDe = (km) =>
  Number.isFinite(km) ? TRAMOS_ENVIO.find((t) => km <= t.hasta) : null

export const tarifaPorKm = (km) => (tramoDe(km) || TRAMOS_ENVIO[0]).tarifa

/** Una petición que no puede quedarse colgada: pasados unos segundos, se abandona. */
async function pedir(url, ms = 7000) {
  const corte = new AbortController()
  const reloj = setTimeout(() => corte.abort(), ms)
  try {
    const r = await fetch(url, { signal: corte.signal })
    if (!r.ok) throw new Error(`respuesta ${r.status}`)
    return await r.json()
  } finally {
    clearTimeout(reloj)
  }
}

const ciudadDe = (p) => p.city || p.town || p.village || p.district || p.county || ''

/**
 * Trozos de dirección que son el DENTRO del edificio, no el edificio.
 *
 * El buscador los toma como parte del nombre de la calle, no encuentra ninguna
 * que se llame así y devuelve cero resultados. Pasó de verdad el 29/10/2026 con
 * "Avenida de la constitución 39, piso 2, escalera derecha, puerta E, 28821":
 * cero resultados en los dos buscadores, la tienda cobró la tarifa base de 6 €
 * y el reparto era a Coslada, a 18,5 km, que son 10 €.
 */
const DENTRO_DEL_EDIFICIO = new RegExp(
  '^\\s*(' +
  'pisos?|planta|puertas?|pta|escaleras?|esc|bajo|bj|portal|local|oficina|' +
  'letra|izquierda|izqda|izq|derecha|dcha|der|[aá]tico|entresuelo|' +
  '\\d{0,3}\\s*[ºª]|' +          // "3º", "2ª"
  '\\d{1,3}\\s*[a-záéíóúñ]\\s*$' + // "1 A", "2B": piso y puerta sin la "º"
  ')', 'i')

/**
 * Lo que va al final pegado y tampoco es la calle: "3ºB", "bajo", "ático".
 *
 * Un número suelto al final NO se quita: "Calle Mayor, 10" es como mucha gente
 * escribe el número del portal, y quitárselo dejaría la calle sin número.
 */
const COLA_DEL_EDIFICIO = /\s+(\d{0,3}\s*[ºª]\s*[a-z]?|bajo|bj|[aá]tico|entresuelo)\s*$/i

/**
 * La dirección tal como hay que BUSCARLA en el mapa: la calle y el número, sin
 * el piso, la escalera ni la puerta.
 *
 * Lo que se guarda en el pedido sigue siendo lo que escribió el cliente,
 * enterito: el repartidor necesita el piso para llamar al timbre. Esto es solo
 * para preguntarle al mapa, que de puertas para adentro no sabe nada.
 *
 * Se corta en la primera coma que ya habla del interior, y si no hay comas se
 * le quita la cola. Si no queda nada aprovechable, se busca lo que vino, que es
 * como se hacía antes y peor no va a salir.
 */
export function direccionParaBuscar(direccion) {
  const partes = String(direccion || '').split(',')
  const calle = []
  for (const p of partes) {
    if (DENTRO_DEL_EDIFICIO.test(p)) break
    calle.push(p)
  }
  if (!calle.length) return String(direccion || '').trim()
  const limpia = calle.join(',').replace(COLA_DEL_EDIFICIO, '').trim()
  return limpia || String(direccion || '').trim()
}

/** Distancia en línea recta desde la tienda, solo para ordenar candidatos. */
function lejania(c) {
  const dx = (c.lon - ORIGEN_LON) * 84
  const dy = (c.lat - ORIGEN_LAT) * 111
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Cuál de los resultados es la dirección del cliente.
 *
 * Antes se exigía que el código postal coincidiera EXACTO o que la ciudad se
 * llamara "Madrid". Eso dejaba fuera a media provincia: una calle de Móstoles
 * con un código postal que el mapa no tiene (o tiene el de al lado) se daba por
 * inexistente y al cliente no se le dejaba pedir. Pasó de verdad.
 *
 * Ahora manda la cercanía: de todo lo que esté en la provincia (28xxx) o a menos
 * de 40 km de la tienda, se coge lo más cerca. El código postal exacto solo sirve
 * para desempatar, no para descartar.
 */
function elegir(candidatos, cp) {
  const exacto = candidatos.find((c) => c.cp === cp)
  if (exacto) return exacto

  const provincia = candidatos.filter((c) => c.cp.startsWith('28') || lejania(c) <= 40)
  if (!provincia.length) return null
  return provincia.sort((a, b) => lejania(a) - lejania(b))[0]
}

async function buscarEnPhoton(direccion, cp) {
  const datos = await pedir('https://photon.komoot.io/api/?' + new URLSearchParams({
    q: `${direccion}, ${cp} Madrid`, limit: '10', lat: String(ORIGEN_LAT), lon: String(ORIGEN_LON),
  }))
  return (datos.features || []).map((f) => ({
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    cp: f.properties.postcode || '',
    ciudad: ciudadDe(f.properties),
  }))
}

/** Dónde cae un código postal, sin calle: el punto central de esa zona. */
async function buscarZona(cp) {
  const datos = await pedir('https://photon.komoot.io/api/?' + new URLSearchParams({
    q: `${cp}, España`, limit: '5', lat: String(ORIGEN_LAT), lon: String(ORIGEN_LON),
  }))
  return (datos.features || []).map((f) => ({
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    cp: f.properties.postcode || '',
    ciudad: ciudadDe(f.properties),
  }))
}

async function buscarEnNominatim(direccion, cp) {
  const datos = await pedir('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
    street: direccion, postalcode: cp, countrycodes: 'es',
    format: 'json', addressdetails: '1', limit: '8',
  }))
  return (datos || []).map((r) => ({
    lat: parseFloat(r.lat), lon: parseFloat(r.lon),
    cp: r.address?.postcode || '', ciudad: ciudadDe(r.address || {}),
  }))
}

async function kmHasta(lat, lon) {
  const datos = await pedir(`https://router.project-osrm.org/route/v1/driving/${ORIGEN_LON},${ORIGEN_LAT};${lon},${lat}?overview=false`)
  if (datos.code !== 'Ok') return null
  return datos.routes[0].distance / 1000
}

/**
 * Dónde cae una dirección en el mapa: `{ lat, lon }`, o null si no se sitúa.
 *
 * Está suelta de `calcularEnvio` porque la usa también la app del repartidor
 * para ordenar la ruta del día, y ahí los km desde la tienda no sirven de nada:
 * lo que hace falta es el punto, para medir de un portal al siguiente.
 *
 * `estado` distingue "no existe" de "no se pudo preguntar", que es una
 * diferencia que importa en los dos sitios: lo primero se avisa, lo segundo se
 * reintenta luego.
 */
export async function situar(direccionCompleta, cp) {
  // Al mapa se le pregunta por la calle y el número, nunca por el piso.
  const direccion = direccionParaBuscar(direccionCompleta)
  let alguienRespondio = false
  let candidatos = []

  try {
    candidatos = await buscarEnPhoton(direccion, cp)
    alguienRespondio = true
  } catch { /* se intenta con el respaldo */ }

  if (!candidatos.length) {
    try {
      candidatos = await buscarEnNominatim(direccion, cp)
      alguienRespondio = true
    } catch { /* ninguno de los dos contestó */ }
  }

  if (!alguienRespondio) return { estado: 'sin-revisar', sitio: null }

  const sitio = elegir(candidatos, cp)
  if (sitio) return { estado: 'ok', sitio }

  /**
   * ÚLTIMO INTENTO: el código postal a secas.
   *
   * Si la calle no aparece —mal escrita, recién abierta, o el mapa no la
   * tiene— el código postal todavía sitúa el pedido en su zona. Para cobrar
   * basta de sobra: los tramos son de 10 y 15 km y un código postal mide mucho
   * menos. Medido en seis zonas (Coslada, centro, Usera, Getafe, Móstoles y
   * Chamartín), la diferencia iba de 200 m a 1,2 km y la tarifa salía la misma
   * en las seis.
   *
   * Esto es lo que evita el fallo del 29/10/2026: un reparto a Coslada cobrado
   * a 6 € cuando eran 10. Ojo, arregla EL DINERO, no la dirección: el portal
   * sigue sin confirmar y por eso el estado es 'aproximado' y no 'ok'.
   */
  try {
    const zona = (await buscarZona(cp)).find((c) => c.cp === cp)
    if (zona) return { estado: 'aproximado', sitio: zona }
  } catch { /* ni con el código postal; se devuelve 'no' */ }

  return { estado: 'no', sitio: null }
}

/**
 * Devuelve siempre un objeto con `estado`:
 * - 'ok':          portal encontrado. Km y tarifa exactos.
 * - 'aproximado':  el portal no, pero el código postal sí. Km y tarifa BUENOS
 *                  (el error es de cientos de metros), dirección por confirmar.
 * - 'no':          ni el portal ni el código postal. Tarifa base y a confirmar.
 * - 'sin-revisar': no se pudo preguntar (sin red o servicio caído).
 *
 * Ninguno impide pedir. Antes 'no' dejaba el botón muerto y había clientes que
 * no podían comprar; perder un pedido es peor que llevar una dirección por
 * confirmar, que se arregla con un mensaje de WhatsApp.
 *
 * Las coordenadas se devuelven SIEMPRE que se haya situado algo, aunque falle
 * el cálculo de los kilómetros: el repartidor las necesita para ordenar la
 * ruta, y una cosa no tiene que ver con la otra.
 */
export async function calcularEnvio(direccion, cp) {
  const { estado, sitio } = await situar(direccion, cp)
  if (!sitio) return { estado, tarifa: TARIFA_BASE }

  const punto = { lat: sitio.lat, lon: sitio.lon }
  try {
    const km = await kmHasta(sitio.lat, sitio.lon)
    if (km == null) return { estado: 'sin-revisar', tarifa: TARIFA_BASE, ...punto }
    // Con el código postal el cobro es bueno, pero la dirección sigue sin
    // confirmar: se conserva 'aproximado' para que la gestión lo marque.
    return { estado, km: Math.round(km * 10) / 10, tarifa: tarifaPorKm(km), ...punto }
  } catch {
    return { estado: 'sin-revisar', tarifa: TARIFA_BASE, ...punto }
  }
}
