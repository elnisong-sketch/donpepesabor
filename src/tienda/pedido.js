/**
 * Cierre del pedido: se deja registrado en la hoja de Google y en la bandeja de
 * entrada de la gestión, y después se abre WhatsApp con el pedido ya escrito.
 * Si algún registro falla o tarda, se sigue a WhatsApp igual: perder el registro
 * es malo, perder el pedido es peor.
 */

import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase.js'
import { fechaLegible, whatsappDe } from '../pedidos.js'
import { FRANJAS, SIN_PREFERENCIA, textoFranja } from '../franjas.js'
import { DIRECCION_LOCAL, SHEETS_URL, WHATSAPP, costoFrito, etiquetaPrep, eur } from './catalogo.js'

// Viven en ../pedidos.js porque la gestión también las necesita; se reexportan
// para que el resto de la tienda las siga pidiendo aquí.
export { fechaLegible, whatsappDe }

/**
 * La hora del pedido, tal como se guarda y se enseña.
 *
 * Sin franja elegida se guarda "Cualquier hora", que es información útil: son
 * los pedidos que se pueden encajar donde sobre hueco.
 */
export function horarioDe(d) {
  const f = FRANJAS.find((x) => x.id === d.franja)
  return f ? textoFranja(f) : SIN_PREFERENCIA
}

/**
 * Referencia de la solicitud, tal como la ve el cliente: S261027-143207.
 *
 * S de solicitud, el día en que se pide, y la hora con segundos haciendo de
 * correlativo. No es un contador de verdad y no pretende serlo: sube a lo largo
 * del día, vuelve a empezar cada mañana y deja huecos, que son los carritos que
 * nadie llegó a enviar.
 *
 * Un contador de verdad habría que guardarlo en la nube con permiso de escritura
 * público (la tienda no puede leer los pedidos: son datos de clientes), y eso
 * cualquiera lo puede inflar y deja al cliente sin número si falla la conexión.
 * El número bueno —correlativo limpio por día de entrega— lo pone la gestión al
 * aceptar el pedido: `siguienteCodigo` en pedidos.js.
 */
export function nuevoCodigo() {
  const d = new Date()
  const dos = (n) => String(n).padStart(2, '0')
  const dia = `${dos(d.getFullYear() % 100)}${dos(d.getMonth() + 1)}${dos(d.getDate())}`
  return `S${dia}-${dos(d.getHours())}${dos(d.getMinutes())}${dos(d.getSeconds())}`
}

export function hoyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Primer día en que se puede entregar el carrito, según los productos por encargo. */
export function fechaMinima(items) {
  const horas = Math.max(0, ...items.map((l) => l.horasEncargo || 0))
  const d = new Date()
  d.setDate(d.getDate() + Math.ceil(horas / 24))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Los productos del carrito que obligan a esperar, para poder nombrarlos en el
 * aviso. Decir "las empanadas se hacen por encargo" se entiende; decir "hay
 * productos por encargo" obliga al cliente a adivinar cuál.
 */
export function porEncargoDe(items) {
  const nombres = [...new Set(items.filter((l) => (l.horasEncargo || 0) > 0).map((l) => l.nombre))]
  if (!nombres.length) return ''
  if (nombres.length === 1) return nombres[0]
  return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1]
}

export function totalesDe(items, envio) {
  const productos = items.reduce((s, l) => s + l.precio * l.cantidad, 0)
  const fritas = items.filter((l) => l.preparacion === 'Frito')
  const bandejasFritas = fritas.reduce((s, l) => s + l.cantidad, 0)
  // Cada bandeja paga según su tamaño, así que no vale multiplicar por un precio único.
  const fritura = fritas.reduce((s, l) => s + costoFrito(l.presentacion) * l.cantidad, 0)
  const costoEnvio = items.length ? envio : 0
  return { productos, bandejasFritas, fritura, envio: costoEnvio, total: productos + fritura + costoEnvio }
}

const lineaProducto = (l) =>
  `• ${l.nombre} — ${l.presentacion}${l.preparacion ? ' · ' + etiquetaPrep(l.preparacion) : ''} (x${l.cantidad}) — ${eur(l.precio * l.cantidad)}`

/** Texto que recibe la tienda por WhatsApp (los asteriscos son negritas). */
export function redactarMensaje(d, items, envio, distancia) {
  const t = totalesDe(items, envio)
  const L = ['¡Hola! Quiero hacer un pedido 🧀', '']
  L.push(`*Pedido:* ${d.codigo}`)
  L.push(`*Nombre:* ${d.nombre || '—'}`)
  L.push(`*Teléfono:* ${d.telefono || '—'}`)
  const wa = whatsappDe(d.telefono)
  if (wa) L.push(`https://wa.me/${wa}`)
  if (d.tipoEntrega === 'Domicilio') {
    const km = distancia?.km ? ` (${distancia.km} km)` : ''
    L.push(`*Entrega:* 🚚 A domicilio — ${d.direccion || '—'}, ${d.cp || '—'}${km}`)
    if (distancia?.estado !== 'ok') L.push('⚠️ *Dirección sin comprobar en el mapa: confirmadla antes de salir*')
  } else {
    L.push(`*Entrega:* 🏪 Recogida en ${DIRECCION_LOCAL}`)
  }
  L.push(`*Día:* ${fechaLegible(d.fechaEntrega)} · ${horarioDe(d)}`)
  L.push(`*Pago:* ${d.formaPago || '—'}`, '')
  L.push('*Productos:*')
  for (const l of items) L.push(lineaProducto(l))
  L.push('')
  L.push(`Productos: ${eur(t.productos)}`)
  if (t.fritura) L.push(`Fritura (${t.bandejasFritas} ${t.bandejasFritas === 1 ? 'bandeja' : 'bandejas'}): ${eur(t.fritura)}`)
  if (d.tipoEntrega === 'Domicilio') L.push(`Envío: ${eur(t.envio)}`)
  L.push(`*TOTAL: ${eur(t.total)}*`)
  if (d.nota?.trim()) L.push('', `*Nota:* ${d.nota.trim()}`)
  return L.join('\n')
}

