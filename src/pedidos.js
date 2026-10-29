/**
 * Cuentas y etiquetas de un pedido, compartidas por la gestión y el repartidor.
 *
 * Existe porque cada pantalla sumaba por su cuenta y no coincidían. Dos trampas:
 *
 * 1. La preparación. Los pedidos hechos en la web guardan "Frito" o "Congelado" en
 *    `preparacion`, y dejan `estado` siempre en "Congelado". Los hechos en la gestión
 *    usan `estado`. Mirar solo uno de los dos da bandejas fritas que parecen congeladas.
 *
 * 2. El total. Los de la web guardan en `total` solo los productos, con el envío y la
 *    fritura aparte; los de la gestión guardan productos + envío. Por eso aquí el total
 *    se calcula siempre sumando las partes, y nunca se usa el `total` guardado.
 */

export const preparacionDe = (it) => it?.preparacion || it?.estado || "Congelado";

export const esFrito = (it) => preparacionDe(it) === "Frito";

export function totalesPedido(pedido) {
  const items = pedido?.items || [];
  const productos = items.reduce((t, it) => t + (Number(it.subtotal) || 0), 0);
  const servicio = Number(pedido?.servicio) || 0;   // fritura
  const envio = Number(pedido?.envio) || 0;
  return { productos, servicio, envio, total: productos + servicio + envio };
}

/** Bandejas fritas del pedido, para explicar el cargo de fritura. */
export const bandejasFritas = (pedido) =>
  (pedido?.items || []).filter(esFrito).reduce((t, it) => t + (Number(it.cantidad) || 0), 0);

/** A quién le toca llevarlo, o por qué no hay nadie. */
export function quienEntrega(pedido, repartidores) {
  const nombre = repartidores?.find((r) => r.id === pedido?.repartidorId)?.nombre;
  if (nombre) return nombre;
  return pedido?.tipoEntrega === "Recogida" ? "Recoge el cliente en tienda" : "Sin repartidor asignado";
}

// ─── AVISO AL CLIENTE POR WHATSAPP ──────────────────────────────────────────

/**
 * Número del cliente en formato internacional, sin "+" ni espacios, o null si no se
 * reconoce. "+44 7700 900123" / "0044..." → "447700900123"; un móvil español de 9
 * cifras → "34...". Lo usan la tienda (para el enlace del pedido) y la gestión
 * (para avisar de que el pedido está confirmado).
 */
export function whatsappDe(telefono) {
  const t = String(telefono || "").trim();
  const d = t.replace(/\D/g, "");
  if (t.startsWith("+")) return d.length >= 8 ? d : null;
  if (d.startsWith("00")) return d.length >= 10 ? d.slice(2) : null;
  if (/^[6789]\d{8}$/.test(d)) return "34" + d;
  if (/^34[6789]\d{8}$/.test(d)) return d;
  return null;
}

