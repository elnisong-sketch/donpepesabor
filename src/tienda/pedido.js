/**
 * Cierre del pedido: se registra en la hoja de Google y después se abre WhatsApp
 * con el pedido ya escrito. Si la hoja falla o tarda, se sigue a WhatsApp igual:
 * perder el registro es malo, perder el pedido es peor.
 */

import { COSTO_FRITO, DIRECCION_LOCAL, SHEETS_URL, WHATSAPP, eur } from './catalogo.js'

export function nuevoCodigo() {
  return 'DP-' + String(Math.floor(1000 + Math.random() * 9000))
}

export function hoyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "2026-09-19" → "viernes 19/09"
export function fechaLegible(iso) {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-').map(Number)
  const dia = new Date(a, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long' })
  return `${dia} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

export function totalesDe(items, envio) {
  const productos = items.reduce((s, l) => s + l.precio * l.cantidad, 0)
  const bandejasFritas = items.filter((l) => l.preparacion === 'Frito').reduce((s, l) => s + l.cantidad, 0)
  const fritura = bandejasFritas * COSTO_FRITO
  const costoEnvio = items.length ? envio : 0
  return { productos, bandejasFritas, fritura, envio: costoEnvio, total: productos + fritura + costoEnvio }
}

const lineaProducto = (l) =>
  `• ${l.nombre} — ${l.presentacion} · ${l.preparacion === 'Frito' ? '🔥 Frito' : '❄️ Congelado'} (x${l.cantidad}) — ${eur(l.precio * l.cantidad)}`

/** Texto que recibe la tienda por WhatsApp (los asteriscos son negritas). */
export function redactarMensaje(d, items, envio, distancia) {
  const t = totalesDe(items, envio)
  const L = ['¡Hola! Quiero hacer un pedido 🧀', '']
  L.push(`*Pedido:* ${d.codigo}`)
  L.push(`*Nombre:* ${d.nombre || '—'}`)
  L.push(`*Teléfono:* ${d.telefono || '—'}`)
  if (d.tipoEntrega === 'Domicilio') {
    const km = distancia ? ` (${distancia.km} km)` : ''
    L.push(`*Entrega:* 🚚 A domicilio — ${d.direccion || '—'}, ${d.cp || '—'}${km}`)
  } else {
    L.push(`*Entrega:* 🏪 Recogida en ${DIRECCION_LOCAL}`)
  }
  L.push(`*Día:* ${fechaLegible(d.fechaEntrega)} · de ${d.horaDesde || '—'} a ${d.horaHasta || '—'}`)
  L.push(`*Pago:* ${d.formaPago || '—'}`, '')
  L.push('*Productos:*')
  for (const l of items) L.push(lineaProducto(l))
  L.push('')
  L.push(`Productos: ${eur(t.productos)}`)
  if (t.fritura) L.push(`Fritura (${t.bandejasFritas} × ${eur(COSTO_FRITO)}): ${eur(t.fritura)}`)
  if (d.tipoEntrega === 'Domicilio') L.push(`Envío: ${eur(t.envio)}`)
  L.push(`*TOTAL: ${eur(t.total)}*`)
  if (d.nota?.trim()) L.push('', `*Nota:* ${d.nota.trim()}`)
  return L.join('\n')
}

/** Registra el pedido en la hoja de Google, con los mismos campos que ya usaba. */
export function registrarEnHoja(d, items, envio) {
  const t = totalesDe(items, envio)
  const domicilio = d.tipoEntrega === 'Domicilio'
  const params = new URLSearchParams({
    id: d.codigo,
    fecha: d.fechaEntrega,
    horario: `${d.horaDesde} a ${d.horaHasta}`,
    cliente: d.nombre.trim(),
    telefono: d.telefono.trim(),
    cp: domicilio ? d.cp.trim() : '',
    direccion: domicilio ? d.direccion.trim() : '',
    productos: items.map((l) => `• ${l.nombre} (${l.presentacion}) x${l.cantidad} [${l.preparacion}]`).join('\n'),
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