/**
 * Registra el pedido en la hoja de Google.
 *
 * PARADO desde el 26/10/2026 por decisión del dueño: los pedidos van solo a la
 * gestión (`registrarEnNube`). Se deja escrito para poder volver a encenderlo:
 * basta con llamarla otra vez desde `Carrito.jsx`, junto a `registrarEnNube`.
 */
export function registrarEnHoja(d, items, envio) {
  const t = totalesDe(items, envio)
  const domicilio = d.tipoEntrega === 'Domicilio'
  const params = new URLSearchParams({
    id: d.codigo,
    fecha: d.fechaEntrega,
    horario: horarioDe(d),
    cliente: d.nombre.trim(),
    telefono: d.telefono.trim(),
    cp: domicilio ? d.cp.trim() : '',
    direccion: domicilio ? d.direccion.trim() : '',
    productos: items.map((l) => `• ${l.nombre} (${l.presentacion}) x${l.cantidad}${l.preparacion ? ` [${l.preparacion}]` : ''}`).join('\n'),
    pago: d.formaPago,
    subtotal: t.productos.toFixed(2) + ' €',
    servicio: t.fritura.toFixed(2) + ' €',
    envio: t.envio.toFixed(2) + ' €',
    total: t.total.toFixed(2) + ' €',
    notas: (domicilio ? '🚚 Domicilio' : '🏪 Recogida en tienda') + (d.nota?.trim() ? ' | ' + d.nota.trim() : ''),
  })
  // keepalive: la petición termina aunque la página se vaya a WhatsApp.
  return fetch(`${SHEETS_URL}?${params}`, { mode: 'no-cors', keepalive: true })
}

/**
 * El pedido con los nombres de campo que usa la gestión, para que se pueda volcar
 * en 📦 Pedidos sin tocar nada. Dos cosas que no se pueden cambiar a la ligera:
 *
 * - `items[].subtotal` NO lleva el recargo de fritura: la gestión lo suma aparte
 *   desde `servicio`. Meterlo en los dos sitios cobraría dos veces.
 * - `items[].preparacion` es lo que mira `preparacionDe`; `nombreProducto` (y no
 *   `nombre`) es como la gestión llama al producto.
 */
export function paraGestion(d, items, envio, distancia) {
  const t = totalesDe(items, envio)
  const domicilio = d.tipoEntrega === 'Domicilio'
  return {
    codigo: d.codigo,
    nombre: d.nombre.trim(),
    telefono: d.telefono.trim(),
    direccion: domicilio ? d.direccion.trim() : '',
    cp: domicilio ? d.cp.trim() : '',
    tipoEntrega: d.tipoEntrega,
    formaPago: d.formaPago,
    fecha: d.fechaEntrega,
    rangoHorario: horarioDe(d),
    nota: d.nota?.trim() || '',
    km: distancia?.km ?? null,
    direccionComprobada: distancia?.estado === 'ok',
    envio: t.envio,
    servicio: t.fritura,
    items: items.map((l) => ({
      productoId: l.productoId,
      nombreProducto: l.nombre,
      presentacion: l.presentacion,
      preparacion: l.preparacion || 'Congelado',
      cantidad: l.cantidad,
      precio: l.precio,
      subtotal: l.precio * l.cantidad,
    })),
  }
}

/**
 * Deja el pedido en la bandeja de entrada de la gestión (colección `pedidosWeb`).
 * Ahí no es todavía un pedido: el dueño lo acepta o lo descarta desde 📦 Pedidos.
 * La tienda es pública y cualquiera puede escribir aquí, por eso no entra directo.
 */
export function registrarEnNube(d, items, envio, distancia) {
  return addDoc(collection(db, 'pedidosWeb'), {
    ...paraGestion(d, items, envio, distancia),
    creado: serverTimestamp(),
  })
}

/** Espera como mucho `ms`; pasado el plazo se sigue igual. */
export function conPlazo(promesa, ms = 2500) {
  return Promise.race([promesa, new Promise((r) => setTimeout(r, ms))])
}

/**
 * Abre WhatsApp navegando, no con window.open: en el móvil una ventana nueva
 * después de un await se bloquea como emergente.
 */
export function irAWhatsapp(mensaje) {
  window.location.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensaje)}`
}