// "2026-09-19" → "viernes 19/09"
export function fechaLegible(iso) {
  if (!iso) return "—";
  const [a, m, d] = String(iso).split("-").map(Number);
  if (!a || !m || !d) return String(iso);
  const dia = new Date(a, m - 1, d).toLocaleDateString("es-ES", { weekday: "long" });
  return `${dia} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** Dirección del obrador, para los pedidos que recoge el cliente. */
export const DIRECCION_LOCAL = "Calle Berrocal 7, local 3, 28021 Madrid";

/**
 * FORMAS DE PAGO, según cómo recibe el pedido el cliente.
 *
 * Con tarjeta solo se cobra EN RECOGIDA: el datáfono está en la tienda y el
 * repartidor no lo lleva encima, así que a domicilio no se puede pagar con
 * ella. Decisión del dueño el 29/10/2026. El día que el repartidor lleve
 * datáfono, se borra la condición y vuelve a salir en todas partes.
 *
 * La regla vive aquí, y no en la tienda, porque la aplican los tres: la tienda
 * al pedir, la gestión al apuntar un pedido a mano y el repartidor al cobrar.
 *
 * Los pedidos que YA se cobraron con tarjeta no se tocan nunca: la siguen
 * guardando y enseñando. Para eso están `TODOS_LOS_PAGOS` y `formasPagoDe`.
 */
const PAGOS_SIEMPRE = ["Efectivo", "Bizum", "Transferencia"];

export const TODOS_LOS_PAGOS = [...PAGOS_SIEMPRE, "Tarjeta"];

export const pagosDe = (tipoEntrega) =>
  tipoEntrega === "Recogida" ? [...PAGOS_SIEMPRE, "Tarjeta"] : PAGOS_SIEMPRE;

/**
 * Las formas que enseñar en la ficha de un pedido concreto: las que valen para
 * su tipo de entrega, más la suya propia si ya no se ofrece. Sin esto, abrir un
 * pedido viejo y guardarlo le cambiaría la forma de pago sin avisar.
 */
export const formasPagoDe = (tipoEntrega, actual) => {
  const posibles = pagosDe(tipoEntrega);
  return !actual || posibles.includes(actual) ? posibles : [...posibles, actual];
};

/** "2026-10-27" → "261027". La fecha metida dentro del número de pedido. */
export const fechaCompacta = (iso) => String(iso || "").slice(2).replace(/-/g, "");

/**
 * Número definitivo del pedido: P + día de ENTREGA + el correlativo de ese día.
 * P261027-03 es el tercer pedido que se entrega el 27.
 *
 * El correlativo se saca de los códigos que ya existen, no de cuántos pedidos
 * hay: si se borra un pedido, el siguiente no repite un número ya impreso ni
 * pisa el ticket que el cliente tiene en la mano. Al cambiar la fecha de entrega
 * de un pedido su número NO se recalcula, a propósito: el papel ya está impreso.
 */
export function siguienteCodigo(fecha, pedidos = []) {
  const prefijo = `P${fechaCompacta(fecha)}-`;
  const usados = (pedidos || [])
    .map((p) => String(p?.codigo || ""))
    .filter((c) => c.startsWith(prefijo))
    .map((c) => parseInt(c.slice(prefijo.length), 10))
    .filter((n) => Number.isFinite(n));
  const siguiente = (usados.length ? Math.max(...usados) : 0) + 1;
  return `${prefijo}${String(siguiente).padStart(2, "0")}`;
}

/** Mensaje de confirmación que se le manda al cliente cuando se acepta su pedido. */
export function mensajeConfirmacion(pedido) {
  const t = totalesPedido(pedido);
  const L = [`¡Hola ${pedido?.nombre || ""}! Tu pedido está confirmado ✅`, ""];
  if (pedido?.codigo) L.push(`*Pedido:* ${pedido.codigo}`);
  L.push(`*Día:* ${fechaLegible(pedido?.fecha)}${pedido?.rangoHorario ? ` · de ${pedido.rangoHorario}` : ""}`);
  L.push(pedido?.tipoEntrega === "Recogida"
    ? `*Recogida en:* ${DIRECCION_LOCAL}`
    : `*Entrega en:* ${pedido?.direccion || "—"}${pedido?.cp ? `, ${pedido.cp}` : ""}`);
  for (const it of pedido?.items || []) {
    L.push(`• ${it.nombreProducto || it.nombre} ${it.presentacion || ""} (x${it.cantidad}) — ${preparacionDe(it)}`);
  }
  L.push("", `*TOTAL: ${t.total.toFixed(2)} €* · ${pedido?.formaPago || ""}`.trim());
  L.push("", "¡Gracias por pedir en Don Pepe Sabor! 🧀");
  return L.join("\n");
}

/** Enlace de WhatsApp con la confirmación escrita, o null si el teléfono no sirve. */
export function enlaceConfirmacion(pedido) {
  const numero = whatsappDe(pedido?.telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensajeConfirmacion(pedido))}`;
}
