/**
 * Datos fijos de la tienda: contacto, precios de servicio y fotos de producto.
 *
 * Los productos y sus precios NO están aquí: se leen de Firestore (datos/productos),
 * que es lo que se edita desde la gestión. Aquí solo va lo que la gestión no guarda.
 */

// Número de WhatsApp que recibe los pedidos, con prefijo de país y sin "+" ni espacios.
export const WHATSAPP = '34604136371'

// Hoja de Google que registra cada pedido (Apps Script).
export const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbySjQNlkoTT_Wo28xxCKRgk41QvXaECsItCooxiqmwxdn5xNqUORVtHWCX7hhAC8gSY/exec'

export const DIRECCION_LOCAL = 'Calle Berrocal 56, 28021 Madrid'
export const COSTO_FRITO = 5          // € por bandeja frita
export const PAGOS = ['Bizum', 'Efectivo', 'Transferencia', 'Tarjeta']
// Cómo se puede pedir cada producto. Solo "Frito" lleva recargo (COSTO_FRITO).
const PREP = {
  Congelado: { icono: '❄️', detalle: 'Para freír en casa' },
  Frito:     { icono: '🔥', detalle: 'Listo para comer' },
  Crudo:     { icono: '🥐', detalle: 'Para hornear en casa' },
  Horneado:  { icono: '🔥', detalle: 'Listo para comer' },
}
export const preparacionesDe = (p) =>
  /cachito/i.test(p.nombre || '') ? ['Crudo', 'Horneado'] : ['Congelado', 'Frito']
export const etiquetaPrep = (prep) => `${PREP[prep]?.icono || ''} ${prep}`.trim()
export const detallePrep = (prep) => PREP[prep]?.detalle || ''

// Prefijos del teléfono del cliente. España primero, por defecto.
export const PREFIJOS = [
  ['34', '🇪🇸', 'España'],
  ['58', '🇻🇪', 'Venezuela'],
  ['57', '🇨🇴', 'Colombia'],
  ['51', '🇵🇪', 'Perú'],
  ['593', '🇪🇨', 'Ecuador'],
  ['54', '🇦🇷', 'Argentina'],
  ['56', '🇨🇱', 'Chile'],
  ['52', '🇲🇽', 'México'],
  ['1', '🇺🇸', 'EE. UU.'],
  ['1809', '🇩🇴', 'Rep. Dominicana'],
  ['53', '🇨🇺', 'Cuba'],
  ['591', '🇧🇴', 'Bolivia'],
  ['598', '🇺🇾', 'Uruguay'],
  ['595', '🇵🇾', 'Paraguay'],
  ['504', '🇭🇳', 'Honduras'],
  ['44', '🇬🇧', 'Reino Unido'],
  ['33', '🇫🇷', 'Francia'],
  ['351', '🇵🇹', 'Portugal'],
  ['39', '🇮🇹', 'Italia'],
  ['49', '🇩🇪', 'Alemania'],
]

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
  p9: 'pastelito-mechada',
  p10: 'pastelito-jamon-y-queso',
  p11: 'pastelito-mechada',
  p12: 'pastelito-pollo',
  p13: 'empanadita-carne',
  p14: 'empanadita-pollo',
  p15: 'empanadita-carne-mechada',
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
