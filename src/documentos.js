/**
 * Qué papel se le entrega al cliente con el pedido.
 *
 * - Ticket:  lo de siempre, para un particular. Comprobante del pedido; no lleva
 *            datos fiscales de nadie y no sirve para que nadie se desgrave nada.
 * - Albarán: nota de entrega para un negocio. Dice qué se entregó y lo firma quien
 *            lo recibe. NO es un documento fiscal: ni impuestos ni numeración legal.
 *            Por eso se puede emitir sin pedirle permiso a nadie.
 * - Factura: documento fiscal. Necesita los datos de quien compra Y los de quien
 *            vende, numeración correlativa sin huecos y el IVA desglosado.
 *
 * MIENTRAS FALTEN LOS DATOS FISCALES DE LA EMPRESA, la factura se imprime marcada
 * como PROFORMA y con el aviso de que no tiene validez. No es un descuido: emitir
 * facturas de verdad exige saber el NIF, el tipo de IVA de cada producto y si le
 * aplica Verifactu (software homologado, registro encadenado e inalterable). En
 * cuanto el gestor lo confirme, se rellena `empresa` en Administración y deja de
 * salir el sello de proforma.
 */
import { fechaLegible, preparacionDe, totalesPedido } from "./pedidos.js";

export const DOCUMENTOS = ["Ticket", "Albarán", "Factura"];

/**
 * Datos de quien VENDE. Se pueden cambiar en ⚙️ Administración; aquí están los
 * que nos pasó la dueña, para no tener que teclearlos.
 *
 * `nombre` es el nombre comercial, el que conoce la gente. `razonSocial` es quien
 * factura de verdad, y es la que manda en el papel.
 */
export const EMPRESA_VACIA = {
  nombre: "Don Pepe Sabor",
  razonSocial: "Inversiones Ayala 1992",
  nif: "B75361477",
  direccion: "Calle Berrocal 7, local 3, 28021 Madrid",
  telefono: "604 136 371",
  iva: 10,          // % que lleva el precio de venta dentro; lo confirma el gestor
  serie: "A",       // serie de la numeración de facturas
  /**
   * Hasta que el gestor confirme el IVA de cada producto y si aplica Verifactu,
   * toda factura sale marcada como proforma AUNQUE los datos estén completos.
   * Tener el CIF no basta: una factura con el IVA equivocado es un problema, no
   * un papel. Se enciende a mano en Administración, y solo con el gestor delante.
   */
  ivaConfirmado: false,
};

/**
 * Junta lo guardado con los datos de fábrica.
 *
 * Un campo guardado EN BLANCO no gana: la app escribió la ficha vacía en la nube
 * antes de que supiéramos el CIF, y si ese vacío pisara lo de arriba habría que
 * volver a teclearlo todo. Lo que esté escrito manda; lo que esté en blanco se
 * rellena con lo de fábrica.
 */
export function fusionaEmpresa(guardado) {
  const e = { ...EMPRESA_VACIA };
  for (const [k, v] of Object.entries(guardado || {})) {
    if (typeof v === "string" ? v.trim() !== "" : v != null) e[k] = v;
  }
  return e;
}

/** Datos de quien COMPRA. Van en el pedido y se guardan en la ficha del cliente. */
export const FISCAL_VACIO = {
  razonSocial: "", nif: "", direccion: "", cp: "", poblacion: "", contacto: "",
};

/** Albarán y factura piden los datos del negocio; el ticket, no. */
export const pideFiscal = (documento) => documento === "Albarán" || documento === "Factura";

/**
 * Qué le falta al pedido para poder facturarlo. Lista vacía = se puede.
 * Se comprueba al guardar: mejor que lo diga la app ahora, y no el gestor del
 * cliente dentro de dos semanas.
 */
export function faltaParaFacturar(fiscal) {
  const falta = [];
  if (!fiscal?.razonSocial?.trim()) falta.push("razón social");
  if (!fiscal?.nif?.trim()) falta.push("NIF");
  if (!fiscal?.direccion?.trim()) falta.push("dirección fiscal");
  return falta;
}

/** Si no están estos, cualquier factura que se imprima sale como proforma. */
export const empresaLista = (e) =>
  Boolean(e?.nombre?.trim() && e?.nif?.trim() && e?.direccion?.trim() && e?.ivaConfirmado);

