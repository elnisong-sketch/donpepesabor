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

export function tarifaPorKm(km) {
  if (km <= 10) return 6
  if (km <= 15) return 8
  return 10
}

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
export async function situar(direccion, cp) {
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
  return { estado: sitio ? 'ok' : 'no', sitio }
}

/**
 * Devuelve siempre un objeto con `estado`:
 * - 'ok':          dirección encontrada, con km, tarifa y coordenadas.
 * - 'no':          no se ha podido situar en el mapa. AVISA, pero NO bloquea.
 * - 'sin-revisar': no se pudo preguntar (sin red o servicio caído); se deja pedir.
 *
 * Ninguno de los tres impide pedir. Antes 'no' dejaba el botón muerto y había
 * clientes que no podían comprar; perder un pedido es peor que llevar una
 * dirección por confirmar, que se arregla con un mensaje de WhatsApp.
 *
 * Las coordenadas se devuelven SIEMPRE que se haya encontrado el portal, aunque
 * falle el cálculo de los kilómetros: el repartidor las necesita para ordenar la
 * ruta, y una cosa no tiene que ver con la otra. Antes se calculaban y se
 * tiraban, y luego había que volver a preguntarlas una por una.
 */
export async function calcularEnvio(direccion, cp) {
  const { estado, sitio } = await situar(direccion, cp)
  if (!sitio) return { estado, tarifa: TARIFA_BASE }

  const punto = { lat: sitio.lat, lon: sitio.lon }
  try {
    const km = await kmHasta(sitio.lat, sitio.lon)
    if (km == null) return { estado: 'sin-revisar', tarifa: TARIFA_BASE, ...punto }
    return { estado: 'ok', km: Math.round(km * 10) / 10, tarifa: tarifaPorKm(km), ...punto }
  } catch {
    return { estado: 'sin-revisar', tarifa: TARIFA_BASE, ...punto }
  }
}
