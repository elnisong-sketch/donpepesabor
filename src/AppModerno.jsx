import { useState, useEffect, useMemo } from "react";
import { auth, db } from "./firebase";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { DIRECCION_LOCAL, bandejasFritas, enlaceConfirmacion, fechaLegible, preparacionDe, quienEntrega, siguienteCodigo, totalesPedido, whatsappDe } from "./pedidos.js";
import {
  DOCUMENTOS, EMPRESA_VACIA, FISCAL_VACIO, desglosaIva, empresaLista, fusionaEmpresa,
  faltaParaFacturar, mesLegible, pideFiscal, textoDocumento,
} from "./documentos.js";
import { cuentasJornada, disponibles } from "./mostrador.js";
import { ocupacion, sinReparto, textoFranja, turnosDe } from "./franjas.js";
// Las fotos y el recargo por freír son los mismos que ve el cliente en la tienda:
// si se tocan allí, el pedido hecho a mano sigue cuadrando con la web.
import { costoFrito, fotoDe } from "./tienda/catalogo.js";

// ─── DATOS INICIALES (idénticos a App.jsx) ──────────────────────────────────
const PRODUCTOS_INICIALES = [];

const CLIENTES_INICIALES = [];

const FORMAS_PAGO = ["Efectivo", "Bizum", "Transferencia", "Tarjeta"];
const ESTADOS_PEDIDO = ["Pendiente", "Confirmado", "En ruta", "Entregado", "Cancelado"];
// Tonos algo más oscuros que los de antes: sobre el fondo crema, los claros no se leían.
const ESTADO_COLORS = {
  Pendiente: "#bf7d08",
  Confirmado: "#3f5bb0",
  "En ruta": "#6b3fa0",
  Entregado: "#1d7a3c",
  Cancelado: "#b03a2e",
};
const UNIDADES_MATERIA_PRIMA = ["kg", "litros", "unidades"];
const STOCK_MINIMO_DEFECTO = 5;
const CATEGORIAS_GASTO = ["Limpieza", "Servicios", "Transporte", "Alquiler", "Otros"];
const REPARTIDOR_TIENDA_ID = "tienda";
const REPARTIDORES_INICIALES = [{ id: REPARTIDOR_TIENDA_ID, nombre: "Recoger en Tienda", telefono: "", fijo: true }];

const hoy = () => new Date().toISOString().split("T")[0];
const generarId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const inicioDeMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0]; };

/**
 * PALETA — la misma que ve el cliente en la tienda (src/tienda/tienda.css).
 *
 * La gestión y la tienda son el mismo negocio: si allí es crema y vino, aquí
 * también. Todo el color de la app sale de estas constantes, así que cambiarlas
 * cambia las doce pantallas a la vez; no hay colores sueltos escritos a mano.
 */
const BG_APP    = "#fbf4e8";   // crema, el fondo de la tienda
const BG_CARD   = "#ffffff";   // papel
const BG_INPUT  = "#fbf4e8";   // crema, para que los campos no parezcan agujeros
const BORDER    = "#efe1c8";   // crema oscuro
const BORDER2   = "#e0cdab";   // un paso más
const MARRON    = "#2a1200";   // marrón de la cabecera
const VINO      = "#8a1f1f";   // el acento de la marca
const ORO       = "#e8a317";   // dorado, solo para detalles
const TEXT_MAIN = "#2b1a10";   // texto principal
const TEXT_SUB  = "#6f5a4a";   // texto secundario
const TEXT_TENUE = "#a8968a";  // etiquetas y apoyos
const TIPO      = "'Manrope', system-ui, sans-serif";
const TIPO_TIT  = "'Archivo', system-ui, sans-serif";

// ─── ACENTOS DE COLOR POR SECCIÓN ───────────────────────────────────────────
/**
 * Un color por sección, para saber dónde estás de un vistazo.
 *
 * Son los mismos doce de antes pero bajados de tono: sobre crema, los colores
 * de neón no se leen y pelean con el vino de la marca. Pedidos se queda con el
 * vino porque es la pantalla principal.
 */
const ACENTOS = {
  pedidos:    "#8a1f1f",   // vino de la marca
  clientes:   "#1d6a7a",   // azul petróleo
  inventario: "#6b3fa0",   // ciruela
  stock:      "#0f6e63",   // verde azulado
  produccion: "#2f7a3f",   // verde
  proveedores:"#156c6c",   // teal
  compras:    "#a3387a",   // frambuesa
  gastos:     "#b03a2e",   // rojo tierra
  reporte:    "#3f5bb0",   // azul
  personal:   "#bf7d08",   // dorado
  mostrador:  "#8d3b8f",   // morado
  admin:      "#6f5a4a",   // tierra
};

// ─── HELPERS STOCK FIFO ──────────────────────────────────────────────────────
function deductFIFO(lotes = [], cantidad) {
  let rem = cantidad;
  const sorted = [...lotes].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const result = [];
  for (const l of sorted) {
    if (rem <= 0) { result.push(l); continue; }
    if (l.cantidad <= rem) { rem -= l.cantidad; }
    else { result.push({ ...l, cantidad: l.cantidad - rem }); rem = 0; }
  }
  return result;
}
function stockTotal(lotes = []) {
  return lotes.reduce((s, l) => s + (l.cantidad || 0), 0);
}

// ─── COMPONENTES UI BASE ─────────────────────────────────────────────────────
/**
 * Iconos dibujados a línea, en vez de emojis.
 *
 * Los emojis los pinta cada móvil a su manera (en un iPhone y en un Android no
 * se parecen) y no se pueden teñir del color de la sección. Esto sí.
 */
const TRAZOS = {
  inicio:     "M4 11l8-7 8 7M6 10v9h12v-9M10 19v-5h4v5",
  pedidos:    "M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10",
  clientes:   "M16 19v-1.6a3.4 3.4 0 00-3.4-3.4H6.4A3.4 3.4 0 003 17.4V19 M21 19v-1.6a3.4 3.4 0 00-2.6-3.3 M16.5 4.5a3.2 3.2 0 010 6.2",
  inventario: "M20.6 13.3L13.3 20.6a2 2 0 01-2.8 0l-7-7V4h9.6l7.5 7.5a1.3 1.3 0 010 1.8z",
  mostrador:  "M3 10l2-5h14l2 5 M4 10v9h16v-9 M9 19v-5h6v5",
  stock:      "M3 6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2z M3 9h18 M8 4v5",
  produccion: "M4 20V9l5 3V9l5 3V9l6 3.5V20z M4 9l1-5h3l1 5",
  personal:   "M5 20v-1a5 5 0 015-5h4a5 5 0 015 5v1",
  admin:      "M19.4 14.6a1.6 1.6 0 00.3 1.8 2 2 0 11-2.8 2.8 1.6 1.6 0 00-2.7 1.1 2 2 0 11-4 0 1.6 1.6 0 00-2.8-1.1 2 2 0 11-2.8-2.8 1.6 1.6 0 00-1.1-2.7 2 2 0 110-4 1.6 1.6 0 001.1-2.8 2 2 0 112.8-2.8 1.6 1.6 0 002.7-1.1 2 2 0 114 0 1.6 1.6 0 002.8 1.1 2 2 0 112.8 2.8 1.6 1.6 0 001.1 2.7 2 2 0 110 4 1.6 1.6 0 00-1.4.9z",
};
// Los que además llevan un círculo suelto (una cabeza, un tornillo).
const CIRCULOS = { clientes: [9.5, 7.5, 3.2], personal: [12, 8, 3.4], admin: [12, 12, 3.1], inventario: [7.6, 7.6, 1.4] };

/**
 * ¿Hay sitio para tener el menú siempre abierto?
 *
 * En el ordenador y en la tablet apaisada sí: el menú se queda fijo a la
 * izquierda. En el móvil no, 268 px de menú sobre 375 no dejan ver la app, así
 * que ahí sigue siendo un cajón que se abre y se cierra.
 */
const ANCHO_MENU = 268;
const ALTO_CABECERA = 66;

function usePantallaAncha(minimo = 900) {
  const consulta = `(min-width: ${minimo}px)`;
  const [ancha, setAncha] = useState(() => typeof window !== "undefined" && window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const alCambiar = e => setAncha(e.matches);
    mq.addEventListener("change", alCambiar);
    setAncha(mq.matches);
    return () => mq.removeEventListener("change", alCambiar);
  }, [consulta]);
  return ancha;
}

const Icono = ({ nombre, color = "currentColor", tam = 18 }) => {
  const d = TRAZOS[nombre];
  if (!d) return null;
  const c = CIRCULOS[nombre];
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
      <path d={d} />
      {c && <circle cx={c[0]} cy={c[1]} r={c[2]} />}
    </svg>
  );
};

/**
 * Quién lleva el pedido, en la propia fila de la lista.
 *
 * Antes había que abrir el pedido para saberlo, y un pedido a domicilio sin
 * repartidor no se distinguía de uno ya asignado: se descubría el día de la
 * entrega. Ahora el que falta sale en ámbar y con el borde marcado.
 */
const ChipRepartidor = ({ pedido, repartidores }) => {
  if (pedido?.estado === "Cancelado") return null;
  const recogida = pedido?.tipoEntrega === "Recogida";
  const nombre = repartidores?.find(r => r.id === pedido?.repartidorId)?.nombre;
  const falta = !recogida && !nombre;

  const color = falta ? "#bf7d08" : TEXT_SUB;
  const texto = recogida ? "Recoge el cliente" : (nombre || "Sin repartidor");

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, marginTop: 5,
      background: falta ? "#bf7d0818" : BG_APP,
      border: `1px solid ${falta ? "#bf7d0855" : BORDER}`,
      borderRadius: 999, padding: "2px 9px 2px 7px",
      fontSize: 11.5, fontWeight: falta ? 800 : 600, color,
    }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
        {recogida
          ? <><path d="M3 10l2-5h14l2 5" /><path d="M4 10v9h16v-9" /></>
          : <><circle cx="5.5" cy="17" r="3" /><circle cx="18.5" cy="17" r="3" /><path d="M8.5 17h7l-3-7H9M14 7h3l2 5" /></>}
      </svg>
      {texto}
    </span>
  );
};

const Badge = ({ estado }) => (
  <span style={{
    background: ESTADO_COLORS[estado] + "18", color: ESTADO_COLORS[estado],
    border: `1.5px solid ${ESTADO_COLORS[estado]}44`, borderRadius: 20, padding: "4px 12px",
    fontSize: 12, fontWeight: 700, letterSpacing: .3
  }}>{estado}</span>
);

const Btn = ({ children, onClick, variant = "primary", small, accent, disabled, style = {} }) => {
  const base = {
    border: "none", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700,
    padding: small ? "7px 14px" : "11px 20px", fontSize: small ? 13 : 15,
    opacity: disabled ? .45 : 1,
    transition: "transform .12s, box-shadow .12s", ...style
  };
  const ac = accent || VINO;
  const variants = {
    primary: { background: ac, color: "#fff", boxShadow: `0 4px 12px ${ac}55` },
    secondary: { background: BG_CARD, color: TEXT_MAIN, border: `1px solid ${BORDER}`, boxShadow: "0 1px 3px #0001" },
    danger: { background: "#fff", color: "#ef4444", border: "1px solid #fca5a5" },
    success: { background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac" },
    ghost: { background: "transparent", color: ac, border: `1px solid ${ac}88` },
  };
  return (
    <button disabled={disabled}
      onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
      style={{ ...base, ...variants[variant] }} onClick={disabled ? undefined : onClick}>{children}</button>
  );
};

const Chips = ({ label, options, value, onChange, accent = VINO }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ display: "block", color: TEXT_SUB, fontSize: 12, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: .5 }}>{label}</label>}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map(o => {
        const val = o.value ?? o;
        const lbl = o.label ?? o;
        const activo = val === value;
        return (
          <button key={val} type="button" onClick={() => onChange(val)} style={{
            border: activo ? `1.5px solid ${accent}` : `1px solid ${BORDER}`,
            background: activo ? accent : BG_CARD,
            color: activo ? "#fff" : TEXT_SUB,
            borderRadius: 20, padding: "7px 16px", fontSize: 13, fontWeight: 600,
            cursor: "pointer", transition: "all .15s",
            boxShadow: activo ? `0 2px 8px ${accent}44` : "none"
          }}>{lbl}</button>
        );
      })}
    </div>
  </div>
);

const Input = ({ label, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ display: "block", color: TEXT_SUB, fontSize: 12, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: .5 }}>{label}</label>}
    <input style={{
      width: "100%", background: BG_INPUT, border: `1.5px solid ${BORDER}`, borderRadius: 10,
      color: TEXT_MAIN, padding: "11px 14px", fontSize: 15, boxSizing: "border-box", outline: "none",
      boxShadow: "inset 0 1px 3px #0005"
    }} {...props} />
  </div>
);

const Select = ({ label, options, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ display: "block", color: TEXT_SUB, fontSize: 12, marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: .5 }}>{label}</label>}
    <select style={{
      width: "100%", background: BG_INPUT, border: `1.5px solid ${BORDER}`, borderRadius: 10,
      color: TEXT_MAIN, padding: "11px 14px", fontSize: 15, boxSizing: "border-box", outline: "none"
    }} {...props}>
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  </div>
);

const Card = ({ children, accent, style = {} }) => (
  <div style={{
    background: BG_CARD,
    border: `1px solid ${BORDER}`,
    borderLeft: accent ? `4px solid ${accent}` : `1px solid ${BORDER}`,
    borderRadius: 14, padding: 16, marginBottom: 12,
    boxShadow: "0 1px 4px #0000000d", ...style
  }}>{children}</div>
);

/**
 * Mientras haya un modal abierto, el `<body>` lleva la marca `data-modal`.
 *
 * El botón flotante de Salir vive fuera de esta app (main.jsx) y se le pegaba
 * encima a "Imprimir" en el móvil. En vez de moverlo de sitio, se esconde: con
 * una ficha abierta no hay nada que hacer ahí, y además cerrar la sesión por
 * error en ese momento sería lo peor que podría pasar. Se cuentan los modales
 * porque pueden solaparse (un ticket abierto sobre un pedido abierto).
 */
let modalesAbiertos = 0;
function useMarcaModal() {
  useEffect(() => {
    modalesAbiertos += 1;
    document.body.dataset.modal = "1";
    return () => {
      modalesAbiertos -= 1;
      if (modalesAbiertos <= 0) { modalesAbiertos = 0; delete document.body.dataset.modal; }
    };
  }, []);
}

