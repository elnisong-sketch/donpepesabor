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

export const DIRECCION_LOCAL = 'Calle Berrocal 7, local 3, 28021 Madrid'
/**
 * Lo que cuesta freír una bandeja, según cuántas unidades lleve: las de 25 y 30
 * pagan lo mismo, y la de 50 (hoy solo el tequeño tradicional) paga más porque
 * lleva más trabajo y más aceite. Lo que no esté en la lista paga la pequeña.
 */
// La de 50 cuesta 6 € para que, con la bandeja a 24 €, frita salga redonda a 30 €.
const COSTO_FRITO_POR_UNIDADES = { 25: 5, 30: 5, 50: 6 }
export const COSTO_FRITO_BASE = 5

export function costoFrito(presentacion) {
  const uds = Number(String(presentacion).match(/\d+/)?.[0])
  return COSTO_FRITO_POR_UNIDADES[uds] ?? COSTO_FRITO_BASE
}
// Las formas de pago viven en ../pedidos.js: las usan también la gestión y la
// app del repartidor, y la regla tiene que ser una sola para los tres.
// Cómo se puede pedir cada producto. Solo "Frito" lleva recargo (costoFrito).
// Los cachitos no tienen opción: se piden tal cual.
const PREP = {
  Congelado: { icono: '❄️', detalle: 'Para freír en casa' },
  Frito:     { icono: '🔥', detalle: 'Listo para comer' },
}
export const preparacionesDe = (p) =>
  /cachito/i.test(p.nombre || '') ? [] : ['Congelado', 'Frito']
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

/**
 * Lo que viene, para ir abriendo boca.
 *
 * Estos productos NO están en Inventario: todavía no se venden, no tienen precio
 * ni stock, y meterlos en la gestión sería ensuciarla con algo que no se puede
 * pedir. Viven aquí, se enseñan en gris al final del catálogo y no se pueden
 * añadir al carrito.
 *
 * TEMPORAL, a propósito: el día que salgan a la venta se crean como productos
 * normales en Inventario y esta lista se vacía. Si esta lista está vacía, la
 * tienda no enseña nada de esto y no hay que tocar nada más.
 */
export const PROXIMAMENTE = [
  { id: 'prox-pan-de-jamon', nombre: 'Pan de Jamón', categoria: 'Otros', foto: 'pan-de-jamon' },
  { id: 'prox-golfeados',    nombre: 'Golfeados',    categoria: 'Otros', foto: 'golfeados' },
]

/**
 * Familias que SIEMPRE se hacen por encargo, con su antelación mínima en horas.
 *
 * Las empanadas, los pastelitos y los cachitos se hornean para cada pedido, así
 * que piden dos días. Y desde el 29/10/2026, los tequeños también: del tequeño
 * solo hay hecho el tradicional, y los demás sabores se preparan al pedirlos.
 *
 * Esto no depende de la etiqueta de Inventario: aunque nadie la ponga, estas
 * familias piden sus 48 h. Si una bandeja concreta necesita más, la etiqueta
 * manda, porque luego se coge el mayor de los dos.
 */

/**
 * Los tequeños que SÍ hay hechos y salen sin esperar. Todo lo demás de la
 * familia pide sus 48 horas.
 *
 * Va por lista de lo que NO espera, y no por lista de sabores que sí esperan,
 * a propósito: el sabor nuevo que se cree en Inventario pide sus 48 h solo, sin
 * que nadie tenga que acordarse de venir a este archivo. Equivocarse hacia
 * esperar hace esperar a un cliente; al revés, le prometemos algo que no se
 * puede hacer.
 *
 * El "con orégano y aceite de oliva" NO está aquí: lleva "Tradicionales" en el
 * nombre, pero cuesta lo mismo que los sabores y se prepara igual.
 */
const TEQUENOS_SIN_ESPERA = [/^teque(ñ|n)os\s+tradicionales$/i]

const esTequenoDeEncargo = (p) =>
  p?.categoria === 'Tequeños' &&
  !TEQUENOS_SIN_ESPERA.some((r) => r.test((p?.nombre || '').trim()))

const HORAS_POR_FAMILIA = [
  [(p) => p?.categoria === 'Empanadas', 48],
  [(p) => p?.categoria === 'Pastelitos', 48],
  [(p) => /cachito/i.test(p?.nombre || ''), 48],
  [esTequenoDeEncargo, 48],
]

/** Antelación mínima del producto por ser de la familia que es. */
export const horasDeFamilia = (p) =>
  Math.max(0, ...HORAS_POR_FAMILIA.filter(([cumple]) => cumple(p)).map(([, h]) => h))

const textoEncargo = (horas) =>
  horas === 24 ? 'Por encargo · 24 h' : horas ? `Por encargo · ${horas} h` : ''

/**
 * Disponibilidad de una bandeja, tal como la ve el cliente.
 *
 * Manda la etiqueta que pone el dueño en Inventario, pero nunca por debajo de lo
 * que pide la familia del producto. El stock NO se mira: hoy está a 0 en todos los
 * productos y la tienda entera saldría agotada.
 */
export function estadoDe(variante, producto) {
  const etiqueta = variante?.etiqueta || ''
  // "Próximamente" es un producto que aún no se vende: se enseña para que la
  // gente lo vaya viendo, pero no se puede pedir. Se pinta igual que agotado
  // (en gris) porque es el mismo gesto: está ahí y no se puede coger.
  if (etiqueta === 'proximamente') return { agotada: true, proxima: true, horas: 0, texto: 'Próximamente' }
  if (etiqueta === 'agotado') return { agotada: true, horas: 0, texto: 'Agotada' }
  const porEtiqueta = etiqueta === '24h' ? 24 : etiqueta === '48h' ? 48 : 0
  const horas = Math.max(porEtiqueta, horasDeFamilia(producto))
  return { agotada: false, horas, texto: textoEncargo(horas) }
}

/** Resumen del producto entero para la tarjeta del catálogo. */
export function estadoProducto(p) {
  const estados = (p.variantes || []).map((v) => estadoDe(v, p))
  const aLaVenta = estados.filter((e) => !e.agotada)
  if (!aLaVenta.length) {
    // Si todas sus bandejas son "próximamente", el producto entero lo es.
    const proxima = estados.length > 0 && estados.every((e) => e.proxima)
    return { agotado: true, proximo: proxima, texto: proxima ? 'Próximamente' : 'Agotado' }
  }
  const horas = Math.min(...aLaVenta.map((e) => e.horas))
  return { agotado: false, texto: textoEncargo(horas) }
}

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
  p11: 'pastelito-mechada-queso-amarillo',
  p12: 'pastelito-pollo-queso-amarillo',
  p13: 'empanadita-carne',
  p14: 'empanadita-pollo',
  p15: 'empanadita-carne-mechada',
  p16: 'empanadita-queso',
  p17: 'empanadita-jamon-y-queso',
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
  if (p.foto) return `/productos/${p.foto}.webp`
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
