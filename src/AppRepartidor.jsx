import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { preparacionDe, totalesPedido } from "./pedidos.js";

const FORMAS_PAGO = ["Efectivo", "Bizum", "Transferencia", "Tarjeta"];

/**
 * PALETA — la misma que la tienda y la gestión (src/AppModerno.jsx).
 *
 * Esta pantalla se quedó atrás con el azul marino de la primera versión, y el
 * repartidor entraba por el acceso en crema para aterrizar en otra app. Todo el
 * color sale de aquí: son las mismas constantes, con los mismos nombres, que en
 * la gestión, para que al cambiar la marca se cambien las dos a la vez.
 */
const BG_APP     = "#fbf4e8";   // crema, el fondo de la tienda
const BG_CARD    = "#ffffff";   // papel
const BG_INPUT   = "#fbf4e8";   // crema, para que los campos no parezcan agujeros
const BORDER     = "#efe1c8";   // crema oscuro
const MARRON     = "#2a1200";   // marrón de la cabecera
const VINO       = "#8a1f1f";   // el acento de la marca
const ORO        = "#e8a317";   // dorado, solo para detalles
const TEXT_MAIN  = "#2b1a10";   // texto principal
const TEXT_SUB   = "#6f5a4a";   // texto secundario
const TEXT_TENUE = "#a8968a";   // etiquetas y apoyos
const SOBRE_MARRON = "#c3a98f"; // texto de apoyo sobre la cabecera
const VERDE      = "#1d7a3c";   // entregado y "guardado"
const TIPO       = "'Manrope', system-ui, sans-serif";
const TIPO_TIT   = "'Archivo', system-ui, sans-serif";

const ESTADOS = ["Pendiente", "Confirmado", "En ruta", "Entregado", "Cancelado"];
// Los mismos tonos que la gestión: sobre crema, los claros no se leen.
const ESTADO_COLORS = {
  Pendiente: "#bf7d08",
  Confirmado: "#3f5bb0",
  "En ruta": "#6b3fa0",
  Entregado: VERDE,
  Cancelado: "#b03a2e",
};

/** La marca, igual que en la cabecera de la gestión. */
function Marca({ pie }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
      <img src="/logo-donpepe.png" alt="" style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 10, background: BG_APP, flex: "none" }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: TIPO_TIT, fontWeight: 800, fontSize: 16, color: "#fff" }}>
          Don Pepe <span style={{ color: ORO }}>Sabor</span>
        </span>
        <span style={{ display: "block", fontSize: 9.5, letterSpacing: ".18em", textTransform: "uppercase", color: SOBRE_MARRON, fontWeight: 600 }}>
          {pie}
        </span>
      </span>
    </div>
  );
}

function BotonMaps({ direccion, cp }) {
  const [abierto, setAbierto] = useState(false);
  const addr = encodeURIComponent(`${direccion}${cp ? " " + cp : ""}`);
  const mapas = [
    { nombre: "Google Maps", emoji: "🗺️", url: `https://www.google.com/maps/search/?api=1&query=${addr}` },
    { nombre: "Waze",        emoji: "🚗", url: `https://waze.com/ul?q=${addr}&navigate=yes` },
    { nombre: "Apple Maps",  emoji: "🍎", url: `https://maps.apple.com/?q=${addr}` },
  ];
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setAbierto(a => !a)} style={{
        background: "none", border: "none", padding: 0, cursor: "pointer",
        color: VINO, fontSize: 14, fontWeight: 600, textAlign: "left", textDecoration: "underline",
        display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit"
      }}>
        📍 {direccion}{cp ? `, ${cp}` : ""}
      </button>
      {abierto && (
        <div style={{
          position: "absolute", top: 28, left: 0, zIndex: 100,
          background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 14,
          padding: 8, display: "flex", flexDirection: "column", gap: 4, minWidth: 180,
          boxShadow: "0 12px 34px rgba(42,18,0,.22)"
        }}>
          {mapas.map(m => (
            <a key={m.nombre} href={m.url} target="_blank" rel="noreferrer"
              onClick={() => setAbierto(false)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                color: TEXT_MAIN, textDecoration: "none", padding: "10px 14px",
                borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: "transparent",
              }}
              onMouseOver={e => e.currentTarget.style.background = BG_APP}
              onMouseOut={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontSize: 20 }}>{m.emoji}</span> {m.nombre}
            </a>
          ))}
          <button onClick={() => setAbierto(false)} style={{
            background: "none", border: "none", color: TEXT_TENUE, fontSize: 12,
            cursor: "pointer", padding: "4px 0", textAlign: "center", fontFamily: "inherit"
          }}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

