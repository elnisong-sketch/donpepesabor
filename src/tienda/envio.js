/**
 * Coste de envío a domicilio en Madrid, según los km por carretera desde el local.
 * Geocodifica con Nominatim (OpenStreetMap) y calcula la ruta con OSRM.
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

/**
 * Hay nombres de calle repetidos por toda la provincia: "Calle Toledo 20" existe en
 * el centro de Madrid, en Parla y en Getafe. Antes se cogía el primer resultado que
 * cayera dentro de la Comunidad y salían 22 km por una dirección del centro, así que
 * manda el código postal que ha escrito el cliente.
 */
function mejorResultado(resultados, cp) {
  const lista = Array.isArray(resultados) ? resultados : []
  const porCp = lista.find((r) => r.address?.postcode === cp)
  if (porCp) return porCp

  const municipio = (r) =>
    r.address?.city || r.address?.town || r.address?.village || r.address?.municipality || ''
  return lista.find((r) => municipio(r).toLowerCase() === 'madrid') || null
}

async function buscar(params) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'Accept-Language': 'es' } })
  return r.ok ? r.json() : []
}

async function kmHasta(lat, lon) {
  const ruta = await fetch(`https://router.project-osrm.org/route/v1/driving/${ORIGEN_LON},${ORIGEN_LAT};${lon},${lat}?overview=false`)
  const datos = await ruta.json()
  if (datos.code !== 'Ok') return null
  return datos.routes[0].distance / 1000
}

/** Devuelve { km, tarifa, aproximado } o null si no se pudo calcular. */
export async function calcularEnvio(direccion, cp) {
  try {
    // Por campos separados (calle / código postal), que acierta bastante más.
    let punto = mejorResultado(await buscar(new URLSearchParams({
      street: direccion, postalcode: cp, country: 'España', countrycodes: 'es',
      format: 'json', addressdetails: '1', limit: '8',
    })), cp)

    // Si no, en texto libre, por si la dirección viene desordenada.
    if (!punto) {
      punto = mejorResultado(await buscar(new URLSearchParams({
        q: `${direccion}, ${cp}, Madrid, España`, countrycodes: 'es',
        format: 'json', addressdetails: '1', limit: '8',
      })), cp)
    }

    // Último recurso: el centro del código postal. La distancia sale aproximada.
    let aproximado = false
    if (!punto) {
      punto = (await buscar(new URLSearchParams({ postalcode: cp, country: 'es', format: 'json', limit: '1' })))[0]
      aproximado = true
      if (!punto) return null
    }

    const km = await kmHasta(punto.lat, punto.lon)
    if (km == null) return null
    return { km: Math.round(km * 10) / 10, tarifa: tarifaPorKm(km), aproximado }
  } catch {
    return null
  }
}