const Modal = ({ title, accent = VINO, onClose, children }) => {
  useMarcaModal();
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ background: BG_CARD, border: `1px solid ${BORDER}`, boxShadow: "0 20px 60px #0003" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ color: MARRON, margin: 0, fontSize: 19, fontFamily: TIPO_TIT, fontWeight: 800 }}>{title}</h2>
          <button onClick={onClose} style={{ background: BG_APP, border: `1px solid ${BORDER}`, color: TEXT_SUB, fontSize: 16, cursor: "pointer", borderRadius: 8, width: 32, height: 32 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Empty = ({ texto }) => (
  <div style={{ textAlign: "center", padding: "40px 20px", color: TEXT_SUB, fontSize: 14 }}>
    <p style={{ margin: 0 }}>{texto}</p>
  </div>
);

// ─── MÓDULO: PEDIDOS ────────────────────────────────────────────────────────

/** "2026-10-20" → "HOY · lunes 20/10". Encabeza cada grupo de pedidos. */
function etiquetaDia(iso) {
  if (!iso || iso === "Sin fecha") return "SIN FECHA";
  const [a, m, d] = iso.split("-").map(Number);
  if ([a, m, d].some(isNaN)) return iso;
  const fecha = new Date(a, m - 1, d);
  const hoyD = new Date(); hoyD.setHours(0, 0, 0, 0);
  const dias = Math.round((fecha - hoyD) / 86400000);
  const prefijo = dias === 0 ? "HOY · " : dias === 1 ? "MAÑANA · " : dias === -1 ? "AYER · " : "";
  const nombre = fecha.toLocaleDateString("es-ES", { weekday: "long" });
  return `${prefijo}${nombre} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
}
/** Precio de inventario de esa bandeja, sin comisiones ni recargos. */
const precioTarifa = (it, productosRef) => {
  const prod = productosRef.find(p => String(p.id) === String(it.productoId));
  return prod?.variantes.find(v => v.presentacion === it.presentacion)?.precio || 0;
};

/**
 * Lo que se cobra por bandeja. Si se ha escrito un precio a mano manda ese: hay
 * clientes con precio pactado. La comisión y el recargo de frito se suman aparte.
 */
const precioFinalItem = (it, productosRef) => {
  const manual = it.precioManual === "" || it.precioManual === undefined ? null : parseFloat(it.precioManual);
  const base = manual !== null && !isNaN(manual) ? manual : precioTarifa(it, productosRef);
  const comision = parseFloat(it.comision) || 0;
  const recargoFrito = it.estado === "Frito" ? (parseFloat(it.recargoFrito) || 0) : 0;
  return base + comision + recargoFrito;
};

/**
 * Elegir productos como en la tienda: se ve el catálogo con sus fotos, se pulsa uno
 * y se elige bandeja, preparación y cantidad.
 *
 * La diferencia con la tienda es que aquí TODO el dinero se puede cambiar antes de
 * añadir la línea: el precio de la bandeja, el recargo por freír y la comisión. Es
 * lo que permite los precios pactados con un cliente sin tocar el inventario.
 */
function SelectorProductos({ productos, ac, onAgregar }) {
  const [abierto, setAbierto] = useState(null);     // producto desplegado
  const [item, setItem] = useState(null);           // lo que se está configurando

  const abrir = (p) => {
    if (abierto === p.id) { setAbierto(null); setItem(null); return; }
    const pres = p.variantes?.[0]?.presentacion || "Bandeja 25";
    setAbierto(p.id);
    setItem({ productoId: p.id, presentacion: pres, estado: "Congelado", cantidad: 1,
              comision: 0, recargoFrito: costoFrito(pres), precioManual: "" });
  };

  /**
   * Al cambiar de bandeja se trae el recargo de freír que le toca (5 € la de 25,
   * 8 € la de 50), el mismo que paga el cliente en la web. Sigue siendo editable:
   * lo que se escriba a mano manda hasta que se cambie de bandeja otra vez.
   */
  const cambiar = (campo, valor) => setItem(i => (
    campo === "presentacion"
      ? { ...i, presentacion: valor, recargoFrito: costoFrito(valor) }
      : { ...i, [campo]: valor }
  ));

  const añadir = () => {
    const prod = productos.find(p => String(p.id) === String(item.productoId));
    const precio = precioFinalItem(item, productos);
    onAgregar({ ...item, id: generarId(), nombreProducto: prod.nombre, precio,
                precioTarifa: precioTarifa(item, productos), subtotal: precio * item.cantidad });
    setAbierto(null); setItem(null);
  };

  const prodAbierto = productos.find(p => String(p.id) === String(abierto));
  const tarifa = item ? precioTarifa(item, productos) : 0;
  const unitario = item ? precioFinalItem(item, productos) : 0;

  return (
    <div style={{ background: "#101015", borderRadius: 14, padding: 14, marginBottom: 14, border: `1px solid ${ac}22` }}>
      <p style={{ color: ac, fontSize: 13, fontWeight: 800, margin: "0 0 10px" }}>🧺 Elegir productos</p>

      {!productos.length && <Empty texto="No hay productos en el inventario" />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 8 }}>
        {productos.map(p => {
          const activo = String(p.id) === String(abierto);
          return (
            <button key={p.id} onClick={() => abrir(p)} style={{
              background: activo ? ac + "22" : BG_CARD, border: `2px solid ${activo ? ac : BORDER}`,
              borderRadius: 12, padding: 0, cursor: "pointer", overflow: "hidden", textAlign: "left",
            }}>
              <img src={fotoDe(p)} alt="" style={{ width: "100%", height: 62, objectFit: "cover", display: "block" }} />
              <span style={{ display: "block", color: activo ? ac : TEXT_MAIN, fontSize: 11.5, fontWeight: 700, padding: "6px 7px 2px", lineHeight: 1.25 }}>
                {p.nombre}
              </span>
              <span style={{ display: "block", color: TEXT_SUB, fontSize: 11, padding: "0 7px 7px" }}>
                desde {Math.min(...(p.variantes || []).map(v => v.precio || 0)).toFixed(2)}€
              </span>
            </button>
          );
        })}
      </div>

      {prodAbierto && item && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
          <p style={{ color: TEXT_MAIN, fontWeight: 800, margin: "0 0 10px", fontSize: 14 }}>{prodAbierto.nombre}</p>

          <Chips label="Bandeja" accent={ac}
            options={(prodAbierto.variantes || []).map(v => ({ value: v.presentacion, label: `${unidadesPorPresentacion(v.presentacion)} uds · ${(v.precio || 0).toFixed(2)}€` }))}
            value={item.presentacion} onChange={v => cambiar("presentacion", v)} />

          <Chips label="¿Cómo lo quiere?" accent={ac} options={["Congelado", "Frito"]}
            value={item.estado} onChange={v => cambiar("estado", v)} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="Bandejas" type="number" min="1" value={item.cantidad}
              onChange={e => cambiar("cantidad", parseInt(e.target.value) || 1)} />
            <Input label="Precio por bandeja (€)" type="number" min="0" step="0.01" value={item.precioManual ?? ""}
              placeholder={tarifa.toFixed(2)} onChange={e => cambiar("precioManual", e.target.value)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: item.estado === "Frito" ? "1fr 1fr" : "1fr", gap: 8 }}>
            {item.estado === "Frito" && (
              <Input label="Recargo por frito (€)" type="number" step="0.01" value={item.recargoFrito}
                onChange={e => cambiar("recargoFrito", e.target.value)} />
            )}
            <Input label="Comisión por bandeja (€)" type="number" step="0.01" value={item.comision}
              onChange={e => cambiar("comision", e.target.value)} placeholder="0" />
          </div>

          <p style={{ color: TEXT_SUB, fontSize: 12, margin: "0 0 10px" }}>
            {unitario > 0
              ? <>Por bandeja: <strong style={{ color: TEXT_MAIN }}>{unitario.toFixed(2)}€</strong> · Total línea: <strong style={{ color: ac }}>{(unitario * item.cantidad).toFixed(2)}€</strong></>
              : "Esta bandeja no tiene precio en Inventario: escríbelo arriba"}
            {item.precioManual !== "" && !isNaN(parseFloat(item.precioManual)) && Math.abs(parseFloat(item.precioManual) - tarifa) > 0.009 && (
              <span style={{ color: ACENTOS.gastos, fontWeight: 700 }}> · precio especial (tarifa {tarifa.toFixed(2)}€)</span>
            )}
          </p>

          <Btn small accent={ac} onClick={añadir}>Añadir al pedido</Btn>
        </div>
      )}
    </div>
  );
}

function FormularioPedido({ productos, clientes, repartidores, pedidos, onGuardar, onCerrar, pedidoEditar }) {
  const ac = ACENTOS.pedidos;
  const [form, setForm] = useState(pedidoEditar || {
    clienteId: "", nombre: "", telefono: "", direccion: "", cp: "",
    tipoEntrega: "Domicilio", formaPago: "Efectivo", repartidorId: "",
    // Nace Confirmado: un pedido que escribe el dueño es un pedido que ya está
    // hablado con el cliente, normalmente por teléfono. "Pendiente" es para los
    // que llegan de la tienda y hay que revisar. Se puede cambiar aquí abajo.
    rangoHorario: "", fecha: hoy(), estado: "Confirmado", items: [], envio: 0,
    documento: "Ticket", fiscal: { ...FISCAL_VACIO },
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setFiscal = (k, v) => setForm(f => ({ ...f, fiscal: { ...FISCAL_VACIO, ...f.fiscal, [k]: v } }));
  const fiscal = { ...FISCAL_VACIO, ...(form.fiscal || {}) };
  const falta = form.documento === "Factura" ? faltaParaFacturar(fiscal) : [];

  // Huecos ya ocupados. El pedido que se está editando no se cuenta a sí mismo.
  const agendaForm = useMemo(
    () => ocupacion((pedidos || []).filter(p => p.id !== form.id)),
    [pedidos, form.id]
  );

  const estiloFranja = (activa) => ({
    background: activa ? ac : BG_CARD,
    border: `1.5px solid ${activa ? ac : BORDER}`,
    borderRadius: 10, padding: "9px 10px", cursor: "pointer",
    color: activa ? "#fff" : TEXT_MAIN, fontSize: 12.5, fontWeight: 700,
    fontFamily: "inherit", textAlign: "center",
  });

  const cambiarTipoEntrega = (tipo) => {
    const nuevoRep = tipo === "Recogida"
      ? REPARTIDOR_TIENDA_ID
      : (repartidores.find(r => r.id !== REPARTIDOR_TIENDA_ID)?.id || "");
    setForm(f => ({ ...f, tipoEntrega: tipo, repartidorId: nuevoRep }));
  };

  const repartidoresFiltrados = form.tipoEntrega === "Recogida"
    ? repartidores.filter(r => r.id === REPARTIDOR_TIENDA_ID)
    : repartidores.filter(r => r.id !== REPARTIDOR_TIENDA_ID);

  const agregarItem = (linea) => setForm(f => ({ ...f, items: [...f.items, linea] }));

  const subtotalProductos = form.items.reduce((s, i) => s + (i.subtotal || 0), 0);
  const total = subtotalProductos + (parseFloat(form.envio) || 0);

  /**
   * Al elegir un cliente se trae también cómo se le factura habitualmente y sus
   * datos fiscales. Con tres o cuatro clientes de empresa, acordarse un viernes a
   * las nueve de la noche de que la taberna va con albarán no es realista.
   */
  const selCliente = (id) => {
    const c = clientes.find(c => c.id === id);
    if (!c) return;
    // Con una sola sede se elige sola; con varias, que lo diga el que hace el pedido.
    const sedes = c.sedes || [];
    const unica = sedes.length === 1 ? sedes[0] : null;
    setForm(f => ({
      ...f, clienteId: id, nombre: c.nombre, telefono: c.telefono,
      direccion: unica?.direccion || c.direccion, cp: unica?.cp || c.cp,
      sede: unica?.nombre || "",
      documento: c.documentoHabitual || f.documento,
      fiscal: {
        ...FISCAL_VACIO, ...(c.fiscal || {}),
        ...(unica?.contacto ? { contacto: unica.contacto } : {}),
      },
    }));
  };

  // Sedes del cliente elegido, para poder cambiar a dónde va la entrega.
  const sedesCliente = clientes.find(c => c.id === form.clienteId)?.sedes || [];

  const elegirSede = (nombre) => {
    const s = sedesCliente.find(x => x.nombre === nombre);
    if (!s) return;
    setForm(f => ({
      ...f, sede: s.nombre, direccion: s.direccion || f.direccion, cp: s.cp || f.cp,
      telefono: s.telefono || f.telefono,
      fiscal: { ...FISCAL_VACIO, ...f.fiscal, ...(s.contacto ? { contacto: s.contacto } : {}) },
    }));
  };

  // Cliente que ya existe con ese teléfono (aunque esté escrito con prefijo o espacios).
  const clientePorTelefono = clientes.find(
    c => soloCifras(c.telefono).length >= 9 && soloCifras(c.telefono) === soloCifras(form.telefono)
  );

  const rellenarDesdeTelefono = () => {
    if (!clientePorTelefono) return;
    setForm(f => ({
      ...f, clienteId: clientePorTelefono.id,
      nombre: clientePorTelefono.nombre || f.nombre,
      direccion: clientePorTelefono.direccion || f.direccion,
      cp: clientePorTelefono.cp || f.cp,
      documento: clientePorTelefono.documentoHabitual || f.documento,
      fiscal: { ...FISCAL_VACIO, ...(clientePorTelefono.fiscal || {}) },
    }));
  };

  return (
    <Modal title={pedidoEditar ? "Editar Pedido" : "Nuevo Pedido"} accent={ac} onClose={onCerrar}>
      <Select label="Cliente registrado (opcional)"
        options={[{ value: "", label: "— Seleccionar cliente —" }, ...clientes.map(c => ({ value: c.id, label: `${c.nombre} · ${c.telefono}` }))]}
        value={form.clienteId} onChange={e => selCliente(e.target.value)} />
      <Input label="Nombre y Apellido *" value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Ej: María González" />
      <Input label="Teléfono *" value={form.telefono} onChange={e => set("telefono", e.target.value)} placeholder="+34 6XX XXX XXX" />
      {clientePorTelefono && clientePorTelefono.id !== form.clienteId && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "-6px 0 12px" }}>
          <span style={{ color: ACENTOS.clientes, fontSize: 12, fontWeight: 700 }}>
            Ya es cliente: {clientePorTelefono.nombre}
          </span>
          <Btn small variant="secondary" onClick={rellenarDesdeTelefono}>Traer sus datos</Btn>
        </div>
      )}
      {/* Un negocio con varias sedes: a cuál va ESTE pedido. Al elegirla se
          rellena la dirección, que es la que acabará en el albarán. */}
      {sedesCliente.length > 1 && (
        <Chips label="Sede a la que se entrega" accent={ac}
          options={sedesCliente.map(s => s.nombre || s.direccion)}
          value={form.sede || ""} onChange={elegirSede} />
      )}
      <Input label="Dirección *" value={form.direccion} onChange={e => set("direccion", e.target.value)} placeholder="Calle, número, piso" />
      <Input label="Código Postal *" value={form.cp} onChange={e => set("cp", e.target.value)} placeholder="28XXX" />
      {/* Qué papel se lleva el cliente. El ticket es lo normal; albarán y factura
          son para negocios y piden los datos de quien compra. */}
      <Chips label="Documento a entregar" accent={ac} options={DOCUMENTOS}
        value={form.documento || "Ticket"} onChange={v => set("documento", v)} />
      {pideFiscal(form.documento) && (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14, background: BG_APP }}>
          <p style={{ color: TEXT_SUB, fontSize: 12, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: .5 }}>
            Datos del negocio {form.documento === "Factura" ? "(obligatorios)" : "(para el albarán)"}
          </p>
          <Input label={form.documento === "Factura" ? "Razón social *" : "Nombre del negocio *"}
            value={fiscal.razonSocial} onChange={e => setFiscal("razonSocial", e.target.value)} placeholder="Ej: Taberna El Puerto, S.L." />
          <Input label={form.documento === "Factura" ? "NIF / CIF *" : "NIF / CIF"}
            value={fiscal.nif} onChange={e => setFiscal("nif", e.target.value)} placeholder="Ej: B12345678" />
          <Input label={form.documento === "Factura" ? "Dirección fiscal *" : "Dirección de entrega"}
            value={fiscal.direccion} onChange={e => setFiscal("direccion", e.target.value)} placeholder="Calle, número" />
          <Input label="Población" value={fiscal.poblacion} onChange={e => setFiscal("poblacion", e.target.value)} placeholder="Madrid" />
          <Input label="Persona que recibe" value={fiscal.contacto} onChange={e => setFiscal("contacto", e.target.value)} placeholder="Quién firma la entrega" />
          {form.documento === "Albarán" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: TEXT_SUB, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={!!form.albaranSinPrecios}
                onChange={e => set("albaranSinPrecios", e.target.checked)} />
              Albarán sin precios (lo firma un cocinero, no tiene por qué ver lo que paga su jefe)
            </label>
          )}
          {falta.length > 0 && (
            <p style={{ color: "#bf7d08", fontSize: 12.5, fontWeight: 700, margin: "8px 0 0" }}>
              Para facturar falta: {falta.join(", ")}.
            </p>
          )}
        </div>
      )}
      <Chips label="Tipo de entrega" accent={ac} options={["Domicilio", "Recogida"]} value={form.tipoEntrega} onChange={v => cambiarTipoEntrega(v)} />
      <Chips label="Forma de pago" accent={ac} options={FORMAS_PAGO} value={form.formaPago} onChange={v => set("formaPago", v)} />
      <Input label="Fecha de entrega" type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} />
      {form.tipoEntrega === "Domicilio" && sinReparto(form.fecha) && (
        <p style={{ color: "#bf7d08", fontSize: 12.5, fontWeight: 700, margin: "-6px 0 12px" }}>
          Ese día es domingo: la tienda no ofrece reparto, pero aquí puedes apuntarlo igual.
        </p>
      )}

      {/* Los mismos turnos que ve el cliente, con los huecos que quedan. Aquí NO
          se bloquean: si el dueño quiere doblar un turno, manda él.

          Cambian según el día de la semana, así que la lista se rehace cada vez
          que se toca la fecha: el viernes la tarde es de 15 a 18 y el sábado hay
          un turno solo. */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", color: TEXT_SUB, fontSize: 12, marginBottom: 6, fontWeight: 600 }}>Turno de entrega</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 6 }}>
          <button type="button" onClick={() => set("rangoHorario", "")}
            style={{ ...estiloFranja(!form.rangoHorario), gridColumn: "1 / -1" }}>
            Cualquier hora
          </button>
          {turnosDe(form.fecha).map(f => {
            const texto = textoFranja(f);
            const ocupados = (agendaForm[form.fecha] || {})[f.id] || 0;
            const libres = f.tope - ocupados;
            const elegida = form.rangoHorario === texto;
            return (
              <button key={f.id} type="button" onClick={() => set("rangoHorario", texto)}
                style={estiloFranja(elegida)}>
                {f.etiqueta}
                <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, marginTop: 2, color: elegida ? "#ffffffcc" : (libres > 0 ? TEXT_TENUE : "#bf7d08") }}>
                  {libres > 0 ? `${libres} libre${libres === 1 ? "" : "s"}` : `Completo · ${ocupados}`}
                </span>
              </button>
            );
          })}
        </div>
        {/* Los pedidos de antes del cambio traen tramos de dos horas, y hay que
            poder verlos y respetarlos: es lo que se le prometió al cliente. */}
        {form.rangoHorario && !turnosDe(form.fecha).some(f => textoFranja(f) === form.rangoHorario) && (
          <p style={{ color: TEXT_SUB, fontSize: 12, margin: "7px 0 0" }}>
            Horario que no es de los turnos de ese día: <strong style={{ color: TEXT_MAIN }}>{form.rangoHorario}</strong>
          </p>
        )}
      </div>
      {form.tipoEntrega === "Domicilio" && (
        <Input label="Costo de envío (€)" type="number" min="0" step="0.01" value={form.envio} onChange={e => set("envio", e.target.value)} placeholder="Ej: 5" />
      )}
      <Chips label="Repartidor" accent={ac} options={repartidoresFiltrados.map(r => ({ value: r.id, label: r.nombre }))}
        value={form.repartidorId} onChange={v => set("repartidorId", v)} />

      <SelectorProductos productos={productos} ac={ac} onAgregar={agregarItem} />

      {form.items.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ color: TEXT_SUB, fontSize: 12, marginBottom: 6, fontWeight: 700 }}>PRODUCTOS EN EL PEDIDO</p>
          {form.items.map((it, idx) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #25262f" }}>
              <div>
                <span style={{ color: TEXT_MAIN, fontSize: 13 }}>{it.cantidad}x {it.nombreProducto} · {it.presentacion} · {it.estado}</span>
                <div style={{ color: "#666", fontSize: 12, marginTop: 2 }}>
                  {it.precio > 0 ? `Precio unitario: ${it.precio.toFixed(2)}€` : "Precio unitario: — (sin precio en Inventario)"}
                  {it.precioTarifa > 0 && Math.abs(it.precioTarifa - it.precio) > 0.009 && (
                    <span style={{ color: ACENTOS.gastos, fontWeight: 700 }}> · especial (tarifa {it.precioTarifa.toFixed(2)}€)</span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: ac, fontSize: 14, fontWeight: 800 }}>{it.subtotal > 0 ? `${it.subtotal.toFixed(2)}€` : "—"}</span>
                <button onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                  style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
            </div>
          ))}
          {(parseFloat(form.envio) || 0) > 0 && (
            <p style={{ color: TEXT_SUB, fontSize: 13, textAlign: "right", margin: "8px 0 0" }}>
              Subtotal: {subtotalProductos.toFixed(2)}€ + Envío: {(parseFloat(form.envio) || 0).toFixed(2)}€
            </p>
          )}
          {total > 0 && <p style={{ color: ac, fontWeight: 800, textAlign: "right", marginTop: 4, fontSize: 17 }}>Total: {total.toFixed(2)}€</p>}
        </div>
      )}

      <Chips label="Estado del pedido" accent={ESTADO_COLORS[form.estado]} options={ESTADOS_PEDIDO} value={form.estado} onChange={v => set("estado", v)} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onCerrar}>Cancelar</Btn>
        <Btn accent={ac} disabled={falta.length > 0}
          onClick={() => {
            if (falta.length > 0) return;   // una factura sin NIF no le sirve a nadie
            onGuardar({ ...form, fiscal, id: form.id || generarId(), total });
          }}>Guardar Pedido</Btn>
      </div>
    </Modal>
  );
}

function lineaFactura(it) {
  const numero = it.presentacion?.split(" ")[1] || "";
  const sufijo = preparacionDe(it) === "Frito" ? "Fritos" : "Congelados";
  return `Bandeja ${it.nombreProducto} ${numero} - ${sufijo}`;
}

// ─── TICKET DE 80 mm PARA IMPRESORA TÉRMICA ─────────────────────────────────
// Es un comprobante del pedido, NO una factura: la factura legal la emite el TPV.
const TICKET_ANCHO_MM = 80;

function TicketPedido({ pedido, repartidores, onCerrar }) {
  const ac = ACENTOS.pedidos;
  const { productos, servicio, envio, total } = totalesPedido(pedido);
  const fritas = bandejasFritas(pedido);
  const repartidor = quienEntrega(pedido, repartidores);
  const domicilio = pedido.tipoEntrega === "Domicilio";
  const euros = n => (n || 0).toFixed(2) + " EUR";
  // Los pedidos anteriores a la numeración no tienen código: se imprimen con las
  // cuatro últimas cifras del id interno, que es corto y no se repite.
  const numeroPedido = pedido.codigo || `#${String(pedido.id).slice(-4).toUpperCase()}`;

  const Fila = ({ izq, der, fuerte }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: fuerte ? 700 : 400 }}>
      <span>{izq}</span><span>{der}</span>
    </div>
  );
  const Raya = () => <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />;

  return (
    <Modal title="🖨️ Ticket del pedido" accent={ac} onClose={onCerrar}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #ticket-imprimible, #ticket-imprimible * { visibility: visible !important; }
          #ticket-imprimible {
            position: absolute; left: 0; top: 0;
            width: ${TICKET_ANCHO_MM - 8}mm; padding: 0; margin: 0;
            color: #000; background: #fff;
          }
          @page { size: ${TICKET_ANCHO_MM}mm auto; margin: 4mm; }
        }
      `}</style>

      <div id="ticket-imprimible" style={{
        background: "#fff", color: "#000", width: 300, margin: "0 auto",
        fontFamily: "'Courier New', monospace", fontSize: 12.5, lineHeight: 1.45, padding: 10
      }}>
        {/* El número, lo primero y a la derecha: es lo que se busca de un vistazo
            cuando hay media docena de tickets pinchados en la cocina. */}
        <div style={{ textAlign: "right", marginBottom: 6 }}>
          <div style={{ fontSize: 9, letterSpacing: 1.5 }}>PEDIDO</div>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.05 }}>{numeroPedido}</div>
        </div>
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: 15 }}>DON PEPE SABOR</div>
        <div style={{ textAlign: "center", fontSize: 11 }}>{DIRECCION_LOCAL}</div>
        <div style={{ textAlign: "center", fontSize: 11 }}>WhatsApp 604 136 371</div>
        <Raya />
        <div style={{ textAlign: "center", fontSize: 11 }}>COMPROBANTE DE PEDIDO</div>
        <div style={{ textAlign: "center", fontSize: 10 }}>(no es una factura)</div>
        <Raya />
        {pedido.solicitud && <Fila izq="Solicitud" der={pedido.solicitud} />}
        <Fila izq="Entrega" der={`${pedido.fecha || ""} ${pedido.rangoHorario || ""}`.trim()} />
        <Fila izq="Cliente" der={pedido.nombre || "-"} />
        <Fila izq="Telefono" der={pedido.telefono || "-"} />
        {domicilio
          ? <div style={{ marginTop: 2 }}>Direccion: {pedido.direccion} {pedido.cp}</div>
          : <div style={{ marginTop: 2 }}>RECOGIDA EN TIENDA</div>}
        <Fila izq="Reparto" der={repartidor} />
        <Raya />
        {(pedido.items || []).map((it, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <div>{it.cantidad}x {it.nombreProducto}</div>
            <Fila izq={`   ${it.presentacion} · ${preparacionDe(it)}`} der={euros(it.subtotal)} />
          </div>
        ))}
        <Raya />
        <Fila izq="Productos" der={euros(productos)} />
        {servicio > 0 && <Fila izq={fritas ? `Fritura (${fritas})` : "Fritura"} der={euros(servicio)} />}
        {envio > 0 && <Fila izq="Envio" der={euros(envio)} />}
        <div style={{ borderTop: "1px solid #000", margin: "6px 0" }} />
        <Fila izq="TOTAL" der={euros(total)} fuerte />
        <Fila izq="Pago" der={pedido.formaPago || "-"} />
        {pedido.notas && <div style={{ marginTop: 6, fontSize: 11 }}>Nota: {pedido.notas}</div>}
        <Raya />
        <div style={{ textAlign: "center", fontSize: 11 }}>Gracias por tu pedido</div>
        <div style={{ textAlign: "center", fontSize: 11 }}>donpepesabor-tienda.web.app</div>
        <div style={{ height: 24 }} />
      </div>

      <p style={{ color: TEXT_SUB, fontSize: 12, margin: "12px 0 0" }}>
        Al imprimir, elige la impresora térmica y pon los márgenes en "ninguno".
      </p>
      <PieDocumento accent={ac} telefono={pedido.telefono}
        asunto={`Pedido ${numeroPedido} · Don Pepe Sabor`}
        texto={textoDocumento(pedido, null, "Ticket")}
        onCerrar={onCerrar} onImprimir={() => window.print()} />
    </Modal>
  );
}

/**
 * Mandar el documento al cliente sin imprimirlo.
 *
 * Va como texto, no como PDF: desde el navegador no se puede adjuntar un archivo
 * a WhatsApp, y un albarán escrito se lee igual de bien en el móvil. "Compartir"
 * solo sale donde el móvil lo permite (Android e iPhone); en el ordenador se usan
 * WhatsApp Web y el correo de siempre.
 */
function BotonEnviar({ texto, asunto, telefono, accent, abierto, setAbierto }) {
  const [copiado, setCopiado] = useState(false);
  const numero = whatsappDe(telefono);
  const puedeCompartir = typeof navigator !== "undefined" && !!navigator.share;

  const porWhatsapp = () => {
    const base = numero ? `https://wa.me/${numero}` : "https://wa.me/";
    window.open(`${base}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  };
  const porCorreo = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`;
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500); }
    catch { alert("No se pudo copiar. Selecciona el texto a mano."); }
  };
  const compartir = async () => {
    try { await navigator.share({ title: asunto, text: texto }); } catch { /* lo cerró */ }
  };

  if (!abierto) return null;

  return (
    <div className="envio-opciones">
      <Btn small variant="secondary" accent="#22c55e" onClick={porWhatsapp}>💬 WhatsApp</Btn>
      <Btn small variant="secondary" onClick={porCorreo}>✉️ Correo</Btn>
      {puedeCompartir && <Btn small variant="secondary" accent={accent} onClick={compartir}>📲 Compartir</Btn>}
      <Btn small variant="secondary" onClick={copiar}>{copiado ? "✓ Copiado" : "📋 Copiar"}</Btn>
    </div>
  );
}

/**
 * Pie común de los cuatro documentos: cerrar, enviar e imprimir.
 *
 * Las opciones de envío salen en su propia fila, encima de los botones, en vez
 * de empujarlos: en una pantalla de móvil, siete botones en una línea acaban
 * unos sobre otros.
 */
function PieDocumento({ texto, asunto, telefono, accent, onCerrar, onImprimir, etiquetaImprimir = "🖨️ Imprimir" }) {
  const [enviar, setEnviar] = useState(false);
  return (
    <>
      <BotonEnviar texto={texto} asunto={asunto} telefono={telefono} accent={accent}
        abierto={enviar} setAbierto={setEnviar} />
      <div className="pie-documento">
        <Btn variant="secondary" onClick={onCerrar}>Cerrar</Btn>
        <Btn variant="secondary" onClick={() => setEnviar(v => !v)}>{enviar ? "▴ Enviar" : "📤 Enviar"}</Btn>
        <Btn accent={accent} onClick={onImprimir}>{etiquetaImprimir}</Btn>
      </div>
    </>
  );
}

/**
 * Albarán de entrega para un negocio.
 *
 * NO es un documento fiscal: no lleva impuestos ni numeración legal, y por eso se
 * puede emitir sin más. Su trabajo es que quien recibe el género pueda comprobar
 * que lo que llegó es lo que pidió, y firmarlo. La factura va aparte: o la de ese
 * mismo pedido, o la del mes entero agrupando todos los albaranes.
 *
 * Puede ir sin precios: muchas veces lo firma un cocinero o un camarero, que no
 * tiene por qué ver lo que paga su jefe.
 */