/**
 * Las últimas 9 cifras de un teléfono, que es lo que identifica a un móvil
 * español. Así da igual cómo esté guardado y cómo lo escriba el repartidor:
 * "600111222", "600 111 222" y "+34 600 111 222" son el mismo número.
 *
 * Antes se comparaban las cifras enteras, y el propio campo pide el número
 * con el "+34" delante: quien hacía caso al ejemplo no entraba.
 */
const movil = (t) => String(t || "").replace(/\D/g, "").slice(-9);

function cargarLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

export default function AppRepartidor() {
  const [repartidores, setRepartidores] = useState(() => cargarLS("repartidores", []));
  const [pedidos, setPedidos] = useState(() => cargarLS("pedidos", []));
  const [repartidor, setRepartidor] = useState(null);
  const [seleccionado, setSeleccionado] = useState(null);
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState("");
  const [pedidoAbierto, setPedidoAbierto] = useState(null);
  const [cambiosPendientes, setCambiosPendientes] = useState({});
  const [guardado, setGuardado] = useState(false);
  const [vistaStats, setVistaStats] = useState(false);
  const [toastOk, setToastOk] = useState(false);
  const [cargando, setCargando] = useState(true);
  const cerrandoPedido = useRef(false);

  // Escuchar datos de Firebase en tiempo real
  useEffect(() => {
    const unsubRep = onSnapshot(doc(db, "datos", "repartidores"), (snap) => {
      if (snap.exists()) {
        const data = JSON.parse(snap.data().valor);
        setRepartidores(data);
        try { localStorage.setItem("repartidores", JSON.stringify(data)); } catch {}
      }
      setCargando(false);
    }, () => setCargando(false));

    const unsubPed = onSnapshot(doc(db, "datos", "pedidos"), (snap) => {
      if (snap.exists()) {
        const data = JSON.parse(snap.data().valor);
        setPedidos(data);
        if (pedidoAbierto && !cerrandoPedido.current) setPedidoAbierto(p => p ? (data.find(x => x.id === p.id) || p) : null);
        try { localStorage.setItem("pedidos", JSON.stringify(data)); } catch {}
      }
    });

    return () => { unsubRep(); unsubPed(); };
  }, []);

  const activos = repartidores.filter(r => !r.fijo && r.nombre);

  if (cargando) {
    return (
      <div style={{ minHeight: "100vh", background: BG_APP, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: TIPO }}>
        <img src="/logo-donpepe.png" alt="" style={{ width: 84, height: 84, objectFit: "contain", marginBottom: 14 }} />
        <p style={{ fontFamily: TIPO_TIT, color: MARRON, fontSize: 21, fontWeight: 800, margin: 0 }}>
          Don Pepe <span style={{ color: VINO }}>Sabor</span>
        </p>
        <p style={{ color: TEXT_SUB, fontSize: 13, marginTop: 8 }}>Conectando…</p>
      </div>
    );
  }

  const login = () => {
    const telInput = movil(telefono);
    const telGuardado = movil(seleccionado?.telefono);
    if (telInput.length === 9 && telInput === telGuardado) {
      setRepartidor(seleccionado);
      setError("");
    } else {
      setError("Número incorrecto. Inténtalo de nuevo.");
    }
  };

  const actualizarPedido = (id, cambios) => {
    const nuevos = pedidos.map(p => p.id === id ? { ...p, ...cambios } : p);
    setPedidos(nuevos);
    try { localStorage.setItem("pedidos", JSON.stringify(nuevos)); } catch {}
    setDoc(doc(db, "datos", "pedidos"), { valor: JSON.stringify(nuevos) }).catch(() => {});
    if (pedidoAbierto?.id === id) setPedidoAbierto(p => ({ ...p, ...cambios }));
  };

  const misPedidos = repartidor
    ? pedidos.filter(p => p.repartidorId === repartidor.id && p.estado !== "Cancelado")
    : [];

  const base = {
    minHeight: "100vh", background: BG_APP,
    fontFamily: TIPO, color: TEXT_MAIN,
  };
  const cabecera = {
    background: MARRON, padding: "12px 16px",
    boxShadow: "0 2px 14px rgba(42,18,0,.25)",
  };
  const tarjeta = {
    background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 14,
    padding: 18, marginBottom: 12, boxShadow: "0 1px 4px #0000000d",
  };
  const rotulo = {
    color: TEXT_TENUE, fontSize: 11, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: ".1em", margin: "0 0 10px",
  };

  // ── PANTALLA: BIENVENIDA / SELECCIÓN DE NOMBRE ───────────────────────────
  if (!repartidor) {
    return (
      <div style={base}>
        <div style={cabecera}>
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <Marca pie="Reparto" />
          </div>
        </div>

        <div style={{ padding: "28px 18px", maxWidth: 480, margin: "0 auto" }}>
          {!seleccionado ? (
          <>
            <p style={{ color: TEXT_SUB, fontSize: 14, marginBottom: 16 }}>Selecciona tu nombre para continuar</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activos.length === 0 ? (
                <p style={{ color: TEXT_SUB, textAlign: "center", fontSize: 14 }}>No hay repartidores registrados aún.</p>
              ) : activos.map(r => (
                <button key={r.id} onClick={() => { setSeleccionado(r); setError(""); setTelefono(""); }}
                  style={{
                    background: BG_CARD, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${VINO}`, borderRadius: 14,
                    padding: "18px 22px", cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 14,
                    boxShadow: "0 1px 4px #0000000d", textAlign: "left"
                  }}
                  onMouseOver={e => e.currentTarget.style.boxShadow = "0 6px 18px rgba(42,18,0,.14)"}
                  onMouseOut={e => e.currentTarget.style.boxShadow = "0 1px 4px #0000000d"}
                >
                  <span style={{ fontSize: 28 }}>🛵</span>
                  <span style={{ color: TEXT_MAIN, fontSize: 17, fontWeight: 700 }}>{r.nombre}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ width: "100%", maxWidth: 360 }}>
            <button onClick={() => { setSeleccionado(null); setError(""); setTelefono(""); }}
              style={{ background: "none", border: "none", color: TEXT_SUB, fontSize: 13, cursor: "pointer", marginBottom: 20, padding: 0, fontFamily: "inherit" }}>
              ← Volver
            </button>
            <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: 28, boxShadow: "0 18px 50px rgba(42,18,0,.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <span style={{ fontSize: 32 }}>🛵</span>
                <div>
                  <p style={{ color: TEXT_TENUE, fontSize: 11, margin: 0, textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700 }}>Hola,</p>
                  <p style={{ fontFamily: TIPO_TIT, color: MARRON, fontSize: 20, fontWeight: 800, margin: 0 }}>{seleccionado.nombre}</p>
                </div>
              </div>
              <label style={{ color: TEXT_SUB, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 8 }}>
                Confirma tu número de móvil
              </label>
              <input type="tel" inputMode="numeric" value={telefono}
                onChange={e => { setTelefono(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && login()}
                placeholder="+34 6XX XXX XXX" autoFocus
                style={{ width: "100%", background: BG_INPUT, border: `1.5px solid ${BORDER}`, borderRadius: 12, color: TEXT_MAIN, padding: "14px 16px", fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }}
              />
              {error && <p style={{ color: "#b3261e", fontSize: 13, fontWeight: 700, margin: "0 0 12px", textAlign: "center" }}>{error}</p>}
              <button onClick={login} style={{ width: "100%", background: VINO, color: "#fff", border: "none", borderRadius: 12, padding: "15px", fontFamily: TIPO_TIT, fontSize: 14, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", marginTop: 4, boxShadow: `0 4px 12px ${VINO}55` }}>
                Entrar
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    );
  }

  // ── DETALLE DE UN PEDIDO ──────────────────────────────────────────────────
  const confirmarCambios = () => {
    if (Object.keys(cambiosPendientes).length === 0) return;
    cerrandoPedido.current = true;
    actualizarPedido(pedidoAbierto.id, cambiosPendientes);
    setCambiosPendientes({});
    setPedidoAbierto(null);
    setGuardado(false);
    setToastOk(true);
    setTimeout(() => { setToastOk(false); cerrandoPedido.current = false; }, 2000);
  };

  if (pedidoAbierto) {
    const p = { ...pedidoAbierto, ...cambiosPendientes };
    const { servicio, total } = totalesPedido(p);

    return (
      <div style={base}>
        <div style={{ ...cabecera, display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => { setPedidoAbierto(null); setCambiosPendientes({}); setGuardado(false); }}
            style={{ width: 38, height: 38, borderRadius: 11, border: "1px solid #ffffff2e", background: "#ffffff1a", color: "#fff", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 0, flex: "none" }}>←</button>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontFamily: TIPO_TIT, fontWeight: 800, fontSize: 16, color: "#fff" }}>{p.nombre}</p>
            <p style={{ margin: 0, color: SOBRE_MARRON, fontSize: 9.5, letterSpacing: ".18em", textTransform: "uppercase", fontWeight: 600 }}>Detalle del pedido</p>
          </div>
        </div>

        <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
          <div style={tarjeta}>
            <p style={rotulo}>Cliente</p>
            <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: TEXT_MAIN }}>{p.nombre}</p>
            {p.telefono && <p style={{ margin: "0 0 4px", color: TEXT_SUB, fontSize: 14 }}>📞 {p.telefono}</p>}
            {p.direccion && <div style={{ margin: "0 0 4px" }}><BotonMaps direccion={p.direccion} cp={p.cp} /></div>}
            {p.rangoHorario && <p style={{ margin: "0 0 4px", color: TEXT_SUB, fontSize: 14 }}>🕐 {p.rangoHorario}</p>}
            <p style={{ margin: 0, color: TEXT_SUB, fontSize: 14 }}>📅 {p.fecha}</p>
          </div>

          <div style={tarjeta}>
            <p style={rotulo}>Productos</p>
            {p.items?.map((it, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < p.items.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <span style={{ color: TEXT_MAIN, fontSize: 14 }}>{it.cantidad}× {it.nombreProducto} · {it.presentacion}
                  {preparacionDe(it) === "Frito" && <span style={{ color: "#bf7d08", fontSize: 12, fontWeight: 700 }}> · Fritos</span>}
                </span>
                <span style={{ color: TEXT_MAIN, fontSize: 14, fontWeight: 600 }}>{(it.subtotal || 0).toFixed(2)}€</span>
              </div>
            ))}
            {servicio > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                <span style={{ color: TEXT_SUB, fontSize: 14 }}>🔥 Fritura</span>
                <span style={{ color: TEXT_SUB, fontSize: 14 }}>{servicio.toFixed(2)}€</span>
              </div>
            )}
            {p.envio > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0" }}>
                <span style={{ color: TEXT_SUB, fontSize: 14 }}>🚚 Envío</span>
                <span style={{ color: TEXT_SUB, fontSize: 14 }}>{parseFloat(p.envio).toFixed(2)}€</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", marginTop: 6, borderTop: `1px solid ${BORDER}` }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: TEXT_MAIN }}>Total</span>
              <span style={{ fontFamily: TIPO_TIT, color: VINO, fontWeight: 800, fontSize: 19 }}>{total.toFixed(2)}€</span>
            </div>
          </div>

          <div style={{ ...tarjeta, marginBottom: 0 }}>
            <p style={{ ...rotulo, margin: "0 0 14px" }}>Actualizar pedido</p>
            {pedidoAbierto.estado !== "Entregado" && (
              <>
                <label style={{ color: TEXT_SUB, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Estado del reparto</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                  {ESTADOS.map(e => (
                    <button key={e} onClick={() => setCambiosPendientes(c => ({ ...c, estado: e }))}
                      style={{ padding: "9px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                        background: p.estado === e ? ESTADO_COLORS[e] : BG_CARD,
                        color: p.estado === e ? "#fff" : TEXT_SUB,
                        border: p.estado === e ? `1.5px solid ${ESTADO_COLORS[e]}` : `1px solid ${BORDER}`,
                      }}>{e}</button>
                  ))}
                </div>
              </>
            )}
            <label style={{ color: TEXT_SUB, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Forma de pago</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {FORMAS_PAGO.map(f => (
                <button key={f} onClick={() => setCambiosPendientes(c => ({ ...c, formaPago: f }))}
                  style={{ padding: "9px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    background: p.formaPago === f ? VINO : BG_CARD,
                    color: p.formaPago === f ? "#fff" : TEXT_SUB,
                    border: p.formaPago === f ? `1.5px solid ${VINO}` : `1px solid ${BORDER}`,
                  }}>{f}</button>
              ))}
            </div>
            <button onClick={confirmarCambios} disabled={Object.keys(cambiosPendientes).length === 0}
              style={{ width: "100%", padding: "15px", borderRadius: 12, fontFamily: TIPO_TIT, fontSize: 14, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase",
                cursor: Object.keys(cambiosPendientes).length === 0 ? "not-allowed" : "pointer", border: "none",
                background: guardado ? VERDE : Object.keys(cambiosPendientes).length === 0 ? BORDER : VINO,
                color: Object.keys(cambiosPendientes).length === 0 ? TEXT_SUB : "#fff",
                transition: "background .3s",
              }}>
              {guardado ? "✓ Guardado" : "Confirmar y guardar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── LISTA DE PEDIDOS / ESTADÍSTICAS ─────────────────────────────────────
  const entregados = pedidos.filter(p => p.repartidorId === repartidor.id && p.estado === "Entregado");
  const porDia = entregados.reduce((acc, p) => {
    const dia = p.fecha || "Sin fecha";
    acc[dia] = (acc[dia] || []);
    acc[dia].push(p);
    return acc;
  }, {});
  const diasOrdenados = Object.keys(porDia).sort((a, b) => b.localeCompare(a));

  return (
    <div style={base}>
      {toastOk && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: VERDE, color: "#fff", borderRadius: 12, padding: "12px 24px", fontWeight: 700, fontSize: 15, zIndex: 999, boxShadow: "0 4px 20px rgba(42,18,0,.3)" }}>✓ Cambios guardados</div>
      )}

      <div style={{ ...cabecera, position: "sticky", top: 0, zIndex: 60 }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <Marca pie={`${repartidor.nombre} · ${misPedidos.length} pedido${misPedidos.length !== 1 ? "s" : ""}`} />
          <button onClick={() => { setRepartidor(null); setSeleccionado(null); setTelefono(""); }}
            style={{ background: "#ffffff1a", border: "1px solid #ffffff2e", color: "#fff", borderRadius: 10, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600, fontFamily: "inherit", flex: "none" }}>
            Salir
          </button>
        </div>
        <div style={{ maxWidth: 480, margin: "10px auto 0", display: "flex", gap: 8 }}>
          {["Pedidos", "Estadísticas"].map(t => {
            const activo = (t === "Estadísticas") === vistaStats;
            return (
              <button key={t} onClick={() => setVistaStats(t === "Estadísticas")}
                style={{ flex: 1, padding: "9px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  background: activo ? "#ffffff1a" : "transparent",
                  color: activo ? "#fff" : SOBRE_MARRON,
                  border: "none", borderBottom: activo ? `2px solid ${ORO}` : "2px solid transparent",
                }}>{t}</button>
            );
          })}
        </div>
      </div>

      {vistaStats ? (
        <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
          <div style={{ ...tarjeta, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ ...rotulo, margin: 0 }}>Total entregados</p>
              <p style={{ margin: "4px 0 0", fontFamily: TIPO_TIT, color: VINO, fontSize: 32, fontWeight: 800 }}>{entregados.length}</p>
            </div>
            <span style={{ fontSize: 40 }}>📦</span>
          </div>
          {diasOrdenados.length === 0 ? (
            <p style={{ color: TEXT_SUB, textAlign: "center", marginTop: 40 }}>Sin entregas registradas aún</p>
          ) : diasOrdenados.map(dia => (
            <div key={dia} style={{ ...tarjeta, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: TEXT_MAIN }}>📅 {dia}</p>
                <span style={{ background: `${VERDE}1a`, color: VERDE, border: `1px solid ${VERDE}44`, borderRadius: 20, padding: "3px 12px", fontSize: 13, fontWeight: 700 }}>
                  {porDia[dia].length} entrega{porDia[dia].length !== 1 ? "s" : ""}
                </span>
              </div>
              {porDia[dia].map(p => {
                const total = totalesPedido(p).total;
                return (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${BORDER}` }}>
                    <span style={{ color: TEXT_SUB, fontSize: 14 }}>{p.nombre}</span>
                    <span style={{ color: TEXT_MAIN, fontWeight: 700, fontSize: 14 }}>{total.toFixed(2)}€</span>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
                <span style={{ color: TEXT_SUB, fontSize: 13, fontWeight: 700 }}>Total del día</span>
                <span style={{ fontFamily: TIPO_TIT, color: VINO, fontWeight: 800, fontSize: 15 }}>
                  {porDia[dia].reduce((s, p) => s + totalesPedido(p).total, 0).toFixed(2)}€
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
        {misPedidos.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <p style={{ fontSize: 48, margin: "0 0 12px" }}>📭</p>
            <p style={{ fontSize: 15, color: TEXT_SUB }}>No tienes pedidos asignados</p>
          </div>
        ) : misPedidos.map(p => {
          const total = totalesPedido(p).total;
          const color = ESTADO_COLORS[p.estado] || TEXT_SUB;
          return (
            <button key={p.id} onClick={() => { setPedidoAbierto(p); setCambiosPendientes({}); setGuardado(false); }}
              style={{ width: "100%", background: BG_CARD, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${color}`,
                borderRadius: 14, padding: 18, marginBottom: 10, cursor: "pointer", textAlign: "left", display: "block",
                boxShadow: "0 1px 4px #0000000d", fontFamily: "inherit" }}
              onMouseOver={e => e.currentTarget.style.boxShadow = "0 6px 18px rgba(42,18,0,.14)"}
              onMouseOut={e => e.currentTarget.style.boxShadow = "0 1px 4px #0000000d"}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: TEXT_MAIN }}>{p.nombre}</p>
                  {p.direccion && <div style={{ marginTop: 3 }}><BotonMaps direccion={p.direccion} cp={p.cp} /></div>}
                </div>
                <span style={{ background: `${color}1a`, color, border: `1px solid ${color}44`, borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", marginLeft: 8 }}>{p.estado}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 12 }}>
                  {p.rangoHorario && <span style={{ color: TEXT_SUB, fontSize: 12 }}>🕐 {p.rangoHorario}</span>}
                  <span style={{ color: TEXT_SUB, fontSize: 12 }}>💳 {p.formaPago}</span>
                </div>
                <span style={{ fontFamily: TIPO_TIT, color: VINO, fontWeight: 800, fontSize: 17 }}>{total.toFixed(2)}€</span>
              </div>
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}
