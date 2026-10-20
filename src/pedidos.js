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
