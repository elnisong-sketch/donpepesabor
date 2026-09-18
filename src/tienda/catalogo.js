/**
 * Datos fijos de la tienda: contacto, precios de servicio y fotos de producto.
 *
 * Los productos y sus precios NO están aquí: se leen de Firestore (datos/productos),
 * que es lo que se edita desde la gestión. Aquí solo va lo que la gestión no guarda.
 */

// Número de WhatsApp que recibe los pedidos, con prefijo de país y sin "+" ni espacios.
export const WHATSAPP = '34658083047'

// Hoja de Google que registra cada pedido (Apps Script).
export const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbySjQNlkoTT_Wo28xxCKRgk41QvXaECsItCooxiqmwxdn5xNqUORVtHWCX7hhAC8gSY/exec'

export const DIRECCION_LOCAL = 'Berrocal 56, 28021 Madrid'
export const COSTO_FRITO = 5          // € por bandeja frita
export const PAGOS = ['Bizum', 'Efectivo', 'Transferencia', 'Tarjeta']
export const PREPARACIONES = ['Congelado', 'Frito']

export const eur = (n) =>
  Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

// Foto de cada producto, por su id en la gestión. Los que no tienen foto propia usan
// la más parecida; los nuevos que se creen en la gestión, la de su categoría.
const FOTOS = {
  p1: 'tequeno-tradicional',
  p2: 'tequeno-guayaba-y-queso',
  p3: 'tequeno-salchicha-y-queso',
  p4: 'tequeno-platano-y-queso',
  p5: 'tequeno-jamon-y-queso',
  p6: 'tequeno-chocolate-y-queso',
  p7: 'pastelito-pollo',
  p8: 'pastelito-molida',
  p9: 'pastelito-molida',
  p10: 'pastelito-queso',
  p11: 'pastelito-molida',
  p12: 'pastelito-pollo',
  p13: 'empanadita-carne',
  p14: 'empanadita-pollo',
  p15: 'empanadita-carne',
  p16: 'empanadita-queso',
  p17: 'empanadita-queso',
  p18: 'cachito-jamon-y-queso',
}

const FOTO_CATEGORIA = {
  'Tequeños': 'tequeno-tradicional',
  'Pastelitos': 'pastelito-pollo',
  'Empanadas': 'empanadita-carne',
  'Otros': 'cachito-jamon',
}

// Productos creados desde la gestión (con id aleatorio) que se reconocen por el nombre.
const FOTO_POR_NOMBRE = [
  [/or[eé]gano/i, 'tequeno-tradicional-oregano'],
]

export function fotoDe(p) {
  const porNombre = FOTO_POR_NOMBRE.find(([re]) => re.test(p.nombre || ''))?.[1]
  const nombre = FOTOS[p.id] || porNombre || FOTO_CATEGORIA[p.categoria] || 'tequeno-tradicional'
  return `/productos/${nombre}.webp`
}

export const precioDesde = (p) => Math.min(...(p.variantes || []).map((v) => v.precio || 0))

// "Bandeja 25" → "25 uds"
export const unidades = (presentacion) => {
  const n = String(presentacion).match(/\d+/)
  return n ? `${n[0]} uds` : presentacion
}