/**
 * Base e IVA a partir de un total que YA lleva el impuesto dentro.
 * Los precios de la tienda son los que paga el cliente, así que el impuesto no se
 * suma encima: se saca de dentro.
 */
export function desglosaIva(total, tipo) {
  const t = Number(tipo) || 0;
  const base = (Number(total) || 0) / (1 + t / 100);
  return { tipo: t, base, cuota: (Number(total) || 0) - base };
}

/**
 * El documento escrito en texto plano, para mandárselo al cliente por WhatsApp o
 * por correo sin tener que imprimirlo y fotografiarlo.
 *
 * Es el MISMO documento, no un resumen: lleva el número, a quién va, qué se
 * entregó y el total. Lo que no lleva es la firma —eso solo tiene sentido en
 * papel— ni el desglose de IVA salvo en la factura.
 */
export function textoDocumento(pedido, empresa, tipo) {
  const emp = fusionaEmpresa(empresa);
  const f = { ...FISCAL_VACIO, ...(pedido?.fiscal || {}) };
  const t = totalesPedido(pedido);
  const eur = (n) => `${(Number(n) || 0).toFixed(2)} €`;
  const numero = pedido?.codigo || `#${String(pedido?.id || "").slice(-4).toUpperCase()}`;
  const sinPrecios = tipo === "Albarán" && pedido?.albaranSinPrecios;

  const titulo = tipo === "Albarán" ? "ALBARÁN DE ENTREGA"
    : tipo === "Factura" ? (empresaLista(emp) ? "FACTURA" : "FACTURA PROFORMA · SIN VALIDEZ FISCAL")
    : "COMPROBANTE DE PEDIDO";

  const L = [`*${emp.nombre}*`, titulo, `Nº ${numero} · ${fechaLegible(pedido?.fecha)}`, ""];

  if (tipo !== "Ticket") {
    L.push(`*Para:* ${pedido?.nombre || f.razonSocial || ""}`);
    if (f.razonSocial && f.razonSocial !== pedido?.nombre) L.push(f.razonSocial);
    if (f.nif) L.push(`NIF: ${f.nif}`);
    if (pedido?.sede) L.push(`Sede: ${pedido.sede}`);
    // El albarán dice a dónde va la mercancía; la factura, el domicilio fiscal.
    const donde = tipo === "Albarán"
      ? `${pedido?.direccion || f.direccion || ""} ${pedido?.cp || ""}`
      : `${f.direccion || pedido?.direccion || ""} ${f.poblacion || ""}`;
    if (donde.trim()) L.push(donde.trim());
    L.push("");
  }

  for (const it of pedido?.items || []) {
    const linea = `• ${it.cantidad} × ${it.nombreProducto} ${it.presentacion || ""} (${preparacionDe(it)})`;
    L.push(sinPrecios ? linea : `${linea} — ${eur(it.subtotal)}`);
  }

  if (sinPrecios) {
    L.push("", "Albarán sin valorar: el importe va en la factura.");
  } else {
    if (t.servicio > 0) L.push(`Fritura: ${eur(t.servicio)}`);
    if (t.envio > 0) L.push(`Transporte: ${eur(t.envio)}`);
    if (tipo === "Factura") {
      const iva = desglosaIva(t.total, emp.iva);
      L.push("", `Base imponible: ${eur(iva.base)}`, `IVA ${iva.tipo} %: ${eur(iva.cuota)}`);
    }
    L.push("", `*TOTAL: ${eur(t.total)}*`);
  }

  if (tipo === "Albarán") L.push("", "Este documento acredita la entrega. No es una factura.");
  if (tipo === "Factura" && !empresaLista(emp)) L.push("", "DOCUMENTO PROFORMA · SIN VALIDEZ FISCAL");

  L.push("", emp.razonSocial && emp.razonSocial !== emp.nombre ? emp.razonSocial : "");
  if (emp.nif) L.push(`CIF ${emp.nif}`);
  L.push(emp.direccion || "", `WhatsApp ${emp.telefono}`);
  return L.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

/** "2026-10" → "octubre de 2026", para encabezar el resumen del mes. */
export function mesLegible(mes) {
  const [a, m] = String(mes || "").split("-").map(Number);
  if (!a || !m) return String(mes || "");
  const nombre = new Date(a, m - 1, 1).toLocaleDateString("es-ES", { month: "long" });
  return `${nombre} de ${a}`;
}
