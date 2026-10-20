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

const ORIGEN_LAT = 40.3381
const ORIGEN_LON = -3.6752 // Calle Berrocal 56, 28021 Madrid (Butarque, Villaverde)

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

/** De los resultados, el que cuadre con el código postal; si no, uno de Madrid capital. */
function elegir(candidatos, cp) {
  return candidatos.find((c) => c.cp === cp)
    || candidatos.find((c) => c.ciudad.toLowerCase() === 'madrid')
    || null
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
 * Devuelve siempre un objeto con `estado`:
 * - 'ok':          dirección encontrada, con km y tarifa.
 * - 'no':          los buscadores respondieron y esa dirección no existe.
 * - 'sin-revisar': no se pudo preguntar (sin red o servicio caído); se deja pedir.
 */
export async function calcularEnvio(direccion, cp) {
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

  if (!alguienRespondio) return { estado: 'sin-revisar', tarifa: TARIFA_BASE }

  const sitio = elegir(candidatos, cp)
  if (!sitio) return { estado: 'no' }

  try {
    const km = await kmHasta(sitio.lat, sitio.lon)
    if (km == null) return { estado: 'sin-revisar', tarifa: TARIFA_BASE }
    return { estado: 'ok', km: Math.round(km * 10) / 10, tarifa: tarifaPorKm(km) }
  } catch {
    return { estado: 'sin-revisar', tarifa: TARIFA_BASE }
  }
}
