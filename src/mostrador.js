/**
 * Venta en mostrador: salida de bandejas por la mañana y devolución por la tarde.
 *
 * El TPV del local no está enlazado con esta app, así que el mostrador no puede
 * descontar venta a venta. En su lugar se lleva por diferencia: lo que sale menos
 * lo que vuelve es lo que se ha vendido.
 *
 * Reglas que conviene tener claras:
 * - Mientras las bandejas están en el mostrador siguen contando en el stock, pero
 *   quedan RESERVADAS: la web y los pedidos no pueden disponer de ellas.
 * - Una bandeja que se abre ya no vuelve como bandeja: sus restos se guardan como
 *   unidades sueltas, que salen las primeras al día siguiente.
 * - La merma se apunta aparte. Si se sumara a lo vendido, el desperdicio quedaría
 *   escondido justo donde se va el margen.
 */

export const unidadesDe = (presentacion = "") => {
  const m = String(presentacion).match(/\d+/);
  return m ? parseInt(m[0], 10) : 1;
};

/** Bandejas de una presentación que no están comprometidas en el mostrador. */
export function disponibles(variante) {
  return Math.max(0, (variante?.stock || 0) - (variante?.enMostrador || 0));
}

/** Resultado de una jornada, en unidades. */
export function cuentasJornada(jornada, productos) {
  const lineas = (jornada?.salidas || []).map((s) => {
    const prod = productos.find((p) => String(p.id) === String(s.productoId));
    const variante = prod?.variantes?.find((v) => v.presentacion === s.presentacion);
    const uds = unidadesDe(s.presentacion);
    const dev = (jornada.devoluciones || []).find(
      (d) => String(d.productoId) === String(s.productoId) && d.presentacion === s.presentacion
    ) || {};

    const bandejasDevueltas = Number(dev.bandejas) || 0;
    const sueltasDevueltas = Number(dev.sueltas) || 0;
    const merma = Number(dev.merma) || 0;

    const sacadas = (Number(s.bandejas) || 0) * uds + (Number(s.sueltas) || 0);
    const devueltas = bandejasDevueltas * uds + sueltasDevueltas;
    const vendidas = Math.max(0, sacadas - devueltas - merma);

    const precioUnidad = (variante?.precio || 0) / uds;
    return {
      productoId: s.productoId,
      nombre: prod?.nombre || s.productoId,
      presentacion: s.presentacion,
      uds,
      bandejasSacadas: Number(s.bandejas) || 0,
      sueltasIniciales: Number(s.sueltas) || 0,
      bandejasDevueltas,
      sueltasDevueltas,
      merma,
      // Las bandejas abiertas no vuelven enteras: salen del stock igual que las vendidas.
      bandejasConsumidas: Math.max(0, (Number(s.bandejas) || 0) - bandejasDevueltas),
      vendidas,
      importe: vendidas * precioUnidad,
    };
  });

  return {
    lineas,
    vendidas: lineas.reduce((t, l) => t + l.vendidas, 0),
    merma: lineas.reduce((t, l) => t + l.merma, 0),
    importe: lineas.reduce((t, l) => t + l.importe, 0),
  };
}
