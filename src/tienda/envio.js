/**
 * Coste de envío a domicilio en Madrid, según los km por carretera desde el local.
 * Geocodifica con Nominatim (OpenStreetMap) y calcula la ruta con OSRM.
 */

const ORIGEN_LAT = 40.3381
const ORIGEN_LON = -3.6752 // Calle Berrocal 56, 28021 Madrid (Butarque, Villaverde)

export const TARIFA_BASE = 6
export const TEXTO_TARIFAS = '≤10 km: 6 € · 10–12 km: 8 € · más de 12 km: 10 €'

export function tarifaPorKm(km) {
  if (km <= 10) return 6
  if (km <= 12) return 8
  return 10
}

const enMadrid = (r) =>
  parseFloat(r.lat) > 40.2 && parseFloat(r.lat) < 40.7 &&
  parseFloat(r.lon) > -4.0 && parseFloat(r.lon) < -3.4

async function kmHasta(lat, lon) {
  const ruta = await fetch(`https://router.project-osrm.org/route/v1/driving/${ORIGEN_LON},${ORIGEN_LAT};${lon},${lat}?overview=false`)
  const datos = await ruta.json()
  if (datos.code !== 'Ok') return null
  return datos.routes[0].distance / 1000
}

/** Devuelve { km, tarifa } o null si no se pudo calcular. */
export async function calcularEnvio(direccion, cp) {
  try {
    const q = encodeURIComponent(`${direccion}, ${cp}, Madrid, España`)
    const geo = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=5&countrycodes=es`,
      { headers: { 'Accept-Language': 'es' } })
    let punto = (await geo.json()).find(enMadrid)

    // Si la calle no aparece, se usa el centro del código postal.
    if (!punto) {
      const geoCP = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${cp}&country=es&format=json&limit=1`,
        { headers: { 'Accept-Language': 'es' } })
      punto = (await geoCP.json())[0]
      if (!punto) return null
    }

    const km = await kmHasta(punto.lat, punto.lon)
    if (km == null) return null
    return { km: Math.round(km * 10) / 10, tarifa: tarifaPorKm(km) }
  } catch {
    return null
  }
}