function AlbaranPedido({ pedido, empresa, onCerrar }) {
  const ac = ACENTOS.pedidos;
  const { productos, servicio, envio, total } = totalesPedido(pedido);
  const fritas = bandejasFritas(pedido);
  const f = { ...FISCAL_VACIO, ...(pedido.fiscal || {}) };
  const conPrecios = !pedido.albaranSinPrecios;
  const euros = n => (n || 0).toFixed(2) + " €";
  const numero = pedido.codigo || `#${String(pedido.id).slice(-4).toUpperCase()}`;
  const emp = fusionaEmpresa(empresa);

  const Linea = ({ izq, der, fuerte }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0",
      borderBottom: "1px solid #ddd", fontWeight: fuerte ? 700 : 400 }}>
      <span>{izq}</span><span>{der}</span>
    </div>
  );

  return (
    <Modal title="📋 Albarán de entrega" accent={ac} onClose={onCerrar}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #albaran-imprimible, #albaran-imprimible * { visibility: visible !important; }
          #albaran-imprimible { position: absolute; left: 0; top: 0; width: 100%; padding: 0; margin: 0; }
          @page { size: A4; margin: 18mm; }
        }
      `}</style>

      <div id="albaran-imprimible" style={{
        background: "#fff", color: "#000", padding: 4,
        fontFamily: "Arial, Helvetica, sans-serif", fontSize: 13, lineHeight: 1.5,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{emp.nombre}</div>
            {/* Quien factura va debajo del nombre comercial, como en el albarán
                del cliente: el papel lo pide, pero la gente conoce el otro. */}
            {emp.razonSocial && emp.razonSocial !== emp.nombre &&
              <div style={{ fontSize: 12 }}>{emp.razonSocial}</div>}
            <div style={{ fontSize: 12 }}>{emp.direccion || DIRECCION_LOCAL}</div>
            {emp.nif && <div style={{ fontSize: 12 }}>CIF {emp.nif}</div>}
            <div style={{ fontSize: 12 }}>WhatsApp {emp.telefono}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, letterSpacing: 2 }}>ALBARÁN</div>
            <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{numero}</div>
            <div style={{ fontSize: 12 }}>{fechaLegible(pedido.fecha)}</div>
          </div>
        </div>

        <div style={{ border: "1px solid #999", borderRadius: 4, padding: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>ENTREGAR A</div>
          {/* Arriba el nombre con el que se conoce al sitio: es el que busca quien
              reparte. La razón social va debajo, que es lo que pide el papel. */}
          <div style={{ fontWeight: 700 }}>{pedido.nombre || f.razonSocial}</div>
          {f.razonSocial && f.razonSocial !== pedido.nombre && (
            <div style={{ fontSize: 12 }}>{f.razonSocial}</div>
          )}
          {f.nif && <div style={{ fontSize: 12 }}>NIF {f.nif}</div>}
          {/* La dirección del albarán es a dónde VA la mercancía, no la fiscal:
              un cliente con cuatro sedes factura en una y recibe en otra. */}
          {pedido.sede && <div style={{ fontSize: 12, fontWeight: 700 }}>Sede: {pedido.sede}</div>}
          <div style={{ fontSize: 12 }}>{pedido.direccion || f.direccion} {pedido.cp || ""}</div>
          {pedido.telefono && <div style={{ fontSize: 12 }}>Tel. {pedido.telefono}</div>}
        </div>

        <div style={{ fontSize: 11, letterSpacing: 1, marginBottom: 2 }}>MERCANCÍA ENTREGADA</div>
        <div style={{ borderTop: "2px solid #000" }} />
        {(pedido.items || []).map((it, i) => (
          <Linea key={i}
            izq={`${it.cantidad} × ${it.nombreProducto} · ${it.presentacion} · ${preparacionDe(it)}`}
            der={conPrecios ? euros(it.subtotal) : ""} />
        ))}
        {conPrecios && servicio > 0 && <Linea izq={fritas ? `Fritura (${fritas} bandejas)` : "Fritura"} der={euros(servicio)} />}
        {conPrecios && envio > 0 && <Linea izq="Transporte" der={euros(envio)} />}
        {conPrecios
          ? <Linea izq="TOTAL" der={euros(total)} fuerte />
          : <p style={{ fontSize: 11, margin: "10px 0 0", fontStyle: "italic" }}>
              Albarán sin valorar. El importe va en la factura.
            </p>}

        {pedido.notas && <p style={{ fontSize: 12, marginTop: 10 }}>Observaciones: {pedido.notas}</p>}

        <p style={{ fontSize: 11, marginTop: 16, color: "#444" }}>
          Este documento acredita la entrega de la mercancía. No es una factura.
        </p>

        <div style={{ display: "flex", gap: 30, marginTop: 28 }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: 4, fontSize: 11 }}>Entregado por</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: 4, fontSize: 11 }}>
              Recibido {f.contacto ? `por ${f.contacto}` : "(nombre y firma)"}
            </div>
          </div>
        </div>
      </div>

      <PieDocumento accent={ac} telefono={pedido.telefono}
        asunto={`Albarán ${numero} · ${emp.nombre}`}
        texto={textoDocumento(pedido, empresa, "Albarán")}
        onCerrar={onCerrar} onImprimir={() => window.print()} />
    </Modal>
  );
}

/**
 * Factura del pedido.
 *
 * Mientras los datos fiscales de la empresa no estén puestos en ⚙️ Administración,
 * sale marcada como PROFORMA y lo dice en el papel. No es un adorno: una factura
 * necesita NIF del que vende, numeración correlativa sin huecos y el tipo de IVA
 * correcto de cada producto, y además hay que saber si aplica Verifactu (software
 * homologado). Imprimir algo que parezca una factura sin eso es peor que no tener
 * nada, porque el cliente se la lleva creyendo que le sirve.
 *
 * El IVA no se suma encima: los precios de la tienda ya lo llevan dentro, así que
 * se desglosa hacia atrás a partir del total.
 */
function FacturaPedido({ pedido, empresa, onCerrar }) {
  const ac = ACENTOS.pedidos;
  const { servicio, envio, total } = totalesPedido(pedido);
  const emp = fusionaEmpresa(empresa);
  const f = { ...FISCAL_VACIO, ...(pedido.fiscal || {}) };
  const valida = empresaLista(emp);
  const { tipo, base, cuota } = desglosaIva(total, emp.iva);
  const euros = n => (n || 0).toFixed(2) + " €";
  const numero = pedido.codigo || `#${String(pedido.id).slice(-4).toUpperCase()}`;

  const Linea = ({ izq, der, fuerte }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0",
      borderBottom: "1px solid #ddd", fontWeight: fuerte ? 700 : 400 }}>
      <span>{izq}</span><span>{der}</span>
    </div>
  );

  return (
    <Modal title={valida ? "🧾 Factura" : "🧾 Factura proforma"} accent={ac} onClose={onCerrar}>
      {!valida && (
        <div style={{ background: "#bf7d0818", border: "1px solid #bf7d0855", borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <p style={{ color: "#bf7d08", fontSize: 13, fontWeight: 800, margin: "0 0 4px" }}>Esto todavía no es una factura válida</p>
          <p style={{ color: TEXT_SUB, fontSize: 12.5, margin: 0 }}>
            Faltan tus datos fiscales. Ponlos en ⚙️ Administración → Datos de la empresa
            (NIF, dirección y tipo de IVA) y deja de salir el sello de proforma. Confirma
            antes con tu gestor el IVA de cada producto y si te aplica Verifactu.
          </p>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #factura-imprimible, #factura-imprimible * { visibility: visible !important; }
          #factura-imprimible { position: absolute; left: 0; top: 0; width: 100%; padding: 0; margin: 0; }
          @page { size: A4; margin: 18mm; }
        }
      `}</style>

      <div id="factura-imprimible" style={{
        background: "#fff", color: "#000", padding: 4,
        fontFamily: "Arial, Helvetica, sans-serif", fontSize: 13, lineHeight: 1.5,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{emp.nombre}</div>
            {emp.razonSocial && emp.razonSocial !== emp.nombre &&
              <div style={{ fontSize: 12 }}>{emp.razonSocial}</div>}
            <div style={{ fontSize: 12 }}>{emp.direccion || DIRECCION_LOCAL}</div>
            <div style={{ fontSize: 12 }}>{emp.nif ? `CIF ${emp.nif}` : "CIF: pendiente"}</div>
            <div style={{ fontSize: 12 }}>WhatsApp {emp.telefono}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, letterSpacing: 2 }}>{valida ? "FACTURA" : "PROFORMA"}</div>
            <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{numero}</div>
            <div style={{ fontSize: 12 }}>{fechaLegible(pedido.fecha)}</div>
          </div>
        </div>

        <div style={{ border: "1px solid #999", borderRadius: 4, padding: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>FACTURAR A</div>
          <div style={{ fontWeight: 700 }}>{f.razonSocial || pedido.nombre}</div>
          {f.nif && <div style={{ fontSize: 12 }}>NIF {f.nif}</div>}
          <div style={{ fontSize: 12 }}>{f.direccion || pedido.direccion} {f.poblacion || ""} {f.cp || pedido.cp}</div>
        </div>

        <div style={{ borderTop: "2px solid #000" }} />
        {(pedido.items || []).map((it, i) => (
          <Linea key={i} izq={`${it.cantidad} × ${lineaFactura(it)}`} der={euros(it.subtotal)} />
        ))}
        {servicio > 0 && <Linea izq="Fritura" der={euros(servicio)} />}
        {envio > 0 && <Linea izq="Transporte" der={euros(envio)} />}

        <div style={{ marginTop: 10, marginLeft: "auto", width: 260 }}>
          <Linea izq="Base imponible" der={euros(base)} />
          <Linea izq={`IVA ${tipo} %`} der={euros(cuota)} />
          <Linea izq="TOTAL" der={euros(total)} fuerte />
        </div>

        <p style={{ fontSize: 12, marginTop: 12 }}>Forma de pago: {pedido.formaPago || "—"}</p>

        {!valida && (
          <p style={{ fontSize: 12, marginTop: 14, fontWeight: 700, border: "2px solid #000", padding: 8, textAlign: "center" }}>
            DOCUMENTO PROFORMA · SIN VALIDEZ FISCAL
          </p>
        )}
      </div>

      <PieDocumento accent={ac} telefono={pedido.telefono}
        asunto={`${valida ? "Factura" : "Factura proforma"} ${numero} · ${emp.nombre}`}
        texto={textoDocumento(pedido, empresa, "Factura")}
        onCerrar={onCerrar} onImprimir={() => window.print()} />
    </Modal>
  );
}

/**
 * Los albaranes de un negocio en un mes, sumados, para facturarlos de una vez.
 *
 * Es lo normal entre empresas: se entrega con albarán cada vez y se factura una
 * sola vez a fin de mes (factura recapitulativa). Esta pantalla no emite la
 * factura —eso espera a los datos fiscales—, prepara el resumen: qué albaranes
 * entran, qué se llevó cada día y cuánto suma todo.
 */
function ResumenMes({ pedidos, empresa, onCerrar }) {
  const ac = ACENTOS.pedidos;
  const emp = fusionaEmpresa(empresa);
  const [mes, setMes] = useState(() => hoy().slice(0, 7));

  // Solo albaranes: un ticket ya se cobró y una factura ya se emitió aparte.
  const albaranes = pedidos.filter(p =>
    p.documento === "Albarán" && p.estado !== "Cancelado" && String(p.fecha || "").startsWith(mes));

  // Agrupados por negocio: la razón social es quien recibe la factura.
  const porNegocio = albaranes.reduce((g, p) => {
    const clave = (p.fiscal?.razonSocial || p.nombre || "Sin nombre").trim();
    (g[clave] = g[clave] || []).push(p);
    return g;
  }, {});
  const negocios = Object.keys(porNegocio).sort((a, b) => a.localeCompare(b));

  const [negocio, setNegocio] = useState("");
  const elegido = negocio && porNegocio[negocio] ? negocio : negocios[0] || "";
  const suyos = (porNegocio[elegido] || []).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const total = suyos.reduce((t, p) => t + totalesPedido(p).total, 0);
  const { tipo, base, cuota } = desglosaIva(total, emp.iva);
  const fiscal = { ...FISCAL_VACIO, ...(suyos[0]?.fiscal || {}) };
  const euros = n => (n || 0).toFixed(2) + " €";

  // El mismo resumen, escrito, para mandárselo al negocio por WhatsApp o correo.
  const textoResumen = [
    `*${emp.nombre}*`,
    `RESUMEN PARA FACTURAR · ${mesLegible(mes).toUpperCase()}`,
    "",
    `*${elegido}*`,
    fiscal.nif ? `NIF: ${fiscal.nif}` : "",
    "",
    ...suyos.map(p => `• ${p.codigo || `#${String(p.id).slice(-4).toUpperCase()}`} · ${fechaLegible(p.fecha)}${p.sede ? ` · ${p.sede}` : ""} — ${euros(totalesPedido(p).total)}`),
    "",
    `Base imponible: ${euros(base)}`,
    `IVA ${tipo} %: ${euros(cuota)}`,
    `*TOTAL: ${euros(total)}*`,
    "",
    `${suyos.length} albar${suyos.length === 1 ? "án" : "anes"}. Resumen de albaranes, no es una factura.`,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");

  return (
    <Modal title="📄 Facturar un mes" accent={ac} onClose={onCerrar}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #resumen-imprimible, #resumen-imprimible * { visibility: visible !important; }
          #resumen-imprimible { position: absolute; left: 0; top: 0; width: 100%; padding: 0; margin: 0; }
          @page { size: A4; margin: 18mm; }
        }
      `}</style>

      <Input label="Mes" type="month" value={mes} onChange={e => setMes(e.target.value)} />

      {negocios.length === 0 ? (
        <Empty texto={`No hay albaranes en ${mesLegible(mes)}`} />
      ) : (
        <>
          <Chips label="Negocio" accent={ac} options={negocios} value={elegido} onChange={setNegocio} />

          <div id="resumen-imprimible" style={{
            background: "#fff", color: "#000", padding: 14, borderRadius: 8,
            fontFamily: "Arial, Helvetica, sans-serif", fontSize: 13, lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{emp.nombre}</div>
            <div style={{ fontSize: 12, marginBottom: 12 }}>{emp.direccion || DIRECCION_LOCAL}</div>

            <div style={{ fontSize: 11, letterSpacing: 1 }}>RESUMEN PARA FACTURAR · {mesLegible(mes).toUpperCase()}</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{elegido}</div>
            {fiscal.nif && <div style={{ fontSize: 12 }}>NIF {fiscal.nif}</div>}
            {fiscal.direccion && <div style={{ fontSize: 12, marginBottom: 10 }}>{fiscal.direccion} {fiscal.poblacion}</div>}

            <div style={{ borderTop: "2px solid #000", marginTop: 8 }} />
            {suyos.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px solid #ddd" }}>
                <span>
                  <strong>{p.codigo || `#${String(p.id).slice(-4).toUpperCase()}`}</strong> · {fechaLegible(p.fecha)}
                  {p.sede && <span style={{ color: "#555" }}> · {p.sede}</span>}
                  <span style={{ color: "#555" }}> · {(p.items || []).reduce((t, i) => t + (Number(i.cantidad) || 0), 0)} bandejas</span>
                </span>
                <span>{euros(totalesPedido(p).total)}</span>
              </div>
            ))}

            <div style={{ marginTop: 10, marginLeft: "auto", width: 260 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #ddd" }}>
                <span>Base imponible</span><span>{euros(base)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #ddd" }}>
                <span>IVA {tipo} %</span><span>{euros(cuota)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #ddd", fontWeight: 700 }}>
                <span>TOTAL</span><span>{euros(total)}</span>
              </div>
            </div>

            <p style={{ fontSize: 11, marginTop: 14, fontWeight: 700, border: "2px solid #000", padding: 8, textAlign: "center" }}>
              RESUMEN DE ALBARANES · NO ES UNA FACTURA
            </p>
            <p style={{ fontSize: 11, color: "#444" }}>
              {suyos.length} albar{suyos.length === 1 ? "án" : "anes"} de {mesLegible(mes)}.
            </p>
          </div>
        </>
      )}

      {negocios.length > 0 ? (
        <PieDocumento accent={ac} telefono={suyos[0]?.telefono}
          asunto={`Albaranes de ${mesLegible(mes)} · ${elegido}`}
          texto={textoResumen} etiquetaImprimir="🖨️ Imprimir resumen"
          onCerrar={onCerrar} onImprimir={() => window.print()} />
      ) : (
        <div className="pie-documento">
          <Btn variant="secondary" onClick={onCerrar}>Cerrar</Btn>
        </div>
      )}
    </Modal>
  );
}

function ModuloPedidos({ pedidos, setPedidos, productos, setProductos, clientes, setClientes, repartidores, empresa }) {
  const ac = ACENTOS.pedidos;
  const [modal, setModal] = useState(false);
  const [editar, setEditar] = useState(null);
  const [facturaPedido, setFacturaPedido] = useState(null);
  const [albaranPedido, setAlbaranPedido] = useState(null);
  const [ticketPedido, setTicketPedido] = useState(null);
  const [resumenMes, setResumenMes] = useState(false);
  const [expandido, setExpandido] = useState(null);   // id del pedido abierto
  // Al entrar se muestran los pendientes: es lo que hay que atender.
  const [filtroEstado, setFiltroEstado] = useState("Pendiente");
  const [filtroFecha, setFiltroFecha] = useState("");

  /**
   * Pedidos hechos en la tienda, a la espera de que alguien los acepte.
   *
   * No entran solos en la lista: la tienda es pública y cualquiera puede mandar
   * uno falso. Aquí se ven, y se aceptan o se descartan de uno en uno.
   */
  const [webs, setWebs] = useState([]);
  useEffect(() => onSnapshot(
    collection(db, "pedidosWeb"),
    (snap) => setWebs(snap.docs.map(d => ({ ...d.data(), _id: d.id }))),
    (e) => console.error("No se pudieron leer los pedidos de la tienda.", e),
  ), []);

  const descartarWeb = (w) => {
    if (!confirm(`¿Descartar el pedido de ${w.nombre}? No se podrá recuperar.`)) return;
    deleteDoc(doc(db, "pedidosWeb", w._id)).catch(() => alert("No se pudo descartar; revisa la conexión."));
  };

  const guardar = (p) => {
    const esNuevo = !editar;
    // El número definitivo se pone aquí, con la lista delante: es el único sitio
    // donde se sabe cuántos pedidos hay ya para ese día de entrega.
    setPedidos(prev => esNuevo
      ? [p.codigo?.startsWith("P") ? p : { ...p, codigo: siguienteCodigo(p.fecha, prev) }, ...prev]
      : prev.map(x => x.id === p.id ? p : x));

    // La ficha del cliente se crea o se actualiza sola con lo que traiga el pedido.
    const cifras = soloCifras(p.telefono);
    if (cifras.length >= 9) {
      setClientes(cs => {
        const i = cs.findIndex(c => soloCifras(c.telefono) === cifras);
        // Si el pedido lleva albarán o factura, el cliente se queda con sus datos
        // fiscales y con la forma en que se le factura: la próxima vez sale solo.
        const deEmpresa = pideFiscal(p.documento)
          ? { fiscal: { ...FISCAL_VACIO, ...(p.fiscal || {}) }, documentoHabitual: p.documento }
          : {};
        if (i === -1) {
          return [...cs, { id: generarId(), nombre: p.nombre || "", telefono: p.telefono || "",
                           direccion: p.direccion || "", cp: p.cp || "", ...deEmpresa }];
        }
        const actual = cs[i];
        const copia = [...cs];
        copia[i] = {
          ...actual,
          nombre: actual.nombre || p.nombre || "",
          direccion: p.direccion || actual.direccion || "",
          cp: p.cp || actual.cp || "",
          ...deEmpresa,
        };
        return copia;
      });
    }
    if (esNuevo) {
      setProductos(prods => prods.map(prod => ({
        ...prod,
        variantes: prod.variantes.map(v => {
          const it = p.items.find(i => String(i.productoId) === String(prod.id) && i.presentacion === v.presentacion);
          if (!it) return v;
          const nuevosLotes = deductFIFO(v.lotes || [], it.cantidad);
          return { ...v, lotes: nuevosLotes, stock: stockTotal(nuevosLotes) };
        })
      })));
    }
    setModal(false); setEditar(null);
  };

  /**
   * El pedido de la tienda pasa a ser un pedido de verdad: se le da un id propio,
   * entra como Pendiente y sigue el mismo camino que uno escrito a mano (crea la
   * ficha del cliente y descuenta stock). Después se quita de la bandeja, que es
   * lo que evita que se vuelva a colar dos veces.
   */
  const aceptarWeb = (w) => {
    // `km`, `lat` y `lon` se quedan: son los que luego ordenan la ruta del
    // reparto. Antes se descartaban aquí y el repartidor salía a ciegas.
    const { _id, creado, codigo, ...datos } = w;
    guardar({
      ...datos,
      id: generarId(),
      // La S que vio el cliente al pedir se guarda como referencia; el número
      // bueno (la P con su correlativo) lo pone `guardar`.
      solicitud: codigo || "",
      estado: "Pendiente",
      origen: "web",
      repartidorId: datos.tipoEntrega === "Recogida" ? REPARTIDOR_TIENDA_ID : "",
      total: totalesPedido(datos).total,
    });
    deleteDoc(doc(db, "pedidosWeb", _id)).catch(() =>
      alert("El pedido se ha añadido, pero sigue en la bandeja: descártalo a mano cuando haya conexión."));
  };

  const eliminar = (id) => { if (confirm("¿Eliminar pedido?")) setPedidos(p => p.filter(x => x.id !== id)); };
  const [estadoPendiente, setEstadoPendiente] = useState(null); // { id, estado }
  const cambiarEstado = (id, estado) => setEstadoPendiente({ id, estado });
  const confirmarEstado = () => {
    if (!estadoPendiente) return;
    setPedidos(p => p.map(x => x.id === estadoPendiente.id ? { ...x, estado: estadoPendiente.estado } : x));
    setEstadoPendiente(null);
  };

  /**
   * Cambiar quién lleva el pedido sin abrir el formulario.
   *
   * No pregunta nada, a diferencia del estado: asignar un reparto es barato y se
   * deshace pulsando otro nombre. El estado sí avisa al cliente, y de eso no se vuelve.
   */
  const asignarRepartidor = (id, repartidorId) =>
    setPedidos(p => p.map(x => x.id === id ? { ...x, repartidorId } : x));

  // Los de la calle. "Recoger en Tienda" no es un reparto: no entra en la lista.
  const repartidoresDeCalle = (repartidores || []).filter(r => r.id !== REPARTIDOR_TIENDA_ID);

  const filtrados = pedidos
    .filter(p => (filtroEstado === "Todos" || p.estado === filtroEstado) && (!filtroFecha || p.fecha === filtroFecha))
    // Lo que hay que cocinar antes, arriba: hoy primero, luego mañana, y así.
    // Un pedido sin fecha no tiene prisa conocida: al final, no estorbando los de hoy.
    .sort((a, b) =>
      String(a.fecha || "9999-99-99").localeCompare(String(b.fecha || "9999-99-99")) ||
      ESTADOS_PEDIDO.indexOf(a.estado) - ESTADOS_PEDIDO.indexOf(b.estado) ||
      String(a.rangoHorario || "~").localeCompare(String(b.rangoHorario || "~"))
    );

  // Los pedidos se agrupan por día de entrega, del más próximo al más lejano.
  const porFecha = filtrados.reduce((grupos, p) => {
    const dia = p.fecha || "Sin fecha";
    (grupos[dia] = grupos[dia] || []).push(p);
    return grupos;
  }, {});

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: ac, margin: 0, fontFamily: TIPO_TIT, fontWeight: 800}}>Pedidos</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" onClick={() => setResumenMes(true)}>📄 Facturar mes</Btn>
          <Btn accent={ac} onClick={() => { setEditar(null); setModal(true); }}>+ Nuevo</Btn>
        </div>
      </div>

      <Chips accent={ac} options={["Todos", ...ESTADOS_PEDIDO]} value={filtroEstado} onChange={setFiltroEstado} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input type="date" style={{ background: BG_INPUT, border: "1px solid #2d2e38", color: TEXT_MAIN, borderRadius: 10, padding: "9px 12px", fontSize: 13 }}
          value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
        {filtroFecha && <Btn small variant="secondary" onClick={() => setFiltroFecha("")}>✕ Limpiar fecha</Btn>}
      </div>

      {webs.length > 0 && (
        <Card accent="#22c55e" style={{ marginBottom: 14, border: "1px solid #22c55e55" }}>
          <p style={{ color: "#22c55e", fontWeight: 900, margin: "0 0 10px", fontSize: 14 }}>
            🌐 {webs.length} pedido{webs.length > 1 ? "s" : ""} nuevo{webs.length > 1 ? "s" : ""} de la tienda
          </p>
          {webs.map(w => {
            const t = totalesPedido(w);
            const bandejas = (w.items || []).reduce((n, it) => n + (Number(it.cantidad) || 0), 0);
            return (
              <div key={w._id} style={{ padding: "10px 0", borderTop: `1px solid ${BORDER}` }}>
                <p style={{ color: TEXT_MAIN, fontWeight: 800, margin: 0, fontSize: 14 }}>
                  {w.tipoEntrega === "Recogida" ? "🏪" : "🚚"} {w.nombre} · {t.total.toFixed(2)}€
                </p>
                <p style={{ color: TEXT_SUB, fontSize: 12.5, margin: "3px 0 0" }}>
                  📞 {w.telefono} · 📅 {fechaLegible(w.fecha)}{w.rangoHorario ? ` · ⏰ ${w.rangoHorario}` : ""}
                </p>
                {w.tipoEntrega === "Domicilio" && (
                  <p style={{ color: TEXT_SUB, fontSize: 12.5, margin: "3px 0 0" }}>
                    📍 {w.direccion} {w.cp}{w.km ? ` · ${w.km} km` : ""}
                  </p>
                )}
                {/* La tienda ya no bloquea las direcciones que no sitúa en el mapa:
                    deja pedir y avisa aquí, para confirmarlas antes de salir. */}
                {w.tipoEntrega === "Domicilio" && w.direccionComprobada === false && (
                  <p style={{ color: "#bf7d08", fontSize: 12.5, fontWeight: 700, margin: "4px 0 0" }}>
                    ⚠️ Dirección sin comprobar en el mapa · confírmala con el cliente
                  </p>
                )}
                <p style={{ color: TEXT_SUB, fontSize: 12.5, margin: "3px 0 0" }}>
                  🧺 {bandejas} bandeja{bandejas === 1 ? "" : "s"} · 💳 {w.formaPago}
                </p>
                {(w.items || []).map((it, i) => (
                  <span key={i} style={{ fontSize: 12, background: BORDER, borderRadius: 8, padding: "3px 9px", marginRight: 4, marginTop: 5, display: "inline-block", color: TEXT_MAIN }}>
                    {it.cantidad}x {it.nombreProducto} {it.presentacion} ({preparacionDe(it)})
                  </span>
                ))}
                {w.nota && <p style={{ color: TEXT_SUB, fontSize: 12.5, margin: "5px 0 0", fontStyle: "italic" }}>📝 {w.nota}</p>}
                <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                  <Btn small variant="success" onClick={() => aceptarWeb(w)}>✓ Aceptar</Btn>
                  <Btn small variant="danger" onClick={() => descartarWeb(w)}>✕ Descartar</Btn>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {filtrados.length === 0 ? <Empty texto="No hay pedidos con estos filtros" /> : Object.entries(porFecha).map(([dia, delDia]) => (
        <div key={dia}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 8px" }}>
            <span style={{ color: ac, fontWeight: 900, fontSize: 14 }}>{etiquetaDia(dia)}</span>
            <span style={{ color: TEXT_SUB, fontSize: 12 }}>{delDia.length} pedido{delDia.length > 1 ? "s" : ""}</span>
            <span style={{ flex: 1, height: 1, background: BORDER }} />
            <span style={{ color: TEXT_SUB, fontSize: 12, fontWeight: 700 }}>
              {delDia.reduce((t, x) => t + totalesPedido(x).total, 0).toFixed(2)}€
            </span>
          </div>
          {delDia.map(p => {
            const abierto = expandido === p.id;
            const unidades = (p.items || []).reduce((t, it) => t + (Number(it.cantidad) || 0), 0);
            return (
            <Card key={p.id} accent={ESTADO_COLORS[p.estado]}
              style={abierto ? { marginBottom: 12 } : { padding: "10px 14px", marginBottom: 6 }}>
              {/* Fila resumida: siempre visible. Al pulsarla se despliega el detalle. */}
              <div onClick={() => setExpandido(abierto ? null : p.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <span style={{ color: TEXT_SUB, fontSize: 13, width: 14 }}>{abierto ? "▾" : "▸"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: TEXT_MAIN, fontWeight: 800, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.tipoEntrega === "Recogida" ? "🏪" : "🚚"} {p.nombre}
                    {/* Un pedido de empresa no se trata igual: que se vea sin abrirlo. */}
                    {pideFiscal(p.documento) && (
                      <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: MARRON,
                        background: `${MARRON}18`, border: `1px solid ${MARRON}44`, borderRadius: 6, padding: "1px 6px" }}>
                        {p.documento === "Albarán" ? "ALBARÁN" : "FACTURA"}
                      </span>
                    )}
                  </p>
                  <p style={{ color: TEXT_SUB, fontSize: 12.5, margin: "2px 0 0" }}>
                    {p.rangoHorario ? `⏰ ${p.rangoHorario}` : "Sin hora"} · {unidades} bandeja{unidades === 1 ? "" : "s"}
                  </p>
                  {/* Quién lo lleva, sin tener que abrir el pedido. Si falta, se ve. */}
                  <ChipRepartidor pedido={p} repartidores={repartidores} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ color: ac, fontWeight: 800, margin: "0 0 4px", fontSize: 15 }}>{totalesPedido(p).total.toFixed(2)}€</p>
                  <Badge estado={p.estado} />
                </div>
              </div>

              {abierto && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 4px" }}>📞 {p.telefono}</p>
                      {p.tipoEntrega === "Domicilio" && <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 4px" }}>📍 {p.direccion} {p.cp}</p>}
                      <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 4px" }}>📅 {p.fecha} {p.rangoHorario && `· ⏰ ${p.rangoHorario}`}</p>
                      <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 6px" }}>💳 {p.formaPago} · {p.tipoEntrega}</p>
                      {p.items?.map((it, i) => (
                        <span key={i} style={{ fontSize: 12, background: BORDER, borderRadius: 8, padding: "3px 9px", marginRight: 4, marginBottom: 4, display: "inline-block", color: TEXT_MAIN }}>
                          {it.cantidad}x {it.nombreProducto} {it.presentacion} ({preparacionDe(it)})
                        </span>
                      ))}
                      {totalesPedido(p).servicio > 0 && <p style={{ color: "#666", fontSize: 12, margin: "4px 0 0" }}>🔥 Fritura: {totalesPedido(p).servicio.toFixed(2)}€</p>}
                      {totalesPedido(p).envio > 0 && <p style={{ color: "#666", fontSize: 12, margin: "4px 0 0" }}>🚴 Envío: {totalesPedido(p).envio.toFixed(2)}€</p>}
                      <p style={{ color: "#666", fontSize: 12, margin: "4px 0 0" }}>🛵 {quienEntrega(p, repartidores)}</p>
                      <p style={{ color: ac, fontWeight: 800, margin: "6px 0 0", fontSize: 15 }}>Total: {totalesPedido(p).total.toFixed(2)}€</p>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {/* Abre WhatsApp con la confirmación escrita; el envío lo da el dueño. */}
                      <Btn small variant="secondary" accent="#22c55e"
                        onClick={() => {
                          const enlace = enlaceConfirmacion(p);
                          if (!enlace) { alert("Este pedido no tiene un teléfono válido para WhatsApp."); return; }
                          window.open(enlace, "_blank", "noopener");
                        }}>💬</Btn>
                      <Btn small variant="secondary" onClick={() => { setEditar(p); setModal(true); }}>✏️</Btn>
                      {/* El papel lleva el número de pedido, y ese número vale
                          cuando el pedido está aceptado: pendiente aún puede caerse. */}
                      {p.estado !== "Pendiente" && p.estado !== "Cancelado" && (
                        p.documento === "Albarán"
                          ? <Btn small variant="secondary" onClick={() => setAlbaranPedido(p)}>📋 Albarán</Btn>
                          : p.documento === "Factura"
                            ? <Btn small variant="success" onClick={() => setFacturaPedido(p)}>🧾 Factura</Btn>
                            : <Btn small variant="secondary" onClick={() => setTicketPedido(p)}>🖨️</Btn>
                      )}
                      <Btn small variant="danger" onClick={() => eliminar(p.id)}>🗑️</Btn>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #25262f" }}>
                    <Chips label="Estado del pedido" accent={ESTADO_COLORS[p.estado]} options={ESTADOS_PEDIDO} value={p.estado} onChange={v => cambiarEstado(p.id, v)} />
                    {/* Quién lo lleva, aquí mismo: antes había que abrir el formulario entero. */}
                    {p.tipoEntrega === "Recogida"
                      ? <p style={{ color: TEXT_SUB, fontSize: 12.5, margin: 0 }}>🏪 Lo recoge el cliente en tienda: no necesita repartidor.</p>
                      : repartidoresDeCalle.length === 0
                        ? <p style={{ color: TEXT_SUB, fontSize: 12.5, margin: 0 }}>Todavía no hay repartidores dados de alta. Créalos en 🛵 Repartidores.</p>
                        : <Chips label="Repartidor" accent={ac}
                            options={[{ value: "", label: "Sin asignar" }, ...repartidoresDeCalle.map(r => ({ value: r.id, label: r.nombre }))]}
                            value={p.repartidorId || ""} onChange={v => asignarRepartidor(p.id, v)} />}
                  </div>
                </div>
              )}
            </Card>
            );
          })}
        </div>
      ))}

      {(modal || editar) && (
        <FormularioPedido productos={productos} clientes={clientes} repartidores={repartidores} pedidos={pedidos}
          onGuardar={guardar} onCerrar={() => { setModal(false); setEditar(null); }} pedidoEditar={editar} />
      )}
      {facturaPedido && <FacturaPedido pedido={facturaPedido} empresa={empresa} onCerrar={() => setFacturaPedido(null)} />}
      {albaranPedido && <AlbaranPedido pedido={albaranPedido} empresa={empresa} onCerrar={() => setAlbaranPedido(null)} />}
      {resumenMes && <ResumenMes pedidos={pedidos} empresa={empresa} onCerrar={() => setResumenMes(false)} />}
      {ticketPedido && <TicketPedido pedido={ticketPedido} repartidores={repartidores} onCerrar={() => setTicketPedido(null)} />}

      {estadoPendiente && (() => {
        const pedido = pedidos.find(x => x.id === estadoPendiente.id);
        // Al confirmar es cuando toca avisar al cliente: el pedido de la web ya no
        // pasa por WhatsApp, así que este es el primer mensaje que recibe.
        const avisar = estadoPendiente.estado === "Confirmado";
        const enlace = avisar ? enlaceConfirmacion(pedido) : null;
        return (
          <Modal title="Confirmar cambio de estado" accent={ac} onClose={() => setEstadoPendiente(null)}>
            <p style={{ color: TEXT_MAIN, fontSize: 15, margin: "0 0 14px" }}>
              ¿Cambiar el estado a <strong style={{ color: ESTADO_COLORS[estadoPendiente.estado] }}>{estadoPendiente.estado}</strong>?
            </p>
            {avisar && (
              <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 18px", lineHeight: 1.5 }}>
                {enlace
                  ? <>Puedes avisar a <strong style={{ color: TEXT_MAIN }}>{pedido?.nombre}</strong> por WhatsApp. Se abre con el mensaje escrito; el envío lo das tú.</>
                  : <>⚠️ No se puede avisar por WhatsApp: el teléfono <strong style={{ color: TEXT_MAIN }}>{pedido?.telefono || "—"}</strong> no es válido.</>}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Btn variant="secondary" onClick={() => setEstadoPendiente(null)}>Cancelar</Btn>
              <Btn variant="secondary" onClick={confirmarEstado}>
                {avisar ? "Solo confirmar" : "Guardar"}
              </Btn>
              {avisar && enlace && (
                <Btn accent="#22c55e" onClick={() => { window.open(enlace, "_blank", "noopener"); confirmarEstado(); }}>
                  💬 Confirmar y avisar
                </Btn>
              )}
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

// ─── MÓDULO: CALENDARIO ──────────────────────────────────────────────────────
function ModuloCalendario({ pedidos }) {
  const ac = ACENTOS.calendario;
  const [mesActual, setMesActual] = useState(new Date());
  const año = mesActual.getFullYear();
  const mes = mesActual.getMonth();
  const primerDia = new Date(año, mes, 1).getDay();
  const diasEnMes = new Date(año, mes + 1, 0).getDate();
  const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  const pedidosPorDia = (dia) => {
    const fecha = `${año}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    return pedidos.filter(p => p.fecha === fecha);
  };

  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const pedidosDia = diaSeleccionado ? pedidosPorDia(diaSeleccionado) : [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: ac, margin: 0, fontFamily: TIPO_TIT, fontWeight: 800}}>Calendario</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn small variant="secondary" onClick={() => setMesActual(new Date(año, mes - 1, 1))}>‹</Btn>
          <span style={{ color: TEXT_MAIN, fontWeight: 700, padding: "6px 12px" }}>{meses[mes]} {año}</span>
          <Btn small variant="secondary" onClick={() => setMesActual(new Date(año, mes + 1, 1))}>›</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 16 }}>
        {diasSemana.map(d => <div key={d} style={{ color: "#666", fontSize: 11, textAlign: "center", fontWeight: 700, padding: "6px 0" }}>{d}</div>)}
        {Array.from({ length: primerDia }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: diasEnMes }).map((_, i) => {
          const dia = i + 1;
          const pp = pedidosPorDia(dia);
          const esHoy = hoy() === `${año}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
          const seleccionado = diaSeleccionado === dia;
          return (
            <div key={dia} onClick={() => setDiaSeleccionado(seleccionado ? null : dia)}
              style={{
                background: seleccionado ? ac + "33" : esHoy ? ac + "18" : BG_CARD,
                border: `1px solid ${seleccionado ? ac : esHoy ? ac + "55" : BORDER}`,
                borderRadius: 10, padding: "8px 4px", textAlign: "center", cursor: "pointer", minHeight: 54, transition: "all .15s"
              }}>
              <div style={{ color: esHoy ? ac : TEXT_MAIN, fontSize: 13, fontWeight: esHoy ? 800 : 400 }}>{dia}</div>
              {pp.length > 0 && (
                <span style={{ background: ac, color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 11, fontWeight: 800 }}>{pp.length}</span>
              )}
            </div>
          );
        })}
      </div>

      {diaSeleccionado && (
        <div>
          <p style={{ color: TEXT_SUB, fontSize: 13, marginBottom: 8 }}>Pedidos para el {diaSeleccionado} de {meses[mes]}</p>
          {pedidosDia.length === 0 ? <Empty texto="Sin pedidos este día" /> : pedidosDia.map(p => (
            <Card key={p.id} accent={ESTADO_COLORS[p.estado]}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ color: TEXT_MAIN, fontWeight: 800, margin: "0 0 4px" }}>{p.nombre}</p>
                  <p style={{ color: TEXT_SUB, fontSize: 13, margin: 0 }}>⏰ {p.rangoHorario || "Sin horario"} · 💳 {p.formaPago}</p>
                  {p.tipoEntrega === "Domicilio" && <p style={{ color: TEXT_SUB, fontSize: 13, margin: "2px 0 0" }}>📍 {p.direccion}</p>}
                </div>
                <Badge estado={p.estado} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MÓDULO: RUTAS ───────────────────────────────────────────────────────────
function ModuloRutas({ pedidos }) {
  const ac = ACENTOS.rutas;
  const [fechaRuta, setFechaRuta] = useState(hoy());
  const pedidosDia = pedidos.filter(p => p.fecha === fechaRuta && p.tipoEntrega === "Domicilio" && p.estado !== "Cancelado" && p.estado !== "Entregado");

  const abrirEnMaps = () => {
    if (pedidosDia.length === 0) return;
    const destinos = pedidosDia.map(p => encodeURIComponent(`${p.direccion} ${p.cp} Madrid`)).join("/");
    window.open(`https://www.google.com/maps/dir/${destinos}`, "_blank");
  };

  return (
    <div>
      <h2 style={{ color: ac, margin: "0 0 16px", fontFamily: TIPO_TIT, fontWeight: 800}}>Rutas del Día</h2>
      <Input label="Fecha de la ruta" type="date" value={fechaRuta} onChange={e => setFechaRuta(e.target.value)} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
        {[
          { label: "Entregas", valor: pedidosDia.length, color: ac },
          { label: "Confirmados", valor: pedidosDia.filter(p => p.estado === "Confirmado").length, color: "#3b82f6" },
          { label: "En ruta", valor: pedidosDia.filter(p => p.estado === "En ruta").length, color: "#8b5cf6" },
        ].map(stat => (
          <Card key={stat.label} accent={stat.color} style={{ textAlign: "center", padding: 14 }}>
            <p style={{ color: stat.color, fontSize: 26, fontWeight: 800, margin: 0 }}>{stat.valor}</p>
            <p style={{ color: "#666", fontSize: 11, margin: 0 }}>{stat.label}</p>
          </Card>
        ))}
      </div>

      {pedidosDia.length === 0 ? <Empty texto="Sin entregas a domicilio para esta fecha" /> : (
        <>
          {pedidosDia.map((p, idx) => (
            <Card key={p.id} accent={ac}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ background: ac, color: "#fff", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{idx + 1}</div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: TEXT_MAIN, fontWeight: 800, margin: "0 0 4px" }}>{p.nombre}</p>
                  <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 2px" }}>📍 {p.direccion}, {p.cp}</p>
                  <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 4px" }}>⏰ {p.rangoHorario || "Sin horario"} · 💳 {p.formaPago}</p>
                  {p.items?.map((it, i) => (
                    <span key={i} style={{ fontSize: 11, background: "#1f2028", borderRadius: 8, padding: "2px 7px", marginRight: 4, color: TEXT_SUB }}>
                      {it.cantidad}x {it.nombreProducto} ({preparacionDe(it)})
                    </span>
                  ))}
                  <p style={{ color: ac, fontWeight: 800, margin: "6px 0 0", fontSize: 14 }}>{totalesPedido(p).total.toFixed(2)}€</p>
                </div>
                <Badge estado={p.estado} />
              </div>
            </Card>
          ))}
          <Btn accent={ac} onClick={abrirEnMaps} style={{ width: "100%", marginTop: 4 }}>🗺️ Abrir ruta en Google Maps</Btn>
        </>
      )}
    </div>
  );
}

// ─── MÓDULO: CLIENTES ────────────────────────────────────────────────────────
function ModuloClientes({ clientes, setClientes, pedidos, irInicio }) {
  const ac = ACENTOS.clientes;
  const [modal, setModal] = useState(false);
  const VACIO = { nombre: "", telefono: "", direccion: "", cp: "", documentoHabitual: "Ticket", fiscal: { ...FISCAL_VACIO }, sedes: [] };
  const [form, setForm] = useState(VACIO);
  const [editar, setEditar] = useState(null);   // id del cliente que se está cambiando
  const [buscar, setBuscar] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setFiscal = (k, v) => setForm(f => ({ ...f, fiscal: { ...FISCAL_VACIO, ...f.fiscal, [k]: v } }));

  const abrirNuevo = () => { setForm(VACIO); setEditar(null); setModal(true); };
  const abrirEditar = (c) => {
    setForm({ ...VACIO, ...c, fiscal: { ...FISCAL_VACIO, ...(c.fiscal || {}) }, sedes: c.sedes || [] });
    setEditar(c.id); setModal(true);
  };

  /**
   * Sedes: un mismo negocio que recibe en varios sitios.
   *
   * Los datos fiscales son uno solo (una razón social, un CIF, una factura), pero
   * la mercancía va a cuatro direcciones distintas. Por eso las sedes cuelgan del
   * cliente y no son cuatro clientes: así el albarán lleva la dirección correcta
   * y a fin de mes todo se factura junto.
   */
  const añadirSede = () => setForm(f => ({
    ...f, sedes: [...(f.sedes || []), { id: generarId(), nombre: "", direccion: "", cp: "", telefono: "", contacto: "" }],
  }));
  const cambiarSede = (id, k, v) => setForm(f => ({
    ...f, sedes: (f.sedes || []).map(s => s.id === id ? { ...s, [k]: v } : s),
  }));
  const quitarSede = (id) => setForm(f => ({ ...f, sedes: (f.sedes || []).filter(s => s.id !== id) }));

  const guardar = () => {
    if (!form.nombre || !form.telefono) return;
    // Si no es un cliente de empresa, no se le guardan datos fiscales a medias.
    // Las sedes a medio escribir (sin nombre ni dirección) tampoco se guardan.
    const sedes = (form.sedes || []).filter(s => (s.nombre || "").trim() || (s.direccion || "").trim());
    const limpio = pideFiscal(form.documentoHabitual)
      ? { ...form, sedes }
      : { ...form, sedes, fiscal: { ...FISCAL_VACIO }, documentoHabitual: "Ticket" };
    setClientes(c => editar
      ? c.map(x => x.id === editar ? { ...x, ...limpio, id: editar } : x)
      : [...c, { ...limpio, id: generarId() }]);
    setForm(VACIO); setEditar(null); setModal(false);
  };

  const buscarDigitos = buscar.replace(/\D/g, "");
  const filtrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(buscar.toLowerCase()) ||
    (buscarDigitos.length > 0 && c.telefono.replace(/\D/g, "").includes(buscarDigitos))
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: ac, margin: 0, fontFamily: TIPO_TIT, fontWeight: 800}}>Clientes</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn accent={ac} onClick={abrirNuevo}>+ Nuevo</Btn>
        </div>
      </div>
      <Input placeholder="🔍 Buscar por nombre o teléfono..." value={buscar} onChange={e => setBuscar(e.target.value)} />

      {filtrados.length === 0 ? <Empty texto="No hay clientes registrados" /> : filtrados.map(c => {
        const historial = pedidos.filter(p => p.telefono === c.telefono);
        const totalGastado = historial.reduce((s, p) => s + totalesPedido(p).total, 0);
        return (
          <Card key={c.id} accent={ac}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{ color: TEXT_MAIN, fontWeight: 800, margin: "0 0 4px" }}>
                  {c.nombre}
                  {pideFiscal(c.documentoHabitual) && (
                    <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: MARRON,
                      background: `${MARRON}18`, border: `1px solid ${MARRON}44`, borderRadius: 6, padding: "1px 6px" }}>
                      {c.documentoHabitual === "Albarán" ? "ALBARÁN" : "FACTURA"}
                    </span>
                  )}
                </p>
                <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 2px" }}>📞 {c.telefono}</p>
                {c.direccion && <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 2px" }}>📍 {c.direccion} {c.cp}</p>}
                {c.fiscal?.razonSocial && (
                  <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 2px" }}>
                    🏢 {c.fiscal.razonSocial}{c.fiscal.nif ? ` · ${c.fiscal.nif}` : ""}
                  </p>
                )}
                <p style={{ color: "#666", fontSize: 12, margin: "4px 0 0" }}>
                  {historial.length} pedido{historial.length !== 1 ? "s" : ""}{totalGastado > 0 && ` · ${totalGastado.toFixed(2)}€ total`}
                </p>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn small variant="secondary" onClick={() => abrirEditar(c)}>✏️</Btn>
                <Btn small variant="danger" onClick={() => setClientes(cl => cl.filter(x => x.id !== c.id))}>🗑️</Btn>
              </div>
            </div>
          </Card>
        );
      })}

      {modal && (
        <Modal title={editar ? "Editar cliente" : "Nuevo Cliente"} accent={ac} onClose={() => setModal(false)}>
          <Input label="Nombre *" value={form.nombre} onChange={e => set("nombre", e.target.value)}
            placeholder="Como lo llamas tú: Trujillo Burgers" />
          <Input label="Teléfono *" value={form.telefono} onChange={e => set("telefono", e.target.value)} />
          <Input label="Dirección" value={form.direccion} onChange={e => set("direccion", e.target.value)} />
          <Input label="Código Postal" value={form.cp} onChange={e => set("cp", e.target.value)} />

          {/* Cómo se le factura habitualmente. Al elegirlo en un pedido, la app
              marca sola el documento y trae estos datos ya rellenos. */}
          <Chips label="Documento habitual" accent={ac} options={DOCUMENTOS}
            value={form.documentoHabitual || "Ticket"} onChange={v => set("documentoHabitual", v)} />
          {pideFiscal(form.documentoHabitual) && (
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14, background: BG_APP }}>
              <p style={{ color: TEXT_SUB, fontSize: 12, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: .5 }}>
                Datos fiscales
              </p>
              <Input label="Razón social" value={form.fiscal?.razonSocial || ""} onChange={e => setFiscal("razonSocial", e.target.value)}
                placeholder="Quien factura: Unión Trujillo S.L." />
              <Input label="NIF / CIF" value={form.fiscal?.nif || ""} onChange={e => setFiscal("nif", e.target.value)} placeholder="B88556998" />
              <Input label="Dirección fiscal" value={form.fiscal?.direccion || ""} onChange={e => setFiscal("direccion", e.target.value)} placeholder="Calle Bolívar 18" />
              <Input label="Población" value={form.fiscal?.poblacion || ""} onChange={e => setFiscal("poblacion", e.target.value)} placeholder="Madrid" />
              <Input label="Persona que recibe" value={form.fiscal?.contacto || ""} onChange={e => setFiscal("contacto", e.target.value)} placeholder="Quién firma la entrega" />
            </div>
          )}

          {/* Sedes: mismo CIF, varias direcciones de entrega. */}
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 14, background: BG_APP }}>
            <p style={{ color: TEXT_SUB, fontSize: 12, fontWeight: 700, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: .5 }}>
              Sedes
            </p>
            <p style={{ color: TEXT_SUB, fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.5 }}>
              Solo si el negocio recibe en varios sitios. Al hacer el pedido eliges a cuál
              va, y el albarán sale con esa dirección. La factura sigue siendo una sola.
            </p>
            {(form.sedes || []).map((s, i) => (
              <div key={s.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: 10, marginBottom: 8, background: BG_CARD }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ color: TEXT_SUB, fontSize: 12, fontWeight: 700 }}>Sede {i + 1}</span>
                  <button onClick={() => quitarSede(s.id)}
                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>✕</button>
                </div>
                <Input label="Nombre de la sede" value={s.nombre} onChange={e => cambiarSede(s.id, "nombre", e.target.value)} placeholder="Ej: Bolívar" />
                <Input label="Dirección" value={s.direccion} onChange={e => cambiarSede(s.id, "direccion", e.target.value)} placeholder="Calle y número" />
                <Input label="Código postal" value={s.cp} onChange={e => cambiarSede(s.id, "cp", e.target.value)} placeholder="28045" />
                <Input label="Teléfono de la sede" value={s.telefono || ""} onChange={e => cambiarSede(s.id, "telefono", e.target.value)} placeholder="Para que el repartidor llame allí" />
                <Input label="Persona que recibe" value={s.contacto} onChange={e => cambiarSede(s.id, "contacto", e.target.value)} placeholder="Quién firma allí" />
              </div>
            ))}
            <Btn small variant="secondary" accent={ac} onClick={añadirSede}>+ Añadir sede</Btn>
          </div>

          <div className="pie-documento">
            <Btn variant="secondary" onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn accent={ac} onClick={guardar}>Guardar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MÓDULO: MOSTRADOR ──────────────────────────────────────────────────────
// Salida de bandejas al local por la mañana y devolución al cerrar. El TPV no está
// enlazado, así que lo vendido se calcula por diferencia (ver src/mostrador.js).
function ModuloMostrador({ productos, setProductos, jornadas, setJornadas }) {
  const ac = ACENTOS.mostrador;
  const abierta = jornadas.find(j => !j.cerrada);
  const [salidas, setSalidas] = useState({});   // "prodId|presentacion" -> bandejas
  const [devol, setDevol] = useState({});       // "prodId|presentacion" -> {bandejas, sueltas, merma}
  const [verHistorico, setVerHistorico] = useState(false);

  const clave = (prodId, pres) => `${prodId}|${pres}`;
  const sueltasDe = (prodId) => productos.find(p => String(p.id) === String(prodId))?.sueltas || 0;

  const abrirJornada = () => {
    const lista = [];
    for (const [k, bandejas] of Object.entries(salidas)) {
      const n = parseInt(bandejas) || 0;
      if (n <= 0) continue;
      const [productoId, presentacion] = k.split("|");
      // Las sueltas que quedaron de ayer salen las primeras.
      const yaPuesto = lista.some(l => String(l.productoId) === String(productoId));
      lista.push({ productoId, presentacion, bandejas: n, sueltas: yaPuesto ? 0 : sueltasDe(productoId) });
    }
    if (!lista.length) { alert("Marca cuántas bandejas sacas al mostrador."); return; }

    const resumen = lista.map(l => {
      const prod = productos.find(p => String(p.id) === String(l.productoId));
      return `· ${l.bandejas} x ${l.presentacion} de ${prod?.nombre}` + (l.sueltas ? ` (+${l.sueltas} sueltas de ayer)` : "");
    }).join("\n");
    if (!confirm(`Salen al mostrador:\n${resumen}\n\n¿Continuar?`)) return;

    // Reservadas: siguen en el stock pero no disponibles para la web ni para pedidos.
    setProductos(ps => ps.map(p => {
      const suyas = lista.filter(l => String(l.productoId) === String(p.id));
      if (!suyas.length) return p;
      return {
        ...p,
        sueltas: 0,
        variantes: p.variantes.map(v => {
          const l = suyas.find(x => x.presentacion === v.presentacion);
          return l ? { ...v, enMostrador: (v.enMostrador || 0) + l.bandejas } : v;
        }),
      };
    }));

    setJornadas(js => [{ id: generarId(), fecha: hoy(), abierta: new Date().toISOString(), salidas: lista, devoluciones: [], cerrada: false }, ...js]);
    setSalidas({});
  };

  const devolucionesDe = (mapa) => (abierta?.salidas || []).map(sal => {
    const d = mapa[clave(sal.productoId, sal.presentacion)] || {};
    return {
      productoId: sal.productoId, presentacion: sal.presentacion,
      bandejas: parseInt(d.bandejas) || 0,
      sueltas: parseInt(d.sueltas) || 0,
      merma: parseInt(d.merma) || 0,
    };
  });

  const cerrarJornada = () => {
    const devoluciones = devolucionesDe(devol);
    const cuentas = cuentasJornada({ ...abierta, devoluciones }, productos);
    const sobra = cuentas.lineas.find(l => l.bandejasDevueltas > l.bandejasSacadas);
    if (sobra) { alert(`En ${sobra.nombre} devuelves más bandejas de las que sacaste.`); return; }

    const resumen = cuentas.lineas.filter(l => l.vendidas || l.merma)
      .map(l => `· ${l.nombre}: ${l.vendidas} uds vendidas` + (l.merma ? ` · ${l.merma} de merma` : "")).join("\n");
    if (!confirm(`Cierre del mostrador:\n${resumen || "· sin ventas"}\n\nTotal estimado: ${cuentas.importe.toFixed(2)}€\n\n¿Guardar?`)) return;

    // Lo que no vuelve entero sale del stock: vendido o bandeja abierta.
    setProductos(ps => ps.map(p => {
      const suyas = cuentas.lineas.filter(l => String(l.productoId) === String(p.id));
      if (!suyas.length) return p;
      const sueltasQueVuelven = suyas.reduce((t, l) => t + l.sueltasDevueltas, 0);
      return {
        ...p,
        sueltas: sueltasQueVuelven,
        variantes: p.variantes.map(v => {
          const l = suyas.find(x => x.presentacion === v.presentacion);
          if (!l) return v;
          const lotes = deductFIFO(v.lotes || [], l.bandejasConsumidas);
          return {
            ...v,
            lotes,
            stock: (v.lotes || []).length ? stockTotal(lotes) : Math.max(0, (v.stock || 0) - l.bandejasConsumidas),
            enMostrador: Math.max(0, (v.enMostrador || 0) - l.bandejasSacadas),
          };
        }),
      };
    }));

    setJornadas(js => js.map(j => j.id === abierta.id
      ? { ...j, devoluciones, cerrada: new Date().toISOString(), vendidas: cuentas.vendidas, importe: cuentas.importe, merma: cuentas.merma }
      : j));
    setDevol({});
  };

  const cerradas = jornadas.filter(j => j.cerrada);
  const cuentasEnVivo = abierta ? cuentasJornada({ ...abierta, devoluciones: devolucionesDe(devol) }, productos) : null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: ac, margin: 0, fontFamily: TIPO_TIT, fontWeight: 800}}>Mostrador</h2>
        {cerradas.length > 0 && (
          <Btn small variant="secondary" onClick={() => setVerHistorico(v => !v)}>
            {verHistorico ? "Ocultar días" : "Ver días anteriores"}
          </Btn>
        )}
      </div>

      {!abierta ? (
        <Card accent={ac}>
          <p style={{ color: TEXT_MAIN, fontWeight: 800, margin: "0 0 4px" }}>Abrir jornada</p>
          <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 12px" }}>
            Marca las bandejas que sacas al local. Dejan de estar disponibles para la web hasta que cierres.
          </p>
          {productos.length === 0 && <Empty texto="No hay productos en el inventario" />}
          {productos.map(prod => (
            <div key={prod.id} style={{ padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
              <p style={{ color: TEXT_MAIN, fontSize: 14, fontWeight: 700, margin: "0 0 6px" }}>
                {prod.nombre}
                {sueltasDe(prod.id) > 0 && <span style={{ color: ac, fontSize: 12 }}> · {sueltasDe(prod.id)} sueltas de ayer</span>}
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {prod.variantes.map(v => {
                  const libres = disponibles(v);
                  return (
                    <div key={v.presentacion} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: TEXT_SUB, fontSize: 12 }}>{v.presentacion} <small>({libres} disp.)</small></span>
                      <input type="number" min="0" max={libres} value={salidas[clave(prod.id, v.presentacion)] || ""}
                        onChange={e => {
                          const n = Math.min(parseInt(e.target.value) || 0, libres);
                          setSalidas(x => ({ ...x, [clave(prod.id, v.presentacion)]: n || "" }));
                        }}
                        style={{ width: 64, background: BG_INPUT, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT_MAIN, padding: "5px 8px", fontSize: 13 }} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <Btn accent={ac} onClick={abrirJornada} style={{ width: "100%", marginTop: 14 }}>🏪 Sacar al mostrador</Btn>
        </Card>
      ) : (
        <Card accent={ac}>
          <p style={{ color: TEXT_MAIN, fontWeight: 800, margin: "0 0 4px" }}>Cerrar jornada del {abierta.fecha}</p>
          <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 12px" }}>Cuenta lo que vuelve. Lo que falte se da por vendido.</p>
          {(abierta.salidas || []).map(sal => {
            const prod = productos.find(p => String(p.id) === String(sal.productoId));
            const k = clave(sal.productoId, sal.presentacion);
            const d = devol[k] || {};
            const set = (campo, valor) => setDevol(x => ({ ...x, [k]: { ...x[k], [campo]: valor } }));
            return (
              <div key={k} style={{ padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
                <p style={{ color: TEXT_MAIN, fontSize: 14, fontWeight: 700, margin: "0 0 2px" }}>{prod?.nombre}</p>
                <p style={{ color: TEXT_SUB, fontSize: 12, margin: "0 0 8px" }}>
                  Sacaste {sal.bandejas} x {sal.presentacion}{sal.sueltas ? ` y ${sal.sueltas} sueltas` : ""}
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[["bandejas", "Bandejas enteras"], ["sueltas", "Unidades sueltas"], ["merma", "Merma (uds)"]].map(([campo, etiqueta]) => (
                    <div key={campo}>
                      <p style={{ color: TEXT_SUB, fontSize: 11, margin: "0 0 2px" }}>{etiqueta}</p>
                      <input type="number" min="0" value={d[campo] || ""} onChange={e => set(campo, e.target.value)}
                        style={{ width: 92, background: BG_INPUT, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT_MAIN, padding: "6px 8px", fontSize: 13 }} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 12, padding: 12, background: BG_INPUT, borderRadius: 12 }}>
            <p style={{ color: TEXT_MAIN, fontSize: 14, fontWeight: 800, margin: 0 }}>
              Vendidas: {cuentasEnVivo.vendidas} uds · {cuentasEnVivo.importe.toFixed(2)}€
              <span style={{ color: TEXT_SUB, fontWeight: 400, fontSize: 12 }}> (estimado)</span>
            </p>
            {cuentasEnVivo.merma > 0 && <p style={{ color: "#ef4444", fontSize: 12, margin: "4px 0 0" }}>Merma: {cuentasEnVivo.merma} uds</p>}
          </div>
          <Btn accent={ac} onClick={cerrarJornada} style={{ width: "100%", marginTop: 14 }}>✅ Cerrar y devolver al stock</Btn>
        </Card>
      )}

      {verHistorico && cerradas.map(j => {
        const c = cuentasJornada(j, productos);
        return (
          <Card key={j.id}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: TEXT_MAIN, fontWeight: 700, fontSize: 14 }}>{j.fecha}</span>
              <span style={{ color: ac, fontWeight: 800, fontSize: 14 }}>{(j.importe || 0).toFixed(2)}€</span>
            </div>
            <p style={{ color: TEXT_SUB, fontSize: 12, margin: "4px 0 8px" }}>
              {j.vendidas || 0} uds vendidas{j.merma ? ` · ${j.merma} de merma` : ""}
            </p>
            {c.lineas.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", borderTop: `1px solid ${BORDER}` }}>
                <span style={{ color: TEXT_SUB, fontSize: 12 }}>
                  {l.nombre} · {l.presentacion}
                </span>
                <span style={{ color: TEXT_MAIN, fontSize: 12, textAlign: "right" }}>
                  saqué {l.bandejasSacadas}{l.sueltasIniciales ? `+${l.sueltasIniciales}u` : ""} ·
                  volvieron {l.bandejasDevueltas}{l.sueltasDevueltas ? `+${l.sueltasDevueltas}u` : ""} ·
                  <strong style={{ color: ac }}> {l.vendidas} uds</strong>
                </span>
              </div>
            ))}
          </Card>
        );
      })}
    </div>
  );
}

// ─── MÓDULO: INVENTARIO ──────────────────────────────────────────────────────

// Cómo se muestra cada bandeja en la tienda pública. "" = normal.
// Solo cuenta lo que se marque aquí: el stock no se usa todavía (está a 0 en todo).
const ETIQUETAS_WEB = [
  { valor: "",      texto: "A la venta",   color: "#10b981", ayuda: "Se puede pedir para hoy mismo" },
  { valor: "24h",   texto: "Encargo 24 h", color: "#f59e0b", ayuda: "En la web solo se podrá pedir para mañana en adelante" },
  { valor: "48h",   texto: "Encargo 48 h", color: "#f97316", ayuda: "En la web solo se podrá pedir con dos días de antelación" },
  { valor: "agotado", texto: "Agotado",    color: "#ef4444", ayuda: "Se ve en la tienda pero no se puede pedir" },
];
const CATEGORIAS_PRODUCTO = ["Tequeños", "Empanadas", "Pastelitos", "Otros"];

// Extrae el número de unidades de una presentación (ej: "Bandeja 25" → 25, "Bandeja 50" → 50, "Unidad" → 1)
/** Solo las cifras, para comparar teléfonos escritos de mil maneras. */
function soloCifras(tel = "") {
  return String(tel).replace(/\D/g, "").replace(/^34/, "");
}

function unidadesPorPresentacion(presentacion = "") {
  const m = presentacion.match(/\d+/);
  return m ? parseInt(m[0]) : 1;
}

function ModuloInventario({ productos, setProductos }) {
  const ac = ACENTOS.inventario;
  const [editandoPrecio, setEditandoPrecio] = useState(null);
  const [editandoStock, setEditandoStock] = useState(null);
  const [modalProd, setModalProd] = useState(false);
  const [modalPres, setModalPres] = useState(null); // prodId
  const [formProd, setFormProd] = useState({ nombre: "", categoria: "Tequeños" });
  const [nuevaPres, setNuevaPres] = useState("");

  const actualizarPrecio = (prodId, presentacion, precio) => {
    setProductos(ps => ps.map(p => p.id === prodId ? { ...p, variantes: p.variantes.map(v => v.presentacion === presentacion ? { ...v, precio: parseFloat(precio) || 0 } : v) } : p));
  };
  const actualizarStock = (prodId, presentacion, stock) => {
    setProductos(ps => ps.map(p => p.id === prodId ? { ...p, variantes: p.variantes.map(v => v.presentacion === presentacion ? { ...v, stock: parseInt(stock) || 0 } : v) } : p));
  };

  const actualizarEtiqueta = (prodId, presentacion, etiqueta) => {
    setProductos(ps => ps.map(p => p.id === prodId
      ? { ...p, variantes: p.variantes.map(v => v.presentacion === presentacion ? { ...v, etiqueta } : v) }
      : p));
  };

  const crearProducto = () => {
    if (!formProd.nombre.trim()) return;
    const nuevo = { id: generarId(), nombre: formProd.nombre.trim(), categoria: formProd.categoria, variantes: [] };
    setProductos(ps => [...ps, nuevo]);
    setFormProd({ nombre: "", categoria: "Tequeños" });
    setModalProd(false);
  };

  const agregarPresentacion = (prodId) => {
    if (!nuevaPres.trim()) return;
    setProductos(ps => ps.map(p => p.id === prodId
      ? { ...p, variantes: [...p.variantes, { presentacion: nuevaPres.trim(), precio: 0, stock: 0, lotes: [] }] }
      : p
    ));
    setNuevaPres("");
    setModalPres(null);
  };

  const eliminarPresentacion = (prodId, presentacion) => {
    if (!confirm(`¿Eliminar presentación "${presentacion}"?`)) return;
    setProductos(ps => ps.map(p => p.id === prodId ? { ...p, variantes: p.variantes.filter(v => v.presentacion !== presentacion) } : p));
  };

  const renombrarProducto = (prod) => {
    const nombre = prompt("Nuevo nombre del producto:", prod.nombre);
    if (!nombre || !nombre.trim() || nombre.trim() === prod.nombre) return;
    setProductos(ps => ps.map(p => p.id === prod.id ? { ...p, nombre: nombre.trim() } : p));
  };

  const eliminarProducto = (prodId) => {
    if (!confirm("¿Eliminar este producto?")) return;
    setProductos(ps => ps.filter(p => p.id !== prodId));
  };

  const categorias = [...new Set(productos.map(p => p.categoria))];
  const PRECIOS_RAPIDOS = [0, 5, 10, 12, 15, 18, 20, 21, 22, 25, 30, 35, 40];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: ac, margin: 0, fontFamily: TIPO_TIT, fontWeight: 800}}>Inventario & Precios</h2>
        <Btn accent={ac} onClick={() => setModalProd(true)}>+ Nuevo Producto</Btn>
      </div>

      {productos.length === 0 && <Empty texto="No hay productos. Crea el primero con + Nuevo Producto." />}

      {categorias.map(cat => (
        <div key={cat} style={{ marginBottom: 22 }}>
          <p style={{ color: TEXT_SUB, fontSize: 12, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>{cat.toUpperCase()}</p>
          {productos.filter(p => p.categoria === cat).map(prod => (
            <Card key={prod.id} accent={ac}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <p style={{ color: TEXT_MAIN, fontWeight: 700, margin: 0 }}>
                  {prod.nombre}
                  <button onClick={() => renombrarProducto(prod)} title="Cambiar nombre"
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, marginLeft: 6, padding: 0 }}>✏️</button>
                </p>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { setModalPres(prod.id); setNuevaPres(""); }}
                    style={{ background: ac + "18", border: `1px solid ${ac}44`, borderRadius: 8, color: ac, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    + Presentación
                  </button>
                  <button onClick={() => eliminarProducto(prod.id)}
                    style={{ background: "#fff", border: "1px solid #fca5a5", borderRadius: 8, color: "#ef4444", padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    🗑️
                  </button>
                </div>
              </div>
              {prod.variantes.length === 0 && (
                <p style={{ color: TEXT_SUB, fontSize: 13, margin: 0 }}>Sin presentaciones — añade una con "+ Presentación"</p>
              )}
              {prod.variantes.map(v => {
                const claveP = `${prod.id}-${v.presentacion}`;
                return (
                  <div key={v.presentacion} style={{ padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editandoPrecio === claveP ? 8 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: TEXT_SUB, fontSize: 13 }}>{v.presentacion}</span>
                        <button onClick={() => eliminarPresentacion(prod.id, v.presentacion)}
                          style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 13, padding: 0 }}>✕</button>
                      </div>
                      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                        <div style={{ textAlign: "center" }}>
                          <p style={{ color: TEXT_SUB, fontSize: 10, margin: "0 0 2px" }}>BANDEJAS</p>
                          {editandoStock === claveP ? (
                            <input type="number" defaultValue={v.stock || 0}
                              style={{ width: 60, background: BG_INPUT, border: `1px solid ${ac}`, borderRadius: 8, color: TEXT_MAIN, padding: "3px 6px", fontSize: 13 }}
                              onBlur={e => { actualizarStock(prod.id, v.presentacion, e.target.value); setEditandoStock(null); }} autoFocus />
                          ) : (
                            <span style={{ color: (v.stock || 0) < 5 ? "#ef4444" : "#10b981", fontWeight: 800, cursor: "pointer", fontSize: 14 }}
                              onClick={() => setEditandoStock(claveP)}>{v.stock || 0}</span>
                          )}
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <p style={{ color: TEXT_SUB, fontSize: 10, margin: "0 0 2px" }}>UNIDADES</p>
                          <span style={{ color: TEXT_MAIN, fontWeight: 800, fontSize: 14 }}>
                            {(v.stock || 0) * unidadesPorPresentacion(v.presentacion)}
                          </span>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <p style={{ color: TEXT_SUB, fontSize: 10, margin: "0 0 2px" }}>PRECIO</p>
                          <span style={{ color: ac, fontWeight: 800, cursor: "pointer", fontSize: 14 }}
                            onClick={() => setEditandoPrecio(editandoPrecio === claveP ? null : claveP)}>
                            {v.precio > 0 ? `${v.precio.toFixed(2)}€` : "—"}
                          </span>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <p style={{ color: TEXT_SUB, fontSize: 10, margin: "0 0 2px" }}>TOTAL</p>
                          <span style={{ color: TEXT_MAIN, fontWeight: 800, fontSize: 14 }}>
                            {v.precio > 0 ? `${((v.stock || 0) * v.precio).toFixed(2)}€` : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {ETIQUETAS_WEB.map(e => {
                        const actual = (v.etiqueta || "") === e.valor;
                        return (
                          <button key={e.valor || "ok"} onClick={() => actualizarEtiqueta(prod.id, v.presentacion, e.valor)}
                            title={e.ayuda}
                            style={{
                              border: actual ? `1.5px solid ${e.color}` : `1px solid ${BORDER}`,
                              background: actual ? e.color : BG_INPUT, color: actual ? "#fff" : TEXT_SUB,
                              borderRadius: 8, padding: "4px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer"
                            }}>{e.texto}</button>
                        );
                      })}
                    </div>
                    {editandoPrecio === claveP && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                        {PRECIOS_RAPIDOS.map(n => (
                          <button key={n} onClick={() => { actualizarPrecio(prod.id, v.presentacion, n); setEditandoPrecio(null); }}
                            style={{
                              border: n === v.precio ? `1.5px solid ${ac}` : `1px solid ${BORDER}`,
                              background: n === v.precio ? ac : BG_INPUT, color: n === v.precio ? "#fff" : TEXT_SUB,
                              borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer"
                            }}>{n}€</button>
                        ))}
                        <input type="number" min="0" step="0.5" inputMode="decimal" placeholder="Otro €"
                          style={{ width: 80, background: BG_INPUT, border: `1px solid ${ac}`, borderRadius: 8, color: TEXT_MAIN, padding: "5px 8px", fontSize: 12, fontWeight: 700 }}
                          onKeyDown={e => { if (e.key === "Enter" && e.target.value !== "") { actualizarPrecio(prod.id, v.presentacion, e.target.value.replace(",", ".")); setEditandoPrecio(null); } }}
                          onBlur={e => { if (e.target.value !== "") { actualizarPrecio(prod.id, v.presentacion, e.target.value.replace(",", ".")); setEditandoPrecio(null); } }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          ))}
        </div>
      ))}

      {/* Modal: nuevo producto */}
      {modalProd && (
        <Modal title="Nuevo Producto" accent={ac} onClose={() => setModalProd(false)}>
          <Input label="Nombre del producto *" value={formProd.nombre} onChange={e => setFormProd(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Tequeños de jamón" />
          <Select label="Categoría" options={CATEGORIAS_PRODUCTO} value={formProd.categoria} onChange={e => setFormProd(f => ({ ...f, categoria: e.target.value }))} />
          <p style={{ color: TEXT_SUB, fontSize: 12, margin: "0 0 16px" }}>Después de crear el producto, añade las presentaciones (Bandeja 25, Bandeja 50, etc.) desde el inventario.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setModalProd(false)}>Cancelar</Btn>
            <Btn accent={ac} onClick={crearProducto}>Crear Producto</Btn>
          </div>
        </Modal>
      )}

      {/* Modal: nueva presentación */}
      {modalPres && (
        <Modal title="Nueva Presentación" accent={ac} onClose={() => setModalPres(null)}>
          <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 14px" }}>
            Escribe el nombre de la presentación, por ejemplo: <strong>Bandeja 25</strong>, <strong>Bandeja 50</strong>, <strong>Unidad</strong>, etc.
          </p>
          <Input label="Nombre de la presentación *" value={nuevaPres} onChange={e => setNuevaPres(e.target.value)} placeholder="Ej: Bandeja 25" />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setModalPres(null)}>Cancelar</Btn>
            <Btn accent={ac} onClick={() => agregarPresentacion(modalPres)}>Añadir</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MÓDULO: REPARTIDORES ────────────────────────────────────────────────────
function ModuloPersonal({ repartidores, setRepartidores, trabajadoras, setTrabajadoras, irInicio }) {
  const [seccion, setSeccion] = useState("repartidores");

  // ── Repartidores ──
  // El dorado de Personal: no hay acento "repartidores" y el que no existe deja
  // la pestaña activa sin color y las fichas sin su franja de la izquierda.
  const acR = ACENTOS.personal;
  const [modalR, setModalR] = useState(false);
  const [editarR, setEditarR] = useState(null);
  const vacioR = { nombre: "", telefono: "" };
  const [formR, setFormR] = useState(vacioR);
  const setR = (k, v) => setFormR(f => ({ ...f, [k]: v }));
  const abrirNuevoR = () => { setEditarR(null); setFormR(vacioR); setModalR(true); };
  const abrirEditarR = (r) => { setEditarR(r); setFormR(r); setModalR(true); };
  const guardarR = () => {
    if (!formR.nombre) return;
    if (editarR) setRepartidores(rs => rs.map(r => r.id === editarR.id ? { ...r, ...formR } : r));
    else setRepartidores(rs => [...rs, { ...formR, id: generarId() }]);
    setModalR(false); setEditarR(null); setFormR(vacioR);
  };
  const eliminarR = (id) => { if (confirm("¿Eliminar repartidor?")) setRepartidores(rs => rs.filter(r => r.id !== id)); };

  // ── Trabajadoras ──
  const acT = ACENTOS.produccion;
  const [modalT, setModalT] = useState(false);
  const [editarT, setEditarT] = useState(null);
  const [formT, setFormT] = useState({ nombre: "", numero: "" });
  const proximoNumero = trabajadoras.length > 0 ? Math.max(...trabajadoras.map(t => t.numero || 0)) + 1 : 1;
  const abrirNuevoT = () => { setEditarT(null); setFormT({ nombre: "", numero: proximoNumero }); setModalT(true); };
  const abrirEditarT = (t) => { setEditarT(t.id); setFormT({ nombre: t.nombre, numero: t.numero || "" }); setModalT(true); };
  const guardarT = () => {
    if (!formT.nombre.trim()) return;
    if (editarT) setTrabajadoras(ts => ts.map(t => t.id === editarT ? { ...t, nombre: formT.nombre.trim(), numero: parseInt(formT.numero) || t.numero } : t));
    else setTrabajadoras(ts => [...ts, { id: generarId(), nombre: formT.nombre.trim(), numero: parseInt(formT.numero) || proximoNumero }]);
    setModalT(false); setEditarT(null); setFormT({ nombre: "", numero: "" });
  };
  const eliminarT = (id) => { if (confirm("¿Eliminar trabajadora?")) setTrabajadoras(ts => ts.filter(t => t.id !== id)); };

  const acActivo = seccion === "repartidores" ? acR : acT;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: acActivo, margin: 0, fontSize: 18, fontWeight: 900, fontFamily: TIPO_TIT, fontWeight: 800}}>Personal</h2>
      </div>

      {/* Selector de sección */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[{ id: "repartidores", label: "🛵 Repartidores", ac: acR }, { id: "trabajadoras", label: "👩‍🍳 Trabajadoras", ac: acT }].map(s => (
          <button key={s.id} onClick={() => setSeccion(s.id)} style={{
            flex: 1, padding: "10px", borderRadius: 12, border: `2px solid ${seccion === s.id ? s.ac : BORDER}`,
            background: seccion === s.id ? s.ac + "22" : BG_CARD, color: seccion === s.id ? s.ac : "#666",
            fontWeight: 700, fontSize: 14, cursor: "pointer"
          }}>{s.label}</button>
        ))}
      </div>

      {/* ── Sección Repartidores ── */}
      {seccion === "repartidores" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <Btn accent={acR} small onClick={abrirNuevoR}>+ Nuevo</Btn>
          </div>
          {repartidores.length === 0 && <p style={{ color: "#555", textAlign: "center", marginTop: 40 }}>No hay repartidores registrados.</p>}
          {repartidores.map(r => (
            <Card key={r.id} accent={acR}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ color: TEXT_MAIN, fontWeight: 800, margin: "0 0 4px" }}>{r.fijo ? "🏠" : "🛵"} {r.nombre}</p>
                  {r.telefono && <p style={{ color: TEXT_SUB, fontSize: 13, margin: 0 }}>📞 {r.telefono}</p>}
                </div>
                {!r.fijo && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn small variant="secondary" onClick={() => abrirEditarR(r)}>✏️</Btn>
                    <Btn small variant="danger" onClick={() => eliminarR(r.id)}>🗑️</Btn>
                  </div>
                )}
              </div>
            </Card>
          ))}
          {modalR && (
            <Modal title={editarR ? "Editar Repartidor" : "Nuevo Repartidor"} accent={acR} onClose={() => { setModalR(false); setEditarR(null); }}>
              <Input label="Nombre *" value={formR.nombre} onChange={e => setR("nombre", e.target.value)} placeholder="Ej: Juan Pérez" />
              <Input label="Teléfono" value={formR.telefono} onChange={e => setR("telefono", e.target.value)} placeholder="+34 6XX XXX XXX" />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Btn variant="secondary" onClick={() => { setModalR(false); setEditarR(null); }}>Cancelar</Btn>
                <Btn accent={acR} onClick={guardarR}>Guardar</Btn>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ── Sección Trabajadoras ── */}
      {seccion === "trabajadoras" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <Btn accent={acT} small onClick={abrirNuevoT}>+ Nueva</Btn>
          </div>
          {trabajadoras.length === 0 && <p style={{ color: "#555", textAlign: "center", marginTop: 40 }}>No hay trabajadoras registradas.</p>}
          {trabajadoras.map(t => (
            <Card key={t.id} accent={acT}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ background: acT, color: "#fff", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14, flexShrink: 0 }}>
                    #{t.numero || "?"}
                  </span>
                  <p style={{ color: TEXT_MAIN, fontWeight: 800, margin: 0 }}>👩‍🍳 {t.nombre}</p>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn small variant="secondary" onClick={() => abrirEditarT(t)}>✏️</Btn>
                  <Btn small variant="danger" onClick={() => eliminarT(t.id)}>🗑️</Btn>
                </div>
              </div>
            </Card>
          ))}
          {modalT && (
            <Modal title={editarT ? "Editar Trabajadora" : "Nueva Trabajadora"} accent={acT} onClose={() => { setModalT(false); setEditarT(null); setFormT({ nombre: "", numero: "" }); }}>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ width: 80 }}>
                  <Input label="Nº" type="number" min="1" value={formT.numero} onChange={e => setFormT(f => ({ ...f, numero: e.target.value }))} placeholder="1" />
                </div>
                <div style={{ flex: 1 }}>
                  <Input label="Nombre *" value={formT.nombre} onChange={e => setFormT(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: María López" />
                </div>
              </div>
              <p style={{ color: TEXT_SUB, fontSize: 12, margin: "-8px 0 16px" }}>El número identifica su trabajo en cada bandeja</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Btn variant="secondary" onClick={() => { setModalT(false); setEditarT(null); setFormT({ nombre: "", numero: "" }); }}>Cancelar</Btn>
                <Btn accent={acT} onClick={guardarT}>Guardar</Btn>
              </div>
            </Modal>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MÓDULO: PROVEEDORES ─────────────────────────────────────────────────────
function ModuloProveedores({ proveedores, setProveedores, irInicio }) {
  const ac = ACENTOS.proveedores;
  const [modal, setModal] = useState(false);
  const [editar, setEditar] = useState(null);
  const [buscar, setBuscar] = useState("");
  const vacio = { nombre: "", telefono: "", email: "", producto: "" };
  const [form, setForm] = useState(vacio);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const abrirNuevo = () => { setEditar(null); setForm(vacio); setModal(true); };
  const abrirEditar = (p) => { setEditar(p); setForm(p); setModal(true); };

  const guardar = () => {
    if (!form.nombre || !form.telefono) return;
    if (editar) setProveedores(ps => ps.map(p => p.id === editar.id ? { ...form, id: editar.id } : p));
    else setProveedores(ps => [...ps, { ...form, id: generarId() }]);
    setModal(false); setEditar(null); setForm(vacio);
  };
  const eliminar = (id) => { if (confirm("¿Eliminar proveedor?")) setProveedores(ps => ps.filter(p => p.id !== id)); };

  const filtrados = proveedores.filter(p => p.nombre.toLowerCase().includes(buscar.toLowerCase()) || p.producto.toLowerCase().includes(buscar.toLowerCase()));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: ac, margin: 0, fontFamily: TIPO_TIT, fontWeight: 800}}>Proveedores</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn accent={ac} onClick={abrirNuevo}>+ Nuevo</Btn>
        </div>
      </div>
      <Input placeholder="🔍 Buscar por nombre o producto..." value={buscar} onChange={e => setBuscar(e.target.value)} />

      {filtrados.length === 0 ? <Empty texto="No hay proveedores registrados" /> : filtrados.map(p => (
        <Card key={p.id} accent={ac}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ color: TEXT_MAIN, fontWeight: 800, margin: "0 0 4px" }}>{p.nombre}</p>
              <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 2px" }}>📞 {p.telefono}</p>
              {p.email && <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 2px" }}>✉️ {p.email}</p>}
              {p.producto && <p style={{ color: "#666", fontSize: 12, margin: "4px 0 0" }}>📦 Suministra: {p.producto}</p>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small variant="secondary" onClick={() => abrirEditar(p)}>✏️</Btn>
              <Btn small variant="danger" onClick={() => eliminar(p.id)}>🗑️</Btn>
            </div>
          </div>
        </Card>
      ))}

      {modal && (
        <Modal title={editar ? "Editar Proveedor" : "Nuevo Proveedor"} accent={ac} onClose={() => { setModal(false); setEditar(null); }}>
          <Input label="Nombre *" value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Ej: Distribuidora Hojaldre SL" />
          <Input label="Teléfono *" value={form.telefono} onChange={e => set("telefono", e.target.value)} placeholder="+34 6XX XXX XXX" />
          <Input label="Email" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="contacto@proveedor.com" />
          <Input label="Producto que suministra" value={form.producto} onChange={e => set("producto", e.target.value)} placeholder="Ej: Harina, queso, masa" />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => { setModal(false); setEditar(null); }}>Cancelar</Btn>
            <Btn accent={ac} onClick={guardar}>Guardar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MÓDULO: COMPRAS / MATERIA PRIMA ─────────────────────────────────────────
function FormularioCompra({ proveedores, ingredientes, onGuardar, onCerrar }) {
  const ac = ACENTOS.compras;
  const [form, setForm] = useState({ proveedorId: "", ingredienteNombre: "", unidad: "kg", cantidad: 1, precio: 0, fecha: hoy() });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const seleccionarIngrediente = (nombre) => {
    const existente = ingredientes.find(i => i.nombre === nombre);
    setForm(f => ({ ...f, ingredienteNombre: nombre, unidad: existente ? existente.unidad : f.unidad }));
  };

  const guardar = () => {
    if (!form.proveedorId || !form.ingredienteNombre || !form.cantidad) return;
    onGuardar({ ...form, id: generarId(), cantidad: parseFloat(form.cantidad) || 0, precio: parseFloat(form.precio) || 0 });
  };

  return (
    <Modal title="Nueva Compra" accent={ac} onClose={onCerrar}>
      <Select label="Proveedor *" options={[{ value: "", label: "— Seleccionar —" }, ...proveedores.map(p => ({ value: p.id, label: p.nombre }))]}
        value={form.proveedorId} onChange={e => set("proveedorId", e.target.value)} />
      <Input label="Ingrediente comprado *" value={form.ingredienteNombre} onChange={e => seleccionarIngrediente(e.target.value)}
        placeholder="Ej: Harina, Queso, Masa de hojaldre" list="lista-ingredientes-moderno" />
      <datalist id="lista-ingredientes-moderno">{ingredientes.map(i => <option key={i.id} value={i.nombre} />)}</datalist>
      <Chips label="Unidad" accent={ac} options={UNIDADES_MATERIA_PRIMA} value={form.unidad} onChange={v => set("unidad", v)} />
      <Input label="Cantidad *" type="number" min="0" step="0.01" value={form.cantidad} onChange={e => set("cantidad", e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Input label="Precio pagado (€)" type="number" min="0" step="0.01" value={form.precio} onChange={e => set("precio", e.target.value)} />
        <Input label="Fecha de compra" type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        <Btn variant="secondary" onClick={onCerrar}>Cancelar</Btn>
        <Btn accent={ac} onClick={guardar}>Registrar Compra</Btn>
      </div>
    </Modal>
  );
}

function ModuloCompras({ compras, setCompras, proveedores, ingredientes, setIngredientes, irInicio }) {
  const ac = ACENTOS.compras;
  const [modal, setModal] = useState(false);
  const [vista, setVista] = useState("stock");
  const [filtroFecha, setFiltroFecha] = useState("");
  const [filtroProveedor, setFiltroProveedor] = useState("");

  const registrarCompra = (compra) => {
    setCompras(cs => [compra, ...cs]);
    setIngredientes(ings => {
      const existente = ings.find(i => i.nombre === compra.ingredienteNombre);
      if (existente) return ings.map(i => i.id === existente.id ? { ...i, stock: (i.stock || 0) + compra.cantidad, unidad: compra.unidad } : i);
      return [...ings, { id: generarId(), nombre: compra.ingredienteNombre, unidad: compra.unidad, stock: compra.cantidad, stockMinimo: STOCK_MINIMO_DEFECTO }];
    });
    setModal(false);
  };

  const eliminarCompra = (id) => { if (confirm("¿Eliminar esta compra del historial?")) setCompras(cs => cs.filter(c => c.id !== id)); };
  const nombreProveedor = (id) => proveedores.find(p => p.id === id)?.nombre || "—";

  const comprasFiltradas = compras.filter(c => (!filtroFecha || c.fecha === filtroFecha) && (!filtroProveedor || c.proveedorId === filtroProveedor));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: ac, margin: 0, fontFamily: TIPO_TIT, fontWeight: 800}}>Compras / Materia Prima</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn accent={ac} onClick={() => setModal(true)}>+ Nueva</Btn>
        </div>
      </div>

      <Chips accent={ac} options={[{ value: "stock", label: "Stock actual" }, { value: "historial", label: "Historial" }]} value={vista} onChange={setVista} />

      {vista === "stock" && (
        ingredientes.length === 0 ? <Empty texto="Sin materia prima registrada todavía" /> : ingredientes.map(i => {
          const bajo = (i.stock || 0) < (i.stockMinimo ?? STOCK_MINIMO_DEFECTO);
          return (
            <Card key={i.id} accent={bajo ? "#ef4444" : ac}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ color: TEXT_MAIN, fontWeight: 800, margin: "0 0 4px" }}>{i.nombre}</p>
                  {bajo && <span style={{ color: "#ef4444", fontSize: 12, fontWeight: 700 }}>⚠️ Stock bajo</span>}
                </div>
                <p style={{ color: bajo ? "#ef4444" : "#10b981", fontWeight: 800, fontSize: 18, margin: 0 }}>{i.stock} {i.unidad}</p>
              </div>
            </Card>
          );
        })
      )}

      {vista === "historial" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <input type="date" style={{ background: BG_INPUT, border: "1px solid #2d2e38", color: TEXT_MAIN, borderRadius: 10, padding: "9px 12px", fontSize: 13 }}
              value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
            <select style={{ background: BG_INPUT, border: "1px solid #2d2e38", color: TEXT_MAIN, borderRadius: 10, padding: "9px 12px", fontSize: 13 }}
              value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)}>
              <option value="">Todos los proveedores</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            {(filtroFecha || filtroProveedor) && <Btn small variant="secondary" onClick={() => { setFiltroFecha(""); setFiltroProveedor(""); }}>✕ Limpiar</Btn>}
          </div>

          {comprasFiltradas.length === 0 ? <Empty texto="Sin compras con estos filtros" /> : comprasFiltradas.map(c => (
            <Card key={c.id} accent={ac}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p style={{ color: TEXT_MAIN, fontWeight: 800, margin: "0 0 4px" }}>{c.ingredienteNombre}</p>
                  <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 2px" }}>🚚 {nombreProveedor(c.proveedorId)}</p>
                  <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 2px" }}>📅 {c.fecha}</p>
                  <p style={{ color: TEXT_SUB, fontSize: 13, margin: 0 }}>{c.cantidad} {c.unidad}{c.precio > 0 && ` · ${c.precio.toFixed(2)}€`}</p>
                </div>
                <Btn small variant="danger" onClick={() => eliminarCompra(c.id)}>🗑️</Btn>
              </div>
            </Card>
          ))}
        </>
      )}

      {modal && <FormularioCompra proveedores={proveedores} ingredientes={ingredientes} onGuardar={registrarCompra} onCerrar={() => setModal(false)} />}
    </div>
  );
}

// ─── MÓDULO: GASTOS ──────────────────────────────────────────────────────────
function ModuloGastos({ gastos, setGastos, irInicio }) {
  const ac = ACENTOS.gastos;
  const [modal, setModal] = useState(false);
  const [editar, setEditar] = useState(null);
  const vacio = { concepto: "", categoria: "Limpieza", monto: 0, fecha: hoy() };
  const [form, setForm] = useState(vacio);
  const [filtroFecha, setFiltroFecha] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("Todas");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const abrirNuevo = () => { setEditar(null); setForm(vacio); setModal(true); };
  const abrirEditar = (g) => { setEditar(g); setForm(g); setModal(true); };

  const guardar = () => {
    if (!form.concepto || !form.monto) return;
    const datos = { ...form, monto: parseFloat(form.monto) || 0 };
    if (editar) setGastos(gs => gs.map(g => g.id === editar.id ? { ...datos, id: editar.id } : g));
    else setGastos(gs => [{ ...datos, id: generarId() }, ...gs]);
    setModal(false); setEditar(null); setForm(vacio);
  };
  const eliminar = (id) => { if (confirm("¿Eliminar gasto?")) setGastos(gs => gs.filter(g => g.id !== id)); };

  const filtrados = gastos.filter(g => (!filtroFecha || g.fecha === filtroFecha) && (filtroCategoria === "Todas" || g.categoria === filtroCategoria));
  const totalFiltrado = filtrados.reduce((s, g) => s + (g.monto || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h2 style={{ color: ac, margin: 0, fontFamily: TIPO_TIT, fontWeight: 800}}>Gastos</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn accent={ac} onClick={abrirNuevo}>+ Nuevo</Btn>
        </div>
      </div>
      <p style={{ color: "#666", fontSize: 12, marginBottom: 16 }}>Limpieza u otros gastos no relacionados a la producción</p>

      <Chips accent={ac} options={["Todas", ...CATEGORIAS_GASTO]} value={filtroCategoria} onChange={setFiltroCategoria} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input type="date" style={{ background: BG_INPUT, border: "1px solid #2d2e38", color: TEXT_MAIN, borderRadius: 10, padding: "9px 12px", fontSize: 13 }}
          value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
        {(filtroFecha || filtroCategoria !== "Todas") && <Btn small variant="secondary" onClick={() => { setFiltroFecha(""); setFiltroCategoria("Todas"); }}>✕ Limpiar</Btn>}
      </div>

      {filtrados.length === 0 ? <Empty texto="Sin gastos registrados con estos filtros" /> : (
        <>
          {filtrados.map(g => (
            <Card key={g.id} accent={ac}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p style={{ color: TEXT_MAIN, fontWeight: 800, margin: "0 0 4px" }}>{g.concepto}</p>
                  <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 2px" }}>🏷️ {g.categoria}</p>
                  <p style={{ color: TEXT_SUB, fontSize: 13, margin: 0 }}>📅 {g.fecha}</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <p style={{ color: ac, fontWeight: 800, fontSize: 16, margin: 0 }}>{g.monto.toFixed(2)}€</p>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn small variant="secondary" onClick={() => abrirEditar(g)}>✏️</Btn>
                    <Btn small variant="danger" onClick={() => eliminar(g.id)}>🗑️</Btn>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          <p style={{ color: TEXT_SUB, textAlign: "right", fontWeight: 800, fontSize: 14 }}>Total: {totalFiltrado.toFixed(2)}€</p>
        </>
      )}

      {modal && (
        <Modal title={editar ? "Editar Gasto" : "Nuevo Gasto"} accent={ac} onClose={() => { setModal(false); setEditar(null); }}>
          <Input label="Concepto *" value={form.concepto} onChange={e => set("concepto", e.target.value)} placeholder="Ej: Detergente, guantes, bolsas" />
          <Chips label="Categoría" accent={ac} options={CATEGORIAS_GASTO} value={form.categoria} onChange={v => set("categoria", v)} />
          <Input label="Monto (€) *" type="number" min="0" step="0.01" value={form.monto} onChange={e => set("monto", e.target.value)} />
          <Input label="Fecha" type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => { setModal(false); setEditar(null); }}>Cancelar</Btn>
            <Btn accent={ac} onClick={guardar}>Guardar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MÓDULO: REPORTE HACIENDA ────────────────────────────────────────────────
function ModuloReporte({ pedidos, compras, gastos, producciones, trabajadoras, irInicio }) {
  const ac = ACENTOS.reporte;
  const [desde, setDesde] = useState(inicioDeMes());
  const [hasta, setHasta] = useState(hoy());
  const enRango = (fecha) => fecha >= desde && fecha <= hasta;

  const pedidosRango = pedidos.filter(p => enRango(p.fecha) && p.estado !== "Cancelado");
  const comprasRango = compras.filter(c => enRango(c.fecha));
  const gastosRango = gastos.filter(g => enRango(g.fecha));

  const ingresos = pedidosRango.reduce((s, p) => s + totalesPedido(p).total, 0);
  const costoMateriaPrima = comprasRango.reduce((s, c) => s + (c.precio || 0), 0);
  const otrosGastos = gastosRango.reduce((s, g) => s + (g.monto || 0), 0);
  const beneficio = ingresos - costoMateriaPrima - otrosGastos;

  const gastosPorCategoria = CATEGORIAS_GASTO.map(cat => ({
    categoria: cat, total: gastosRango.filter(g => g.categoria === cat).reduce((s, g) => s + (g.monto || 0), 0)
  })).filter(c => c.total > 0);

  const produccionesRango = (producciones || []).filter(p => p.fecha >= desde && p.fecha <= hasta);
  const totalProducido = produccionesRango.reduce((s, p) => s + p.items.reduce((ss, it) => ss + (it.cantidad || 0), 0), 0);
  const statsPorTrab = (trabajadoras || []).map(t => ({
    nombre: t.nombre,
    total: produccionesRango.filter(p => p.trabajadoraId === t.id).reduce((s, p) => s + p.items.reduce((ss, it) => ss + (it.cantidad || 0), 0), 0)
  })).filter(t => t.total > 0).sort((a, b) => b.total - a.total);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: ac, margin: 0, fontFamily: TIPO_TIT, fontWeight: 800}}>Reporte</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Input label="Desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        <Input label="Hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
      </div>

      <div id="reporte-imprimible">
        <Card accent={ac}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #25262f" }}>
            <span style={{ color: TEXT_SUB, fontSize: 14 }}>Ingresos (ventas)</span>
            <span style={{ color: "#10b981", fontWeight: 800, fontSize: 14 }}>{ingresos.toFixed(2)}€</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #25262f" }}>
            <span style={{ color: TEXT_SUB, fontSize: 14 }}>Costo de materia prima</span>
            <span style={{ color: "#ef4444", fontWeight: 800, fontSize: 14 }}>-{costoMateriaPrima.toFixed(2)}€</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #25262f" }}>
            <span style={{ color: TEXT_SUB, fontSize: 14 }}>Otros gastos</span>
            <span style={{ color: "#ef4444", fontWeight: 800, fontSize: 14 }}>-{otrosGastos.toFixed(2)}€</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0" }}>
            <span style={{ color: ac, fontWeight: 800, fontSize: 16 }}>BENEFICIO NETO</span>
            <span style={{ color: beneficio >= 0 ? ac : "#ef4444", fontWeight: 800, fontSize: 16 }}>{beneficio.toFixed(2)}€</span>
          </div>
        </Card>

        {gastosPorCategoria.length > 0 && (
          <Card accent={ac}>
            <p style={{ color: TEXT_SUB, fontSize: 12, fontWeight: 800, margin: "0 0 8px" }}>OTROS GASTOS POR CATEGORÍA</p>
            {gastosPorCategoria.map(c => (
              <div key={c.categoria} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ color: TEXT_MAIN, fontSize: 13 }}>{c.categoria}</span>
                <span style={{ color: TEXT_MAIN, fontSize: 13 }}>{c.total.toFixed(2)}€</span>
              </div>
            ))}
          </Card>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <Card accent={ac} style={{ textAlign: "center", padding: 14 }}>
            <p style={{ color: "#666", fontSize: 11, margin: "0 0 4px" }}>PEDIDOS</p>
            <p style={{ color: TEXT_MAIN, fontWeight: 800, fontSize: 18, margin: 0 }}>{pedidosRango.length}</p>
          </Card>
          <Card accent={ac} style={{ textAlign: "center", padding: 14 }}>
            <p style={{ color: "#666", fontSize: 11, margin: "0 0 4px" }}>COMPRAS</p>
            <p style={{ color: TEXT_MAIN, fontWeight: 800, fontSize: 18, margin: 0 }}>{comprasRango.length}</p>
          </Card>
          <Card accent={ac} style={{ textAlign: "center", padding: 14 }}>
            <p style={{ color: "#666", fontSize: 11, margin: "0 0 4px" }}>GASTOS</p>
            <p style={{ color: TEXT_MAIN, fontWeight: 800, fontSize: 18, margin: 0 }}>{gastosRango.length}</p>
          </Card>
        </div>
      </div>

      {totalProducido > 0 && (
        <Card accent={ac}>
          <p style={{ color: TEXT_SUB, fontSize: 12, fontWeight: 800, margin: "0 0 8px" }}>🏭 PRODUCCIÓN EN EL PERÍODO</p>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #25262f" }}>
            <span style={{ color: TEXT_SUB, fontSize: 14 }}>Total unidades producidas</span>
            <span style={{ color: ac, fontWeight: 800, fontSize: 14 }}>{totalProducido} uds</span>
          </div>
          {statsPorTrab.map(t => (
            <div key={t.nombre} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ color: TEXT_MAIN, fontSize: 13 }}>👩‍🍳 {t.nombre}</span>
              <span style={{ color: TEXT_MAIN, fontSize: 13 }}>{t.total} uds</span>
            </div>
          ))}
        </Card>
      )}

      <Btn accent={ac} onClick={() => window.print()} style={{ width: "100%", marginTop: 4 }}>🖨️ Imprimir / Exportar PDF</Btn>
    </div>
  );
}

// ─── MÓDULO STOCK ────────────────────────────────────────────────────────────
function ModuloStock({ productos }) {
  const ac = ACENTOS.stock;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: ac, margin: 0, fontSize: 18, fontWeight: 900, fontFamily: TIPO_TIT, fontWeight: 800}}>Stock por Lotes</h2>
      </div>
      <p style={{ color: TEXT_SUB, fontSize: 12, margin: "0 0 14px" }}>
        El stock se lleva en bandejas. Al lado van las unidades que suponen.
      </p>
      {productos.length === 0 && <Empty texto="No hay productos registrados." />}
      {productos.map(prod => (
        <div key={prod.id} style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 14, marginBottom: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{prod.nombre}</span>
            <span style={{ color: TEXT_SUB, fontSize: 12 }}>{prod.categoria}</span>
          </div>

          {(prod.sueltas || 0) > 0 && (
            <div style={{ padding: "8px 16px", background: BG_INPUT, borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ color: ACENTOS.mostrador, fontSize: 12, fontWeight: 700 }}>
                🏪 {prod.sueltas} unidades sueltas de bandejas ya abiertas
              </span>
            </div>
          )}

          {prod.variantes.map((v, i) => {
            const uds = unidadesPorPresentacion(v.presentacion);
            const bandejas = (v.lotes || []).length ? stockTotal(v.lotes) : (v.stock || 0);
            const enMostrador = v.enMostrador || 0;
            const libres = Math.max(0, bandejas - enMostrador);
            const lotes = [...(v.lotes || [])].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
            return (
              <div key={i} style={{ padding: "10px 16px", borderBottom: i < prod.variantes.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: lotes.length > 0 ? 8 : 0 }}>
                  <span style={{ color: TEXT_SUB, fontSize: 14 }}>{v.presentacion}</span>
                  <span style={{ textAlign: "right" }}>
                    <span style={{ color: bandejas > 0 ? ac : "#ef4444", fontWeight: 800, fontSize: 15 }}>
                      {bandejas} bandeja{bandejas === 1 ? "" : "s"}
                    </span>
                    <span style={{ color: TEXT_SUB, fontSize: 12 }}> · {bandejas * uds} uds</span>
                  </span>
                </div>
                {enMostrador > 0 && (
                  <p style={{ color: ACENTOS.mostrador, fontSize: 12, margin: "0 0 6px" }}>
                    🏪 {enMostrador} en el mostrador · quedan {libres} para pedidos
                  </p>
                )}
                {lotes.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {lotes.map((l, j) => (
                      <div key={j} style={{ display: "flex", justifyContent: "space-between", background: BG_INPUT, borderRadius: 8, padding: "5px 10px" }}>
                        <span style={{ color: TEXT_SUB, fontSize: 12 }}>📅 {l.fecha}</span>
                        <span style={{ color: TEXT_MAIN, fontSize: 12, fontWeight: 600 }}>
                          {l.cantidad} bandeja{l.cantidad === 1 ? "" : "s"} · {l.cantidad * uds} uds
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: TEXT_SUB, fontSize: 12 }}>
                    {bandejas > 0 ? "Sin lotes registrados (stock puesto a mano)" : "Sin stock"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── MÓDULO PRODUCCIÓN ───────────────────────────────────────────────────────
function ModuloProduccion({ producciones, setProducciones, trabajadoras, setTrabajadoras, productos, setProductos }) {
  const ac = ACENTOS.produccion;
  const [vista, setVista] = useState("lista");
  const FORM_VACIO = { fecha: hoy(), trabajadoraId: "", items: [{ productoId: "", presentacion: "", cantidad: 1 }] };
  const [form, setForm] = useState(FORM_VACIO);
  const [modalTrab, setModalTrab] = useState(false);
  const [nombreTrab, setNombreTrab] = useState("");
  const [filtroFecha, setFiltroFecha] = useState("");

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const agregarItem = () => setForm(f => ({ ...f, items: [...f.items, { productoId: "", presentacion: "", cantidad: 1 }] }));
  const quitarItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }));
  const setItem = (i, k, v) => setForm(f => ({
    ...f,
    items: f.items.map((it, j) => j === i ? { ...it, [k]: v, ...(k === "productoId" ? { presentacion: "" } : {}) } : it)
  }));

  const guardar = () => {
    if (!form.trabajadoraId || form.items.some(it => !it.productoId || !it.presentacion || !it.cantidad)) return;
    const nueva = { ...form, id: generarId(), items: form.items.map(it => ({ ...it, cantidad: parseInt(it.cantidad) || 0 })) };
    setProducciones(p => [nueva, ...p]);
    setProductos(prods => prods.map(prod => ({
      ...prod,
      variantes: prod.variantes.map(v => {
        const it = nueva.items.find(i => String(i.productoId) === String(prod.id) && i.presentacion === v.presentacion);
        if (!it) return v;
        const nuevosLotes = [...(v.lotes || [])];
        const loteExistente = nuevosLotes.findIndex(l => l.fecha === nueva.fecha);
        if (loteExistente >= 0) nuevosLotes[loteExistente] = { ...nuevosLotes[loteExistente], cantidad: nuevosLotes[loteExistente].cantidad + it.cantidad };
        else nuevosLotes.push({ fecha: nueva.fecha, cantidad: it.cantidad });
        return { ...v, lotes: nuevosLotes, stock: stockTotal(nuevosLotes) };
      })
    })));
    setForm(FORM_VACIO);
    setVista("lista");
  };

  const guardarTrab = () => {
    if (!nombreTrab.trim()) return;
    setTrabajadoras(t => [...t, { id: generarId(), nombre: nombreTrab.trim() }]);
    setNombreTrab("");
    setModalTrab(false);
  };

  if (vista === "nueva") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={() => setVista("lista")} style={{ background: "none", border: "none", color: "#888", fontSize: 14, cursor: "pointer" }}>← Volver</button>
      </div>
      <h2 style={{ color: ac, margin: "0 0 16px", fontSize: 18, fontWeight: 900, fontFamily: TIPO_TIT, fontWeight: 800}}>Nueva Producción</h2>

      <div style={{ background: BG_CARD, border: "1px solid #1d1e26", borderRadius: 14, padding: 16, marginBottom: 12 }}>
        <label style={{ color: "#666", fontSize: 12, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Fecha de producción</label>
        <input type="date" value={form.fecha} onChange={e => setF("fecha", e.target.value)}
          style={{ width: "100%", background: BG_INPUT, border: "1px solid #2a2a3a", borderRadius: 10, color: TEXT_MAIN, padding: "10px 12px", fontSize: 14, boxSizing: "border-box" }} />
      </div>

      <div style={{ background: BG_CARD, border: "1px solid #1d1e26", borderRadius: 14, padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={{ color: "#666", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>Trabajadora</label>
          <button onClick={() => setModalTrab(true)} style={{ background: "none", border: "none", color: ac, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>+ Nueva</button>
        </div>
        <select value={form.trabajadoraId} onChange={e => setF("trabajadoraId", e.target.value)}
          style={{ width: "100%", background: BG_INPUT, border: "1px solid #2a2a3a", borderRadius: 10, color: form.trabajadoraId ? TEXT_MAIN : "#555", padding: "10px 12px", fontSize: 14, boxSizing: "border-box" }}>
          <option value="">Seleccionar trabajadora...</option>
          {trabajadoras.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </div>

      <div style={{ background: BG_CARD, border: "1px solid #1d1e26", borderRadius: 14, padding: 16, marginBottom: 12 }}>
        <label style={{ color: "#666", fontSize: 12, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 10 }}>Productos producidos</label>
        {form.items.map((it, i) => {
          const prod = productos.find(p => String(p.id) === String(it.productoId));
          return (
            <div key={i} style={{ background: BG_INPUT, borderRadius: 10, padding: 12, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <select value={it.productoId} onChange={e => setItem(i, "productoId", e.target.value)}
                  style={{ flex: 2, background: BG_CARD, border: "1px solid #2a2a3a", borderRadius: 8, color: it.productoId ? TEXT_MAIN : "#555", padding: "8px 10px", fontSize: 13 }}>
                  <option value="">Producto...</option>
                  {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                {form.items.length > 1 && (
                  <button onClick={() => quitarItem(i)} style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 8, color: "#ef4444", padding: "0 10px", cursor: "pointer", fontSize: 16 }}>✕</button>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={it.presentacion} onChange={e => setItem(i, "presentacion", e.target.value)}
                  style={{ flex: 2, background: BG_CARD, border: "1px solid #2a2a3a", borderRadius: 8, color: it.presentacion ? TEXT_MAIN : "#555", padding: "8px 10px", fontSize: 13 }}>
                  <option value="">Presentación...</option>
                  {prod?.variantes.map(v => <option key={v.presentacion} value={v.presentacion}>{v.presentacion}</option>)}
                </select>
                <input type="number" min="1" value={it.cantidad} onChange={e => setItem(i, "cantidad", e.target.value)}
                  placeholder="Cant." style={{ flex: 1, background: BG_CARD, border: "1px solid #2a2a3a", borderRadius: 8, color: TEXT_MAIN, padding: "8px 10px", fontSize: 13, minWidth: 0 }} />
              </div>
            </div>
          );
        })}
        <button onClick={agregarItem} style={{ width: "100%", background: "transparent", border: `1px dashed ${ac}55`, borderRadius: 10, color: ac, padding: "10px", fontSize: 13, cursor: "pointer", fontWeight: 700, marginTop: 4 }}>
          + Agregar producto
        </button>
      </div>

      <button onClick={guardar} style={{ width: "100%", background: ac, color: BG_INPUT, border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
        💾 Guardar Producción
      </button>

      {modalTrab && (
        <Modal title="Nueva Trabajadora" accent={ac} onClose={() => setModalTrab(false)}>
          <Input autoFocus value={nombreTrab} onChange={e => setNombreTrab(e.target.value)} onKeyDown={e => e.key === "Enter" && guardarTrab()} placeholder="Nombre completo" />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setModalTrab(false)}>Cancelar</Btn>
            <Btn accent={ac} onClick={guardarTrab}>Guardar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );

  const produccionesFiltradas = filtroFecha ? producciones.filter(p => p.fecha === filtroFecha) : producciones;
  const agrupadas = produccionesFiltradas.reduce((acc, p) => {
    const dia = p.fecha || "Sin fecha";
    acc[dia] = acc[dia] || [];
    acc[dia].push(p);
    return acc;
  }, {});
  const dias = Object.keys(agrupadas).sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: ac, margin: 0, fontSize: 18, fontWeight: 900, fontFamily: TIPO_TIT, fontWeight: 800}}>Producción</h2>
        <Btn accent={ac} onClick={() => setVista("nueva")}>+ Nueva</Btn>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)}
          style={{ background: BG_INPUT, border: `1.5px solid ${BORDER}`, color: TEXT_MAIN, borderRadius: 10, padding: "9px 12px", fontSize: 13 }} />
        {filtroFecha && <Btn small variant="secondary" onClick={() => setFiltroFecha("")}>✕ Ver todo</Btn>}
      </div>

      {dias.length === 0 && <Empty texto={filtroFecha ? "Sin producción en esta fecha" : "No hay registros de producción aún."} />}
      {dias.map(dia => (
        <div key={dia} style={{ marginBottom: 16 }}>
          <p style={{ color: "#555", fontSize: 12, fontWeight: 700, textTransform: "uppercase", margin: "0 0 8px" }}>📅 {dia}</p>
          {agrupadas[dia].map(prod => {
            const trab = trabajadoras.find(t => t.id === prod.trabajadoraId);
            return (
              <div key={prod.id} style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {trab?.numero && (
                      <span style={{ background: ac, color: "#fff", borderRadius: "50%", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13 }}>
                        #{trab.numero}
                      </span>
                    )}
                    <span style={{ color: ac, fontWeight: 700, fontSize: 14 }}>👩‍🍳 {trab?.nombre || "—"}</span>
                  </div>
                  <span style={{ color: TEXT_SUB, fontSize: 12 }}>
                    {prod.items?.reduce((s, it) => s + it.cantidad * unidadesPorPresentacion(it.presentacion), 0)} uds totales
                  </span>
                </div>
                {prod.items?.map((it, i) => {
                  const uds = it.cantidad * unidadesPorPresentacion(it.presentacion);
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: i > 0 ? `1px solid ${BORDER}` : "none" }}>
                      <span style={{ color: TEXT_SUB, fontSize: 13 }}>{it.productoId ? (productos.find(p => String(p.id) === String(it.productoId))?.nombre || it.productoId) : "—"} · {it.presentacion}</span>
                      <span style={{ color: TEXT_MAIN, fontWeight: 700, fontSize: 13 }}>
                        {it.cantidad} band. = <span style={{ color: ac }}>{uds} uds</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── APP PRINCIPAL (DISEÑO MODERNO) ─────────────────────────────────────────
function ModuloAdmin({ proveedores, setProveedores, compras, setCompras, gastos, setGastos, ingredientes, setIngredientes, pedidos, setPedidos, producciones, trabajadoras, empresa, setEmpresa, irInicio, exportarDatos, importarDatos }) {
  const [sub, setSub] = useState("proveedores");
  const emp = fusionaEmpresa(empresa);
  const [corte, setCorte] = useState(inicioDeMes);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  const antiguos = pedidos.filter(p => (p.fecha || "") < corte);
  const fechas = antiguos.map(p => p.fecha).filter(Boolean).sort();
  const masViejo = fechas[0];
  const masNuevo = fechas[fechas.length - 1];
  const ac = ACENTOS.admin;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: ac, margin: 0, fontSize: 18, fontWeight: 900, fontFamily: TIPO_TIT, fontWeight: 800}}>Administración</h2>
      </div>
      <button onClick={exportarDatos} style={{
        width: "100%", background: MARRON, border: "none", borderRadius: 12,
        color: "#fff", padding: "13px", fontSize: 15, fontWeight: 700,
        cursor: "pointer", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8
      }}>📤 Exportar Backup</button>
      <label style={{
        width: "100%", background: "#0ea5e9", borderRadius: 12,
        color: "#fff", padding: "13px", fontSize: 15, fontWeight: 700,
        cursor: "pointer", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8
      }}>
        📥 Restaurar copia
        <input type="file" accept="application/json,.json" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) importarDatos(f); e.target.value = ""; }} />
      </label>
      <p style={{ color: TEXT_SUB, fontSize: 12, margin: "4px 0 20px", lineHeight: 1.5 }}>
        La copia se guarda en este dispositivo como un archivo. Restaurar sustituye lo
        que haya ahora por lo que traiga el archivo, así que hazte una copia antes.
      </p>

      {/* Datos fiscales de quien vende. Sin esto, cualquier factura sale marcada
          como proforma: ver FacturaPedido. */}
      <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "15px 16px", marginBottom: 20 }}>
        <p style={{ margin: "0 0 3px", fontFamily: TIPO_TIT, fontSize: 14, fontWeight: 700, color: MARRON }}>Datos de la empresa</p>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: TEXT_SUB, lineHeight: 1.5 }}>
          Van en los albaranes y las facturas. Mientras falte el NIF o la dirección,
          las facturas salen marcadas como <strong>proforma</strong>, sin validez.
          Confirma con tu gestor el tipo de IVA y si te aplica Verifactu.
        </p>
        <Input label="Nombre comercial" value={emp.nombre}
          onChange={e => setEmpresa({ ...emp, nombre: e.target.value })} placeholder="Don Pepe Sabor" />
        <Input label="Razón social (quien factura)" value={emp.razonSocial || ""}
          onChange={e => setEmpresa({ ...emp, razonSocial: e.target.value })} placeholder="Inversiones Ayala 1992" />
        <Input label="NIF / CIF" value={emp.nif}
          onChange={e => setEmpresa({ ...emp, nif: e.target.value })} placeholder="Ej: B75361477" />
        <Input label="Dirección fiscal" value={emp.direccion}
          onChange={e => setEmpresa({ ...emp, direccion: e.target.value })} placeholder={DIRECCION_LOCAL} />
        <Input label="Teléfono" value={emp.telefono}
          onChange={e => setEmpresa({ ...emp, telefono: e.target.value })} placeholder="604 136 371" />
        <Input label="IVA que llevan los precios dentro (%)" type="number" min="0" step="1" value={emp.iva}
          onChange={e => setEmpresa({ ...emp, iva: e.target.value })} placeholder="10" />
        {/* El último paso, y el que no se puede dar sin el gestor: tener el CIF
            no hace válida una factura si el IVA de cada producto está mal. */}
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, color: TEXT_MAIN, fontSize: 13, cursor: "pointer", margin: "4px 0 10px", lineHeight: 1.45 }}>
          <input type="checkbox" checked={!!emp.ivaConfirmado} style={{ marginTop: 3 }}
            onChange={e => setEmpresa({ ...emp, ivaConfirmado: e.target.checked })} />
          <span>
            Mi gestor me ha confirmado el <strong>tipo de IVA</strong> de estos productos
            y que <strong>no me obliga Verifactu</strong>. Hasta que marques esto, las
            facturas salen como proforma aunque los datos estén completos.
          </span>
        </label>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: empresaLista(emp) ? "#16a34a" : "#bf7d08" }}>
          {empresaLista(emp)
            ? "Listo: las facturas ya no salen como proforma."
            : emp.ivaConfirmado
              ? "Faltan datos: las facturas saldrán marcadas como proforma."
              : "Pendiente del gestor: las facturas saldrán marcadas como proforma."}
        </p>
      </div>

      {/* Limpieza de pedidos viejos.
          Borra SOLO los anteriores a la fecha elegida y trabaja sobre la lista
          que hay en ese momento, así que un pedido que entre mientras tanto no
          se pierde. Restaurar un archivo sí lo habría borrado. */}
      <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "15px 16px", marginBottom: 20 }}>
        <p style={{ margin: "0 0 3px", fontFamily: TIPO_TIT, fontSize: 14, fontWeight: 700, color: MARRON }}>Limpiar pedidos antiguos</p>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: TEXT_SUB, lineHeight: 1.5 }}>
          Borra los pedidos anteriores a la fecha que elijas. Los de ese día en adelante
          no se tocan, y los que entren mientras tanto tampoco.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="date" value={corte} onChange={e => setCorte(e.target.value)}
            style={{ background: BG_INPUT, border: `1px solid ${BORDER}`, color: TEXT_MAIN, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit" }} />
          <Btn variant="danger" small onClick={() => antiguos.length && setConfirmarBorrado(true)}>
            🗑️ Borrar {antiguos.length} pedido{antiguos.length === 1 ? "" : "s"}
          </Btn>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: antiguos.length ? "#bf7d08" : TEXT_TENUE, fontWeight: antiguos.length ? 700 : 400 }}>
          {antiguos.length === 0
            ? "No hay pedidos anteriores a esa fecha."
            : `Se borrarán ${antiguos.length} pedidos (del ${fechaLegible(masViejo)} al ${fechaLegible(masNuevo)}). Quedarán ${pedidos.length - antiguos.length}.`}
        </p>
      </div>

      {confirmarBorrado && (
        <Modal title="Borrar pedidos antiguos" accent="#b03a2e" onClose={() => setConfirmarBorrado(false)}>
          <p style={{ color: TEXT_MAIN, fontSize: 15, margin: "0 0 10px", lineHeight: 1.5 }}>
            Vas a borrar <strong>{antiguos.length} pedidos</strong> anteriores al {fechaLegible(corte)}.
            Quedarán <strong>{pedidos.length - antiguos.length}</strong>.
          </p>
          <p style={{ color: TEXT_SUB, fontSize: 13, margin: "0 0 18px", lineHeight: 1.5 }}>
            Esto no se puede deshacer. Si no te has hecho una copia de seguridad,
            cierra esto y hazla antes con el botón de arriba.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setConfirmarBorrado(false)}>Cancelar</Btn>
            <Btn variant="danger" onClick={() => {
              setPedidos(ps => ps.filter(p => (p.fecha || "") >= corte));
              setConfirmarBorrado(false);
            }}>Sí, borrar</Btn>
          </div>
        </Modal>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        {TABS_ADMIN.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)} style={{
            padding: "12px 8px", borderRadius: 12,
            border: `2px solid ${sub === t.id ? ACENTOS[t.id] : BORDER}`,
            background: sub === t.id ? ACENTOS[t.id] + "22" : BG_CARD,
            color: sub === t.id ? ACENTOS[t.id] : TEXT_SUB,
            fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "center"
          }}>{t.icon} {t.label}</button>
        ))}
      </div>
      {sub === "proveedores" && <ModuloProveedores proveedores={proveedores} setProveedores={setProveedores} irInicio={irInicio} />}
      {sub === "compras" && <ModuloCompras compras={compras} setCompras={setCompras} proveedores={proveedores} ingredientes={ingredientes} setIngredientes={setIngredientes} irInicio={irInicio} />}
      {sub === "gastos" && <ModuloGastos gastos={gastos} setGastos={setGastos} irInicio={irInicio} />}
      {sub === "reporte" && <ModuloReporte pedidos={pedidos} compras={compras} gastos={gastos} producciones={producciones} trabajadoras={trabajadoras} irInicio={irInicio} />}
    </div>
  );
}

// El `icon` es el nombre del dibujo en <Icono>, ya no un emoji.
const TABS = [
  { id: "pedidos",    label: "Pedidos",        icon: "pedidos" },
  { id: "clientes",   label: "Clientes",       icon: "clientes" },
  { id: "inventario", label: "Inventario",     icon: "inventario" },
  { id: "mostrador",  label: "Mostrador",      icon: "mostrador" },
  { id: "stock",      label: "Stock",          icon: "stock" },
  { id: "produccion", label: "Producción",     icon: "produccion" },
  { id: "personal",   label: "Personal",       icon: "personal" },
  { id: "admin",      label: "Administración", icon: "admin" },
];

const TABS_ADMIN = [
  { id: "proveedores", label: "Proveedores", icon: "🚚" },
  { id: "compras",     label: "Compras",     icon: "🧺" },
  { id: "gastos",      label: "Gastos",      icon: "🧹" },
  { id: "reporte",     label: "Reporte",     icon: "📈" },
];

function cargarLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

// ─── MÓDULO: BIENVENIDA ──────────────────────────────────────────────────────
/**
 * PANEL DEL DÍA — lo primero que se ve al entrar.
 *
 * Antes aquí había ocho botones, y el dueño tenía que entrar en cada pantalla
 * para saber cómo iba el día. Ahora se ve de un vistazo y los botones viven en
 * el menú lateral. Todo lo de aquí sale de los pedidos reales: si no hay
 * pedidos, no se inventa nada, se dice que no hay.
 */
function ModuloBienvenida({ setTab, pedidos, productos, repartidores }) {
  const hoyISO = hoy();
  const vivos = pedidos.filter(p => p.estado !== "Cancelado");
  const delDia = vivos.filter(p => p.fecha === hoyISO);
  /**
   * Pendiente de verdad es el que todavía se puede atender: de hoy en adelante.
   * Los de días pasados que nunca se pasaron a Entregado se cuentan aparte: si
   * entran en la misma cifra, el panel marca 42 pendientes con la cocina parada.
   */
  const pendientes = pedidos.filter(p => p.estado === "Pendiente" && p.fecha >= hoyISO);
  const olvidados = pedidos.filter(p => p.estado === "Pendiente" && p.fecha < hoyISO);

  const euros = n => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const suma = lista => lista.reduce((t, p) => t + totalesPedido(p).total, 0);

  // ── Ventas de los últimos 14 días ──
  const dias = Array.from({ length: 14 }, (_, i) => {
    const f = new Date();
    f.setDate(f.getDate() - (13 - i));
    const iso = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
    return { iso, inicial: ["D", "L", "M", "X", "J", "V", "S"][f.getDay()], total: suma(vivos.filter(p => p.fecha === iso)) };
  });
  const techo = Math.max(...dias.map(d => d.total), 1);
  const totalQuincena = dias.reduce((t, d) => t + d.total, 0);

  // Geometría del gráfico de barras, calculada aquí para que el dibujo no mienta.
  const BASE = 190, ALTO = 160, ANCHO = 24, PASO = 40, X0 = 34;
  const barras = dias.map((d, i) => {
    const h = (d.total / techo) * ALTO;
    const x = X0 + i * PASO, y = BASE - h, r = Math.min(4, h);
    return {
      ...d, x, cx: x + ANCHO / 2, textoY: y - 5,
      d: h <= 0 ? "" : `M${x},${BASE} V${y + r} Q${x},${y} ${x + r},${y} H${x + ANCHO - r} Q${x + ANCHO},${y} ${x + ANCHO},${y + r} V${BASE} Z`,
    };
  });

  // ── Lo que más se vende este mes ──
  const desde = inicioDeMes();
  const delMes = vivos.filter(p => p.fecha >= desde);
  const porProducto = {};
  for (const p of delMes) {
    for (const it of p.items || []) {
      const nombre = it.nombreProducto || "—";
      porProducto[nombre] = (porProducto[nombre] || 0) + (Number(it.cantidad) || 0);
    }
  }
  const top = Object.entries(porProducto).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topeTop = Math.max(...top.map(([, n]) => n), 1);

  // ── Cómo lo reciben ──
  const aDomicilio = delMes.filter(p => p.tipoEntrega !== "Recogida").length;
  const porcentaje = delMes.length ? Math.round((aDomicilio / delMes.length) * 100) : 0;
  const VUELTA = 2 * Math.PI * 44;
  const ticket = delMes.length ? suma(delMes) / delMes.length : 0;
  const bandejasHoy = delDia.reduce((t, p) => t + (p.items || []).reduce((n, it) => n + (Number(it.cantidad) || 0), 0), 0);

  const Tarjeta = ({ children, ...resto }) => (
    <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "16px 18px", ...resto }}>{children}</div>
  );
  const Titulo = ({ children, pie }) => (
    <>
      <h2 style={{ margin: 0, fontFamily: TIPO_TIT, fontSize: 16, fontWeight: 700, color: MARRON }}>{children}</h2>
      {pie && <p style={{ margin: "2px 0 14px", fontSize: 12, color: TEXT_TENUE }}>{pie}</p>}
    </>
  );

  const largo = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const hoyLargo = largo.charAt(0).toUpperCase() + largo.slice(1);   // solo la primera letra

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 12.5, color: TEXT_SUB, fontWeight: 600 }}>{hoyLargo}</p>
          <h1 style={{ margin: "2px 0 0", fontFamily: TIPO_TIT, fontSize: 27, fontWeight: 800, color: MARRON, lineHeight: 1.1 }}>Panel del día</h1>
        </div>
        <Btn accent={VINO} onClick={() => setTab("pedidos")}>Ver pedidos</Btn>
      </div>

      {olvidados.length > 0 && (
        <button onClick={() => setTab("pedidos")}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left", font: "inherit", cursor: "pointer", marginBottom: 14, background: "#bf7d0812", border: "1px solid #bf7d0855", borderRadius: 14, padding: "12px 15px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#bf7d08" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
            <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" />
          </svg>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: MARRON }}>
              {olvidados.length} pedido{olvidados.length === 1 ? "" : "s"} de días pasados sigue{olvidados.length === 1 ? "" : "n"} en Pendiente
            </span>
            <span style={{ display: "block", fontSize: 12, color: TEXT_SUB }}>
              Pásalos a Entregado o Cancelado para que dejen de contar
            </span>
          </span>
          <span style={{ color: "#bf7d08", fontWeight: 800, fontSize: 13 }}>Ver</span>
        </button>
      )}

      {/* Las cuatro cifras */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(138px, 1fr))", gap: 10, marginBottom: 14 }}>
        {[
          { label: "Ventas de hoy", valor: euros(suma(delDia)), pie: `${delDia.length} pedido${delDia.length === 1 ? "" : "s"}` },
          { label: "Pendientes", valor: String(pendientes.length), pie: "por confirmar", al: "pedidos" },
          { label: "Para hoy", valor: String(bandejasHoy), pie: `bandeja${bandejasHoy === 1 ? "" : "s"} a entregar` },
          { label: "Ticket medio", valor: euros(ticket), pie: "este mes" },
        ].map(c => (
          <button key={c.label} onClick={() => c.al && setTab(c.al)}
            style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "14px 16px", textAlign: "left", cursor: c.al ? "pointer" : "default", font: "inherit" }}>
            <p style={{ margin: 0, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: TEXT_TENUE, fontWeight: 700 }}>{c.label}</p>
            <p style={{ margin: "7px 0 0", fontFamily: TIPO_TIT, fontSize: 25, fontWeight: 800, color: MARRON, lineHeight: 1 }}>{c.valor}</p>
            <p style={{ margin: "5px 0 0", fontSize: 12, color: TEXT_SUB }}>{c.pie}</p>
          </button>
        ))}
      </div>

      {/* Ventas por día */}
      <Tarjeta style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Titulo>Ventas de los últimos 14 días</Titulo>
          <span style={{ fontSize: 12, color: TEXT_SUB }}>
            Total <strong style={{ color: TEXT_MAIN }}>{euros(totalQuincena)}</strong>
          </span>
        </div>
        {totalQuincena === 0 ? (
          <Empty texto="Todavía no hay ventas registradas estos días" />
        ) : (
          <svg viewBox="0 0 600 215" style={{ width: "100%", height: "auto", display: "block", marginTop: 10 }}
            role="img" aria-label={`Ventas diarias de los últimos catorce días. Total ${euros(totalQuincena)}.`}>
            {[190, 150, 110, 70, 30].map(y => <line key={y} x1="30" y1={y} x2="585" y2={y} stroke={BORDER} strokeWidth="1" />)}
            <text x="24" y="193" textAnchor="end" fontSize="9.5" fill={TEXT_TENUE}>0</text>
            <text x="24" y="33" textAnchor="end" fontSize="9.5" fill={TEXT_TENUE}>{Math.round(techo)} €</text>
            {barras.map(b => (
              <g key={b.iso}>
                {b.d && <path d={b.d} fill={VINO} />}
                {b.total > 0 && b.total === techo && (
                  <text x={b.cx} y={b.textoY} textAnchor="middle" fontSize="10" fontWeight="700" fill={TEXT_MAIN}>{Math.round(b.total)}</text>
                )}
                <text x={b.cx} y="205" textAnchor="middle" fontSize="9.5" fill={TEXT_TENUE}>{b.inicial}</text>
              </g>
            ))}
          </svg>
        )}
      </Tarjeta>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        {/* Lo que más se vende */}
        <Tarjeta>
          <Titulo pie="Bandejas vendidas este mes">Lo que más se vende</Titulo>
          {!top.length ? <Empty texto="Sin pedidos este mes" /> : top.map(([nombre, n]) => (
            <div key={nombre} style={{ marginBottom: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT_MAIN }}>{nombre}</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: TEXT_SUB }}>{n}</span>
              </div>
              <div style={{ height: 8, background: BG_APP, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(n / topeTop) * 100}%`, background: VINO, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </Tarjeta>

        {/* Cómo lo reciben */}
        <Tarjeta>
          <Titulo pie="Pedidos de este mes">Cómo lo reciben</Titulo>
          {!delMes.length ? <Empty texto="Sin pedidos este mes" /> : (
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <svg viewBox="0 0 120 120" style={{ width: 118, height: 118, flex: "none" }}
                role="img" aria-label={`${porcentaje} por ciento a domicilio, ${100 - porcentaje} por ciento recogida en tienda.`}>
                <circle cx="60" cy="60" r="44" fill="none" stroke={ORO} strokeWidth="18" />
                <circle cx="60" cy="60" r="44" fill="none" stroke={VINO} strokeWidth="18"
                  strokeDasharray={`${(porcentaje / 100) * VUELTA} ${VUELTA}`} transform="rotate(-90 60 60)" />
                <circle cx="60" cy="60" r="35" fill={BG_CARD} />
                <text x="60" y="57" textAnchor="middle" fontFamily="Archivo, sans-serif" fontSize="21" fontWeight="800" fill={MARRON}>{delMes.length}</text>
                <text x="60" y="71" textAnchor="middle" fontSize="9.5" fill={TEXT_TENUE}>pedidos</text>
              </svg>
              <div style={{ flex: 1, minWidth: 140 }}>
                {[["A domicilio", VINO, porcentaje], ["Recogida en tienda", ORO, 100 - porcentaje]].map(([txt, color, pct]) => (
                  <div key={txt} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 11 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: color, flex: "none" }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN, flex: 1 }}>{txt}</span>
                    <strong style={{ fontFamily: TIPO_TIT, fontSize: 15, color: MARRON }}>{pct} %</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Tarjeta>
      </div>

      {/* Lo que toca hoy */}
      <Tarjeta style={{ marginTop: 14 }}>
        <Titulo pie={delDia.length ? `${delDia.length} entrega${delDia.length === 1 ? "" : "s"}` : null}>Lo siguiente</Titulo>
        {!delDia.length ? <Empty texto="Hoy no hay entregas" /> : (
          delDia.slice(0, 4).map(p => (
            <button key={p.id} onClick={() => setTab("pedidos")}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderTop: `1px solid ${BG_APP}`, background: "none", border: "none", cursor: "pointer", textAlign: "left", font: "inherit" }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: VINO + "14", display: "grid", placeItems: "center", flex: "none" }}>
                <Icono nombre="pedidos" color={VINO} tam={17} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: TEXT_MAIN }}>{p.nombre}</span>
                <span style={{ display: "block", fontSize: 12, color: TEXT_SUB }}>
                  {p.rangoHorario ? `${p.rangoHorario} · ` : ""}{quienEntrega(p, repartidores)}
                </span>
              </span>
              <span style={{ fontFamily: TIPO_TIT, fontWeight: 800, fontSize: 14, color: VINO }}>{euros(totalesPedido(p).total)}</span>
            </button>
          ))
        )}
      </Tarjeta>
    </div>
  );
}

// ─── DATOS DE PRUEBA ────────────────────────────────────────────────────────
// Fechas pasadas para demo
const d = (n) => { const f = new Date(); f.setDate(f.getDate() - n); return f.toISOString().split("T")[0]; };

const PRODUCTOS_DEMO = [
  // ── TEQUEÑOS ──
  { id: "p1",  nombre: "Tequeños Tradicionales",       categoria: "Tequeños",   variantes: [
    { presentacion: "Bandeja 25", precio: 12, stock: 0, lotes: [] },
    { presentacion: "Bandeja 50", precio: 22, stock: 0, lotes: [] },
  ]},
  { id: "p2",  nombre: "Tequeños de Guayaba y Queso",  categoria: "Tequeños",   variantes: [{ presentacion: "Bandeja 25", precio: 22, stock: 0, lotes: [] }] },
  { id: "p3",  nombre: "Tequeños de Salchicha",         categoria: "Tequeños",   variantes: [{ presentacion: "Bandeja 25", precio: 20, stock: 0, lotes: [] }] },
  { id: "p4",  nombre: "Tequeños de Plátano con Queso", categoria: "Tequeños",   variantes: [{ presentacion: "Bandeja 25", precio: 20, stock: 0, lotes: [] }] },
  { id: "p5",  nombre: "Tequeños de Jamón y Queso",     categoria: "Tequeños",   variantes: [{ presentacion: "Bandeja 25", precio: 22, stock: 0, lotes: [] }] },
  { id: "p6",  nombre: "Tequeños de Chocolate",         categoria: "Tequeños",   variantes: [{ presentacion: "Bandeja 24", precio: 22, stock: 0, lotes: [] }] },
  // ── PASTELITOS ──
  { id: "p7",  nombre: "Pastelito de Pollo",                          categoria: "Pastelitos", variantes: [{ presentacion: "Bandeja 25", precio: 22, stock: 0, lotes: [] }] },
  { id: "p8",  nombre: "Pastelito de Carne Molida",                   categoria: "Pastelitos", variantes: [{ presentacion: "Bandeja 25", precio: 22, stock: 0, lotes: [] }] },
  { id: "p9",  nombre: "Pastelito de Carne Mechada",                  categoria: "Pastelitos", variantes: [{ presentacion: "Bandeja 25", precio: 22, stock: 0, lotes: [] }] },
  { id: "p10", nombre: "Pastelito de Jamón y Queso",                  categoria: "Pastelitos", variantes: [{ presentacion: "Bandeja 25", precio: 22, stock: 0, lotes: [] }] },
  { id: "p11", nombre: "Pastelito de Carne Mechada con Queso Amarillo",categoria: "Pastelitos", variantes: [{ presentacion: "Bandeja 25", precio: 22, stock: 0, lotes: [] }] },
  { id: "p12", nombre: "Pastelito de Pollo con Queso Amarillo",       categoria: "Pastelitos", variantes: [{ presentacion: "Bandeja 25", precio: 22, stock: 0, lotes: [] }] },
  // ── EMPANADAS ──
  { id: "p13", nombre: "Empanada de Carne Molida",   categoria: "Empanadas", variantes: [{ presentacion: "Bandeja 25", precio: 21, stock: 0, lotes: [] }] },
  { id: "p14", nombre: "Empanada de Pollo",          categoria: "Empanadas", variantes: [{ presentacion: "Bandeja 25", precio: 21, stock: 0, lotes: [] }] },
  { id: "p15", nombre: "Empanada de Carne Mechada",  categoria: "Empanadas", variantes: [{ presentacion: "Bandeja 25", precio: 21, stock: 0, lotes: [] }] },
  { id: "p16", nombre: "Empanada de Queso",          categoria: "Empanadas", variantes: [{ presentacion: "Bandeja 25", precio: 21, stock: 0, lotes: [] }] },
  { id: "p17", nombre: "Empanada de Jamón y Queso",  categoria: "Empanadas", variantes: [{ presentacion: "Bandeja 25", precio: 21, stock: 0, lotes: [] }] },
  // ── CACHITOS ──
  { id: "p18", nombre: "Cachitos Horneados", categoria: "Otros", variantes: [{ presentacion: "Bandeja 6", precio: 18, stock: 0, lotes: [] }] },
];
const CLIENTES_DEMO      = [];
const PEDIDOS_DEMO       = [];
const PROVEEDORES_DEMO   = [];
const COMPRAS_DEMO       = [];
const GASTOS_DEMO        = [];
const REPARTIDORES_DEMO  = [
  { id: "r1", nombre: "Elnison", telefono: "658083047", fijo: false },
  { id: "r2", nombre: "Saul",    telefono: "722765314", fijo: false },
];
const TRABAJADORAS_DEMO  = [];
const PRODUCCIONES_DEMO  = [];

export default function AppModerno() {
  const [tab, setTab] = useState("inicio");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuFijo = usePantallaAncha();   // en pantalla ancha el menú no se esconde
  const [pedidos, setPedidos] = useState(() => cargarLS("pedidos", PEDIDOS_DEMO));
  const [clientes, setClientes] = useState(() => cargarLS("clientes", CLIENTES_DEMO));
  const [productos, setProductos] = useState(() => {
    const g = cargarLS("productos", PRODUCTOS_DEMO);
    return g.map(p => ({ ...p, variantes: p.variantes.map(v => ({ ...v, stock: v.stock ?? 0, lotes: v.lotes || [] })) }));
  });
  const [proveedores, setProveedores] = useState(() => cargarLS("proveedores", PROVEEDORES_DEMO));
  const [compras, setCompras] = useState(() => cargarLS("compras", COMPRAS_DEMO));
  const [ingredientes, setIngredientes] = useState(() => cargarLS("ingredientes", []));
  const [gastos, setGastos] = useState(() => cargarLS("gastos", GASTOS_DEMO));
  const [repartidores, setRepartidores] = useState(() => {
    const g = cargarLS("repartidores", null);
    if (!g) return [...REPARTIDORES_INICIALES, ...REPARTIDORES_DEMO];
    const tieneFijo = g.some(r => r.id === REPARTIDOR_TIENDA_ID);
    return tieneFijo ? g : [...REPARTIDORES_INICIALES, ...g];
  });
  const [producciones, setProducciones] = useState(() => cargarLS("producciones", PRODUCCIONES_DEMO));
  const [trabajadoras, setTrabajadoras] = useState(() => cargarLS("trabajadoras", TRABAJADORAS_DEMO));
  const [jornadas, setJornadas] = useState(() => cargarLS("jornadas", []));   // mostrador
  // Datos fiscales de quien vende. Van aparte porque son uno solo, no una lista.
  const [empresa, setEmpresa] = useState(() => fusionaEmpresa(cargarLS("empresa", null)));

  const [listo, setListo] = useState(false);

  const sync = (key, data) => {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
    setDoc(doc(db, "datos", key), { valor: JSON.stringify(data) }).catch(() => {});
  };

  useEffect(() => { if (listo) sync("pedidos", pedidos); }, [JSON.stringify(pedidos)]);
  useEffect(() => { if (listo) sync("clientes", clientes); }, [JSON.stringify(clientes)]);
  useEffect(() => { if (listo) sync("productos", productos); }, [JSON.stringify(productos)]);
  useEffect(() => { if (listo) sync("proveedores", proveedores); }, [JSON.stringify(proveedores)]);
  useEffect(() => { if (listo) sync("compras", compras); }, [JSON.stringify(compras)]);
  useEffect(() => { if (listo) sync("ingredientes", ingredientes); }, [JSON.stringify(ingredientes)]);
  useEffect(() => { if (listo) sync("gastos", gastos); }, [JSON.stringify(gastos)]);
  useEffect(() => { if (listo) sync("repartidores", repartidores); }, [JSON.stringify(repartidores)]);
  useEffect(() => { if (listo) sync("producciones", producciones); }, [JSON.stringify(producciones)]);
  useEffect(() => { if (listo) sync("trabajadoras", trabajadoras); }, [JSON.stringify(trabajadoras)]);
  useEffect(() => { if (listo) sync("jornadas", jornadas); }, [JSON.stringify(jornadas)]);
  useEffect(() => { if (listo) sync("empresa", empresa); }, [JSON.stringify(empresa)]);

  /**
   * Agenda pública de huecos.
   *
   * La tienda necesita saber qué franjas están llenas, pero NO puede leer los
   * pedidos: ahí están los nombres, teléfonos y direcciones de los clientes, y
   * eso no sale de aquí. Así que se publica aparte un resumen que solo dice
   * cuántos repartos hay en cada franja de cada día. Sin nombres, sin importes,
   * sin nada de nadie.
   *
   * Solo de hoy en adelante: el pasado no le sirve a la tienda para nada.
   */
  useEffect(() => {
    if (!listo) return;
    const desde = hoy();
    const futuros = pedidos.filter(p => (p.fecha || "") >= desde);
    const agenda = ocupacion(futuros);
    setDoc(doc(db, "datos", "agenda"), { valor: JSON.stringify(agenda) }).catch(() => {});
  }, [listo, JSON.stringify(pedidos)]);

  /**
   * Primero se LEE la nube, y solo después se escribe.
   *
   * Antes solo se escuchaban los pedidos: el resto (productos, clientes, gastos…) se
   * cargaba de este navegador y se subía encima de la nube. Un dispositivo con datos
   * viejos bastaba para borrar el catálogo entero, y pasó el 01/10/2026. Hasta que
   * todas las colecciones han contestado no se sube nada (`listo`).
   */
  useEffect(() => {
    const destinos = {
      pedidos: setPedidos, clientes: setClientes, productos: setProductos,
      proveedores: setProveedores, compras: setCompras, ingredientes: setIngredientes,
      gastos: setGastos, repartidores: setRepartidores, producciones: setProducciones,
      trabajadoras: setTrabajadoras, jornadas: setJornadas,
      empresa: (d) => setEmpresa(fusionaEmpresa(d)),
    };
    const claves = Object.keys(destinos);
    let faltan = claves.length;
    const unaMenos = () => { if (--faltan <= 0) setListo(true); };

    const subs = claves.map((clave, i) => {
      let primera = true;
      return onSnapshot(doc(db, "datos", clave), (snap) => {
        if (snap.exists()) {
          try {
            const data = JSON.parse(snap.data().valor);
            destinos[clave](data);
            localStorage.setItem(clave, JSON.stringify(data));
          } catch {}
        }
        if (primera) { primera = false; unaMenos(); }
      }, () => { if (primera) { primera = false; unaMenos(); } });
    });
    // Si la red no contesta, se desbloquea igualmente para poder seguir trabajando.
    const red = setTimeout(() => setListo(true), 8000);
    return () => { clearTimeout(red); subs.forEach(u => u()); };
  }, []);

  const ac = ACENTOS[tab] || ACENTOS.pedidos;
  // Igual que en el panel: solo cuentan los pendientes que aún se pueden atender.
  const pendientes = pedidos.filter(p => p.estado === "Pendiente" && p.fecha >= hoy()).length;
  const hoyEntregas = pedidos.filter(p => p.fecha === hoy() && p.estado !== "Cancelado").length;
  const irInicio = () => setTab("inicio");



  const exportarDatos = () => {
    const datos = { pedidos, clientes, productos, proveedores, compras, ingredientes, gastos, repartidores, producciones, trabajadoras, jornadas, empresa, exportado: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `donpepesabor-backup-${hoy()}.json`;
    a.click();
  };

  /**
   * Restaura una copia hecha con "Exportar Backup".
   *
   * Solo toca las listas que vengan en el archivo, y avisa de cuántas filas entran:
   * restaurar a ciegas es tan peligroso como perder los datos.
   */
  const importarDatos = (archivo) => {
    const lector = new FileReader();
    lector.onload = () => {
      let d;
      try { d = JSON.parse(lector.result); }
      catch { alert("Ese archivo no es una copia válida."); return; }

      const destinos = {
        pedidos: setPedidos, clientes: setClientes, productos: setProductos,
        proveedores: setProveedores, compras: setCompras, ingredientes: setIngredientes,
        gastos: setGastos, repartidores: setRepartidores, producciones: setProducciones,
        trabajadoras: setTrabajadoras, jornadas: setJornadas,
      };
      const entran = Object.keys(destinos).filter(k => Array.isArray(d[k]));
      if (!entran.length) { alert("El archivo no contiene datos reconocibles."); return; }

      const resumen = entran.map(k => `· ${k}: ${d[k].length}`).join(" | ");
      const fecha = d.exportado ? new Date(d.exportado).toLocaleString("es-ES") : "fecha desconocida";
      if (!confirm(`Copia del ${fecha}. Se sustituirá lo que hay ahora por: ${resumen}. ¿Continuar?`)) return;

      entran.forEach(k => { destinos[k](d[k]); sync(k, d[k]); });
      // La empresa no es una lista, así que no entra en el bucle de arriba.
      if (d.empresa && typeof d.empresa === "object" && !Array.isArray(d.empresa)) {
        const e = fusionaEmpresa(d.empresa);
        setEmpresa(e); sync("empresa", e);
      }
      alert("Copia restaurada.");
    };
    lector.readAsText(archivo);
  };


  const soloVista = new URLSearchParams(window.location.search).has("preview");
  const [toastVista, setToastVista] = useState(false);
  const PALABRAS_ACCION = ["guardar", "nuevo", "eliminar", "borrar", "añadir", "agregar", "crear", "editar", "actualizar", "cargar", "exportar", "backup", "demo", "save", "delete", "+"];
  const bloquearClick = soloVista ? (e) => {
    const btn = e.target.closest("button, input[type=submit]");
    if (!btn) return;
    const texto = (btn.textContent || "").toLowerCase().trim();
    const esAccion = PALABRAS_ACCION.some(p => texto.includes(p)) || btn.querySelector("input, select, textarea");
    if (esAccion) {
      e.stopPropagation();
      e.preventDefault();
      setToastVista(true);
      setTimeout(() => setToastVista(false), 2000);
    }
  } : undefined;

  return (
    <div style={{ background: BG_APP, minHeight: "100vh", fontFamily: TIPO, color: TEXT_MAIN }}>
      {soloVista && (
        <div style={{ background: VINO, color: "#fff", textAlign: "center", padding: "8px 16px", fontSize: 13, fontWeight: 700, position: "sticky", top: 0, zIndex: 200 }}>
          👁 Modo Vista — Solo lectura
        </div>
      )}
      {toastVista && (
        <div style={{ position: "fixed", top: soloVista ? 80 : 16, left: "50%", transform: "translateX(-50%)", background: MARRON, color: "#fff", borderRadius: 12, padding: "10px 20px", fontWeight: 700, fontSize: 14, zIndex: 999, boxShadow: "0 4px 20px #0003" }}>
          🔒 Solo puedes ver, no hacer cambios
        </div>
      )}
      {/* Cabecera. Solo en pantalla estrecha: con el menú fijo, la marca vive
          dentro del propio menú y la barra de arriba sobra. */}
      {!menuFijo && (
      <div style={{ background: MARRON, padding: "12px 16px", position: "sticky", top: 0, zIndex: 60, boxShadow: "0 2px 14px rgba(42,18,0,.25)" }}>
        {/* El botón va a la izquierda, del mismo lado por el que entra el menú. */}
        <div style={{ maxWidth: menuFijo ? "none" : 760, margin: "0 auto", display: "flex", alignItems: "center", gap: 11 }}>
          {!menuFijo && (
            <button onClick={() => setMenuAbierto(true)} aria-label="Abrir el menú"
              style={{ width: 42, height: 42, borderRadius: 11, border: "1px solid #ffffff2e", background: "#ffffff1a", cursor: "pointer", display: "grid", placeItems: "center", flex: "none", position: "relative" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BG_APP} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
              {pendientes > 0 && (
                <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 999, background: VINO, color: "#fff", fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center", border: `2px solid ${MARRON}` }}>
                  {pendientes}
                </span>
              )}
            </button>
          )}
          <button onClick={irInicio} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 11, flex: 1, minWidth: 0, textAlign: "left" }}>
            <img src="/logo-donpepe.png" alt="" style={{ width: 42, height: 42, objectFit: "contain", borderRadius: 10, background: BG_APP, flex: "none" }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontFamily: TIPO_TIT, fontWeight: 800, fontSize: 16, color: "#fff" }}>
                Don Pepe <span style={{ color: ORO }}>Sabor</span>
              </span>
              <span style={{ display: "block", fontSize: 9.5, letterSpacing: ".18em", textTransform: "uppercase", color: "#c3a98f", fontWeight: 600 }}>
                Gestión interna
              </span>
            </span>
          </button>
        </div>
      </div>
      )}

      {/* Contenido. Con el menú fijo se aparta para no quedar debajo, y se le
          deja más ancho: en un monitor, 760 px dejaban media pantalla vacía. */}
      <div style={{ paddingLeft: menuFijo ? ANCHO_MENU : 0 }}>
      <div className="main-content" style={{ maxWidth: menuFijo ? 1180 : 760, margin: "0 auto" }} onClickCapture={bloquearClick}>
        {tab === "inicio" && <ModuloBienvenida setTab={setTab} pedidos={pedidos} productos={productos} repartidores={repartidores} />}
        {tab === "pedidos" && <ModuloPedidos pedidos={pedidos} setPedidos={setPedidos} productos={productos} setProductos={setProductos} clientes={clientes} setClientes={setClientes} repartidores={repartidores} empresa={empresa} />}
        {tab === "clientes" && <ModuloClientes clientes={clientes} setClientes={setClientes} pedidos={pedidos} />}
        {tab === "inventario" && <ModuloInventario productos={productos} setProductos={setProductos} />}
        {tab === "mostrador" && <ModuloMostrador productos={productos} setProductos={setProductos} jornadas={jornadas} setJornadas={setJornadas} />}
        {tab === "stock" && <ModuloStock productos={productos} />}
        {tab === "produccion" && <ModuloProduccion producciones={producciones} setProducciones={setProducciones} trabajadoras={trabajadoras} setTrabajadoras={setTrabajadoras} productos={productos} setProductos={setProductos} />}
        {tab === "personal" && <ModuloPersonal repartidores={repartidores} setRepartidores={setRepartidores} trabajadoras={trabajadoras} setTrabajadoras={setTrabajadoras} />}
        {tab === "admin" && <ModuloAdmin proveedores={proveedores} setProveedores={setProveedores} compras={compras} setCompras={setCompras} gastos={gastos} setGastos={setGastos} ingredientes={ingredientes} setIngredientes={setIngredientes} pedidos={pedidos} setPedidos={setPedidos} producciones={producciones} trabajadoras={trabajadoras} empresa={empresa} setEmpresa={setEmpresa} exportarDatos={exportarDatos} importarDatos={importarDatos} />}
      </div>
      </div>

      {/* Menú lateral. Fijo si hay sitio; si no, un cajón con velo por delante. */}
      {menuAbierto && !menuFijo && (
        <div onClick={() => setMenuAbierto(false)}
          style={{ position: "fixed", inset: 0, background: "#2a120066", zIndex: 70 }} />
      )}
      <nav aria-label="Menú principal" aria-hidden={!menuFijo && !menuAbierto}
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0,
          width: ANCHO_MENU, maxWidth: menuFijo ? ANCHO_MENU : "82vw",
          background: BG_CARD, zIndex: menuFijo ? 40 : 80, display: "flex", flexDirection: "column",
          boxShadow: menuFijo ? "none" : "18px 0 50px rgba(42,18,0,.28)",
          borderRight: menuFijo ? `1px solid ${BORDER}` : "none",
          transform: menuFijo || menuAbierto ? "translateX(0)" : "translateX(-105%)",
          transition: "transform .22s ease",
        }}>
        {/* Con el menú fijo, la marca va aquí arriba, como en la tienda. */}
        {menuFijo ? (
          <button onClick={irInicio}
            style={{ background: MARRON, border: "none", cursor: "pointer", padding: "15px 18px", display: "flex", alignItems: "center", gap: 11, textAlign: "left" }}>
            <img src="/logo-donpepe.png" alt="" style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 10, background: BG_APP, flex: "none" }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontFamily: TIPO_TIT, fontWeight: 800, fontSize: 15, color: "#fff" }}>
                Don Pepe <span style={{ color: ORO }}>Sabor</span>
              </span>
              <span style={{ display: "block", fontSize: 9, letterSpacing: ".18em", textTransform: "uppercase", color: "#c3a98f", fontWeight: 600 }}>
                Gestión interna
              </span>
            </span>
          </button>
        ) : (
          <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: TEXT_TENUE, fontWeight: 700 }}>Menú</span>
            <button onClick={() => setMenuAbierto(false)} aria-label="Cerrar el menú"
              style={{ width: 30, height: 30, borderRadius: 9, border: `1px solid ${BORDER}`, background: BG_APP, cursor: "pointer", display: "grid", placeItems: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TEXT_SUB} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
          {[{ id: "inicio", label: "Panel del día", icon: "inicio" }, ...TABS].map(t => {
            const activo = tab === t.id;
            const color = ACENTOS[t.id] || VINO;
            return (
              <button key={t.id} onClick={() => { setTab(t.id); setMenuAbierto(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 12px", marginBottom: 1, borderRadius: 11, border: "none", cursor: "pointer",
                  background: activo ? color : "transparent",
                  color: activo ? "#fff" : TEXT_MAIN, textAlign: "left",
                }}>
                <Icono nombre={t.icon} color={activo ? "#fff" : color} />
                <span style={{ fontSize: 14, fontWeight: activo ? 700 : 600 }}>{t.label}</span>
                {t.id === "pedidos" && pendientes > 0 && (
                  <span style={{ marginLeft: "auto", background: activo ? "#ffffff2e" : VINO, color: "#fff", borderRadius: 999, padding: "1px 8px", fontSize: 11.5, fontWeight: 800 }}>
                    {pendientes}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ padding: "12px 18px 16px", borderTop: `1px solid ${BORDER}` }}>
          <p style={{ margin: 0, fontSize: 11.5, color: TEXT_TENUE }}>Sesión de</p>
          <p style={{ margin: "1px 0 0", fontSize: 12.5, fontWeight: 700, color: TEXT_MAIN, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {auth.currentUser?.email || "—"}
          </p>
        </div>
      </nav>
    </div>
  );
}
