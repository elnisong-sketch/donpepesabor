import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { preparacionDe, totalesPedido } from "./pedidos.js";

const FORMAS_PAGO = ["Efectivo", "Bizum", "Transferencia", "Tarjeta"];

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
        color: "#60a5fa", fontSize: 14, textAlign: "left", textDecoration: "underline",
        display: "flex", alignItems: "center", gap: 4
      }}>
        📍 {direccion}{cp ? `, ${cp}` : ""}
      </button>
      {abierto && (
        <div style={{
          position: "absolute", top: 28, left: 0, zIndex: 100,
          background: "#1c1c28", border: "1px solid #2a2a3a", borderRadius: 14,
          padding: 8, display: "flex", flexDirection: "column", gap: 4, minWidth: 180,
          boxShadow: "0 8px 24px #00000088"
        }}>
          {mapas.map(m => (
            <a key={m.nombre} href={m.url} target="_blank" rel="noreferrer"
              onClick={() => setAbierto(false)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                color: "#e8e8f0", textDecoration: "none", padding: "10px 14px",
                borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: "transparent",
              }}
              onMouseOver={e => e.currentTarget.style.background = "#2a2a3a"}
              onMouseOut={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontSize: 20 }}>{m.emoji}</span> {m.nombre}
            </a>
          ))}
          <button onClick={() => setAbierto(false)} style={{
            background: "none", border: "none", color: "#444", fontSize: 12,
            cursor: "pointer", padding: "4px 0", textAlign: "center"
          }}>Cancelar</button>
        </div>
      )}
    </div>
  );
}
const ESTADOS = ["Pendiente", "Confirmado", "En ruta", "Entregado", "Cancelado"];
const ESTADO_COLORS = {
  Pendiente: "#f59e0b",
  Confirmado: "#3b82f6",
  "En ruta": "#8b5cf6",
  Entregado: "#10b981",
  Cancelado: "#ef4444",
};

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
      <div style={{ minHeight: "100vh", background: "#f0f4f8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>👨‍🍳</div>
        <p style={{ color: "#1e3a5f", fontSize: 18, fontWeight: 700, margin: 0 }}>ELNISONG</p>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>Conectando...</p>
      </div>
    );
  }

  const login = () => {
    const telInput = telefono.replace(/\D/g, "");
    const telGuardado = seleccionado?.telefono?.replace(/\D/g, "") || "";
    if (telInput && telGuardado && telInput === telGuardado) {
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

  // ── PALETA (igual que AppModerno) ────────────────────────────────────────
  const NAVY    = "#1e3a5f";
  const ORANGE  = "#f97316";
  const BG_APP  = "#f0f4f8";
  const BG_CARD = "#ffffff";
  const BG_INPUT= "#f8fafc";
  const BORDER  = "#e2e8f0";
  const TEXT_MAIN="#1e293b";
  const TEXT_SUB = "#64748b";

  const base = {
    minHeight: "100vh", background: BG_APP,
    fontFamily: "'Inter', system-ui, sans-serif", color: TEXT_MAIN,
  };

  // ── PANTALLA: BIENVENIDA / SELECCIÓN DE NOMBRE ───────────────────────────
  if (!repartidor) {
    return (
      <div style={{ ...base }}>
        {/* Header igual que app principal */}
        <div style={{ background: NAVY, padding: "14px 20px", boxShadow: "0 2px 12px #0003" }}>
          <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ color: "#fff", margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>👨‍🍳 ELNISONG</h1>
            <span style={{ background: "#ffffff22", borderRadius: 10, color: "#94b4d4", padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>🛵 Repartidores</span>
          </div>
        </div>

        <div style={{ padding: "32px 20px", maxWidth: 480, margin: "0 auto" }}>
          {!seleccionado ? (
          <>
            <p style={{ color: TEXT_SUB, fontSize: 14, marginBottom: 16 }}>Selecciona tu nombre para continuar</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activos.length === 0 ? (
                <p style={{ color: TEXT_SUB, textAlign: "center", fontSize: 14 }}>No hay repartidores registrados aún.</p>
              ) : activos.map(r => (
                <button key={r.id} onClick={() => { setSeleccionado(r); setError(""); setTelefono(""); }}
                  style={{
                    background: BG_CARD, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${ORANGE}`, borderRadius: 16,
                    padding: "18px 22px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 14,
                    boxShadow: "0 2px 8px #0001", textAlign: "left"
                  }}
                  onMouseOver={e => e.currentTarget.style.boxShadow = `0 4px 16px ${ORANGE}22`}
                  onMouseOut={e => e.currentTarget.style.boxShadow = "0 2px 8px #0001"}
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
              style={{ background: "none", border: "none", color: TEXT_SUB, fontSize: 13, cursor: "pointer", marginBottom: 20, padding: 0 }}>
              ← Volver
            </button>
            <div style={{ background: BG_CARD, border: `2px solid ${ORANGE}44`, borderRadius: 20, padding: 28, boxShadow: "0 4px 20px #0001" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <span style={{ fontSize: 32 }}>🛵</span>
                <div>
                  <p style={{ color: TEXT_SUB, fontSize: 11, margin: 0, textTransform: "uppercase" }}>Hola,</p>
                  <p style={{ color: NAVY, fontSize: 20, fontWeight: 800, margin: 0 }}>{seleccionado.nombre}</p>
                </div>
              </div>
              <label style={{ color: TEXT_SUB, fontSize: 12, fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: 8 }}>
                Confirma tu número de móvil
              </label>
              <input type="tel" inputMode="numeric" value={telefono}
                onChange={e => { setTelefono(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && login()}
                placeholder="+34 6XX XXX XXX" autoFocus
                style={{ width: "100%", background: BG_INPUT, border: `1.5px solid ${BORDER}`, borderRadius: 12, color: TEXT_MAIN, padding: "14px 16px", fontSize: 16, outline: "none", boxSizing: "border-box", marginBottom: 8 }}
              />
              {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 12px", textAlign: "center" }}>{error}</p>}
              <button onClick={login} style={{ width: "100%", background: ORANGE, color: "#fff", border: "none", borderRadius: 12, padding: "15px", fontSize: 16, fontWeight: 800, cursor: "pointer", marginTop: 4 }}>
                Entrar →
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
        <div style={{ background: NAVY, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => { setPedidoAbierto(null); setCambiosPendientes({}); setGuardado(false); }} style={{ background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 0 }}>←</button>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: "#fff" }}>{p.nombre}</p>
            <p style={{ margin: 0, color: "#94b4d4", fontSize: 12 }}>Detalle del pedido</p>
          </div>
        </div>

        <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
          <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18, marginBottom: 12 }}>
            <p style={{ color: TEXT_SUB, fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: "0 0 10px" }}>Cliente</p>
            <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: TEXT_MAIN }}>{p.nombre}</p>
            {p.telefono && <p style={{ margin: "0 0 4px", color: TEXT_SUB, fontSize: 14 }}>📞 {p.telefono}</p>}
            {p.direccion && <div style={{ margin: "0 0 4px" }}><BotonMaps direccion={p.direccion} cp={p.cp} /></div>}
            {p.rangoHorario && <p style={{ margin: "0 0 4px", color: TEXT_SUB, fontSize: 14 }}>🕐 {p.rangoHorario}</p>}
            <p style={{ margin: 0, color: TEXT_SUB, fontSize: 14 }}>📅 {p.fecha}</p>
          </div>

          <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18, marginBottom: 12 }}>
            <p style={{ color: TEXT_SUB, fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: "0 0 10px" }}>Productos</p>
            {p.items?.map((it, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < p.items.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <span style={{ color: TEXT_MAIN, fontSize: 14 }}>{it.cantidad}× {it.nombreProducto} · {it.presentacion}
                  {preparacionDe(it) === "Frito" && <span style={{ color: "#f59e0b", fontSize: 12 }}> · Fritos</span>}
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
              <span style={{ color: ORANGE, fontWeight: 800, fontSize: 18 }}>{total.toFixed(2)}€</span>
            </div>
          </div>

          <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18 }}>
            <p style={{ color: TEXT_SUB, fontSize: 11, fontWeight: 700, textTransform: "uppercase", margin: "0 0 14px" }}>Actualizar pedido</p>
            {pedidoAbierto.estado !== "Entregado" && (
              <>
                <label style={{ color: TEXT_SUB, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Estado del reparto</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                  {ESTADOS.map(e => (
                    <button key={e} onClick={() => setCambiosPendientes(c => ({ ...c, estado: e }))}
                      style={{ padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                        background: p.estado === e ? ESTADO_COLORS[e] + "22" : BG_INPUT,
                        color: p.estado === e ? ESTADO_COLORS[e] : TEXT_SUB,
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
                  style={{ padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    background: p.formaPago === f ? ORANGE + "22" : BG_INPUT,
                    color: p.formaPago === f ? ORANGE : TEXT_SUB,
                    border: p.formaPago === f ? `1.5px solid ${ORANGE}` : `1px solid ${BORDER}`,
                  }}>{f}</button>
              ))}
            </div>
            <button onClick={confirmarCambios} disabled={Object.keys(cambiosPendientes).length === 0}
              style={{ width: "100%", padding: "15px", borderRadius: 12, fontSize: 16, fontWeight: 800,
                cursor: Object.keys(cambiosPendientes).length === 0 ? "not-allowed" : "pointer", border: "none",
                background: guardado ? "#10b981" : Object.keys(cambiosPendientes).length === 0 ? BORDER : ORANGE,
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
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#10b981", color: "#fff", borderRadius: 12, padding: "12px 24px", fontWeight: 700, fontSize: 15, zIndex: 999, boxShadow: "0 4px 20px #00000033" }}>✓ Cambios guardados</div>
      )}

      <div style={{ background: NAVY, padding: "16px 20px", boxShadow: "0 2px 12px #0003" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ margin: 0, color: "#fff", fontWeight: 800, fontSize: 16 }}>🛵 {repartidor.nombre}</p>
            <p style={{ margin: 0, color: "#94b4d4", fontSize: 12 }}>{misPedidos.length} pedido{misPedidos.length !== 1 ? "s" : ""} asignado{misPedidos.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={() => { setRepartidor(null); setSeleccionado(null); setTelefono(""); }}
            style={{ background: "#ffffff22", border: "none", color: "#fff", borderRadius: 10, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
            Salir
          </button>
        </div>
        <div style={{ maxWidth: 480, margin: "10px auto 0", display: "flex", gap: 8 }}>
          {["Pedidos", "Estadísticas"].map(t => (
            <button key={t} onClick={() => setVistaStats(t === "Estadísticas")}
              style={{ flex: 1, padding: "9px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                background: (t === "Estadísticas") === vistaStats ? "#ffffff22" : "transparent",
                color: (t === "Estadísticas") === vistaStats ? "#fff" : "#94b4d4",
                border: "none", borderBottom: (t === "Estadísticas") === vistaStats ? `2px solid ${ORANGE}` : "2px solid transparent",
              }}>{t}</button>
          ))}
        </div>
      </div>

      {vistaStats ? (
        <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
          <div style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, color: TEXT_SUB, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Total entregados</p>
              <p style={{ margin: "4px 0 0", color: ORANGE, fontSize: 32, fontWeight: 900 }}>{entregados.length}</p>
            </div>
            <span style={{ fontSize: 40 }}>📦</span>
          </div>
          {diasOrdenados.length === 0 ? (
            <p style={{ color: TEXT_SUB, textAlign: "center", marginTop: 40 }}>Sin entregas registradas aún</p>
          ) : diasOrdenados.map(dia => (
            <div key={dia} style={{ background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: TEXT_MAIN }}>📅 {dia}</p>
                <span style={{ background: "#10b98122", color: "#10b981", border: "1px solid #10b98144", borderRadius: 20, padding: "3px 12px", fontSize: 13, fontWeight: 700 }}>
                  {porDia[dia].length} entrega{porDia[dia].length !== 1 ? "s" : ""}
                </span>
              </div>
              {porDia[dia].map(p => {
                const total = totalesPedido(p).total;
                return (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${BORDER}` }}>
                    <span style={{ color: TEXT_SUB, fontSize: 14 }}>{p.nombre}</span>
                    <span style={{ color: ORANGE, fontWeight: 700, fontSize: 14 }}>{total.toFixed(2)}€</span>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
                <span style={{ color: TEXT_SUB, fontSize: 13, fontWeight: 700 }}>Total del día</span>
                <span style={{ color: ORANGE, fontWeight: 800, fontSize: 15 }}>
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
          const color = ESTADO_COLORS[p.estado] || "#888";
          return (
            <button key={p.id} onClick={() => { setPedidoAbierto(p); setCambiosPendientes({}); setGuardado(false); }}
              style={{ width: "100%", background: BG_CARD, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${color}`,
                borderRadius: 16, padding: 18, marginBottom: 10, cursor: "pointer", textAlign: "left", display: "block", boxShadow: "0 1px 4px #0001" }}
              onMouseOver={e => e.currentTarget.style.boxShadow = `0 4px 16px ${color}22`}
              onMouseOut={e => e.currentTarget.style.boxShadow = "0 1px 4px #0001"}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: TEXT_MAIN }}>{p.nombre}</p>
                  {p.direccion && <div style={{ marginTop: 3 }}><BotonMaps direccion={p.direccion} cp={p.cp} /></div>}
                </div>
                <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", marginLeft: 8 }}>{p.estado}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 12 }}>
                  {p.rangoHorario && <span style={{ color: TEXT_SUB, fontSize: 12 }}>🕐 {p.rangoHorario}</span>}
                  <span style={{ color: TEXT_SUB, fontSize: 12 }}>💳 {p.formaPago}</span>
                </div>
                <span style={{ color: ORANGE, fontWeight: 800, fontSize: 16 }}>{total.toFixed(2)}€</span>
              </div>
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}
