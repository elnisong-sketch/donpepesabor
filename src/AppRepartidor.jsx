import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { preparacionDe, totalesPedido, fechaLegible, DIRECCION_LOCAL } from "./pedidos.js";
import { HORA_INICIO } from "./franjas.js";
import { optimizar, hhmm, MARGEN_POR_DEFECTO, MINUTOS_EN_PUERTA } from "./ruta.js";

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

/* ── LA RUTA DEL DÍA ────────────────────────────────────────────────────────
 *
 * El repartidor tenía sus pedidos pero no tenía por dónde empezar: un botón por
 * dirección, de una en una, y él decidiendo el recorrido sobre la marcha. Esto
 * le da el día entero en orden, un enlace que abre Maps con todas las paradas
 * seguidas y una hoja imprimible para cuando el móvil se queda sin batería a
 * mitad de reparto, que es el día en que de verdad hace falta.
 */

/** "YYYY-MM-DD" de hoy en hora local. En UTC, a las 23:00 ya sería mañana. */
function hoyISO() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/**
 * El criterio de la casa para ordenar días de reparto: hoy primero, después lo
 * que viene en orden, y al final los atrasados, del más reciente al más viejo.
 *
 * Un pedido de ayer sin entregar no se esconde —hay que verlo— pero tampoco se
 * pone por delante del reparto de hoy, que es lo que hay que sacar ahora.
 */
function compararDias(a, b) {
  const hoy = hoyISO();
  const grupo = (f) => (!f ? 2 : f >= hoy ? 0 : 1);
  if (grupo(a) !== grupo(b)) return grupo(a) - grupo(b);
  if (grupo(a) === 1) return String(b).localeCompare(String(a));
  return String(a).localeCompare(String(b));
}

const ordenarDias = (dias) => [...dias].sort(compararDias);

/**
 * El minuto en que empieza la franja de un pedido: "16:00 a 18:00" → 960.
 *
 * Sin hora reconocible —"Cualquier hora", o vacío— devuelve null, y esos van al
 * final: son justamente los que se pueden encajar donde cuadre.
 */
function minutoFranja(rangoHorario) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(rangoHorario || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** La dirección tal como la entiende un mapa. */
const direccionDe = (p) => `${p.direccion}${p.cp ? ", " + p.cp : ""}`;

/**
 * El orden sencillo, el que no necesita ni red ni mapas: primero la franja, y
 * dentro de cada franja por código postal, que en Madrid va por zonas y agrupa
 * el barrio. A igual código, lo más cerca de la tienda primero.
 *
 * No es el recorrido más corto —de eso se encarga `optimizar` en ruta.js— pero
 * es un orden defendible, sale al instante y es lo que se enseña mientras no se
 * haya calculado el bueno, o si no hay cobertura para calcularlo.
 */
function ordenarRuta(paradas) {
  const cpNum = (p) => Number(String(p.cp || "").replace(/\D/g, "")) || 0;
  return [...paradas].sort((a, b) => {
    const ha = minutoFranja(a.rangoHorario) ?? Infinity;
    const hb = minutoFranja(b.rangoHorario) ?? Infinity;
    if (ha !== hb) return ha - hb;
    if (cpNum(a) !== cpNum(b)) return cpNum(a) - cpNum(b);
    // Sin km (los pedidos metidos a mano no los traen) se van al final del grupo.
    return (a.km ?? 999) - (b.km ?? 999);
  });
}

/**
 * Cómo se cuenta un retraso sobre la franja, para pintarlo y para escribirlo.
 * Dentro del margen es un aviso; pasado el margen, un problema de verdad.
 *
 * Solo hay retrasos: antes de que abra la franja no se entrega nunca, se espera
 * (ver `llegarA` en ruta.js).
 */
function avisoDesvio(retraso, margen) {
  if (!retraso || retraso <= 0) return null;
  return { grave: retraso > margen, texto: `${retraso} min tarde` };
}

/**
 * La ruta partida en tramos que Google Maps pueda abrir de una vez.
 *
 * Maps admite un origen, un destino y nueve paradas intermedias: diez entregas
 * por enlace. Si hay más, cada tramo arranca donde terminó el anterior, para no
 * mandar al repartidor otra vez a la tienda a mitad de reparto.
 */
const PARADAS_POR_TRAMO = 10;

function tramosDeRuta(paradas) {
  const tramos = [];
  for (let i = 0; i < paradas.length; i += PARADAS_POR_TRAMO) {
    const grupo = paradas.slice(i, i + PARADAS_POR_TRAMO);
    const origen = i === 0 ? DIRECCION_LOCAL : direccionDe(paradas[i - 1]);
    const intermedias = grupo.slice(0, -1).map(direccionDe);
    let url = "https://www.google.com/maps/dir/?api=1&travelmode=driving"
      + `&origin=${encodeURIComponent(origen)}`
      + `&destination=${encodeURIComponent(direccionDe(grupo[grupo.length - 1]))}`;
    if (intermedias.length) url += `&waypoints=${intermedias.map(encodeURIComponent).join("|")}`;
    tramos.push({ url, desde: i + 1, hasta: i + grupo.length });
  }
  return tramos;
}

const eur = (n) => (n || 0).toFixed(2) + "€";

/**
 * La hoja de ruta en papel: negro sobre blanco, sin logo y sin color, con una
 * casilla por parada para ir tachando. Solo existe al imprimir.
 */
function HojaRuta({ repartidor, dia, entradas, margen }) {
  const pedidos = entradas.map(e => e.pedido);
  const total = pedidos.reduce((s, p) => s + totalesPedido(p).total, 0);
  const efectivo = pedidos
    .filter(p => p.formaPago === "Efectivo")
    .reduce((s, p) => s + totalesPedido(p).total, 0);

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #hoja-ruta, #hoja-ruta * { visibility: visible !important; }
          #hoja-ruta { position: absolute; left: 0; top: 0; width: 100%; }
          #hoja-ruta tr { page-break-inside: avoid; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
      <div id="hoja-ruta" style={{
        display: "none", background: "#fff", color: "#000",
        fontFamily: "'Manrope', Arial, sans-serif", fontSize: 11.5,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #000", paddingBottom: 6, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>HOJA DE RUTA</div>
            <div style={{ fontSize: 12 }}>{repartidor} · {fechaLegible(dia)}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11 }}>
            <div>{entradas.length} parada{entradas.length !== 1 ? "s" : ""}</div>
            <div>Salida: {DIRECCION_LOCAL}</div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #000", textAlign: "left", fontSize: 10 }}>
              <th style={{ padding: "4px 3px", width: 22 }}>✓</th>
              <th style={{ padding: "4px 3px", width: 18 }}>Nº</th>
              <th style={{ padding: "4px 3px", width: 96 }}>Franja / llegada</th>
              <th style={{ padding: "4px 3px" }}>Cliente y dirección</th>
              <th style={{ padding: "4px 3px", width: 150 }}>Pedido</th>
              <th style={{ padding: "4px 3px", width: 90, textAlign: "right" }}>Cobrar</th>
            </tr>
          </thead>
          <tbody>
            {entradas.map(({ pedido: p, llegada, desvio }, i) => {
              const aviso = avisoDesvio(desvio, margen);
              return (
              <tr key={p.id} style={{ borderBottom: "1px solid #bbb", verticalAlign: "top" }}>
                <td style={{ padding: "7px 3px" }}>
                  <span style={{ display: "inline-block", width: 13, height: 13, border: "1px solid #000" }} />
                </td>
                <td style={{ padding: "7px 3px", fontWeight: 800 }}>{i + 1}</td>
                <td style={{ padding: "7px 3px" }}>
                  <div>{p.rangoHorario || "Sin hora"}</div>
                  {llegada != null && (
                    <div style={{ fontSize: 10.5, fontWeight: aviso ? 800 : 400 }}>
                      ~{hhmm(llegada)}{aviso ? ` (${aviso.texto})` : ""}
                    </div>
                  )}
                </td>
                <td style={{ padding: "7px 3px" }}>
                  <div style={{ fontWeight: 700 }}>{p.nombre}</div>
                  <div>{direccionDe(p)}</div>
                  {p.telefono && <div>Tel. {p.telefono}</div>}
                  {(p.nota || p.notas) && <div style={{ fontStyle: "italic" }}>Nota: {p.nota || p.notas}</div>}
                </td>
                <td style={{ padding: "7px 3px", fontSize: 10.5 }}>
                  {(p.items || []).map((it, j) => (
                    <div key={j}>{it.cantidad}× {it.nombreProducto}</div>
                  ))}
                </td>
                <td style={{ padding: "7px 3px", textAlign: "right" }}>
                  <div style={{ fontWeight: 800 }}>{eur(totalesPedido(p).total)}</div>
                  <div style={{ fontSize: 10 }}>{p.formaPago || "—"}</div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginTop: 10, paddingTop: 6, borderTop: "2px solid #000", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span>Total de la ruta: <b>{eur(total)}</b></span>
          <span>A cobrar en efectivo: <b>{eur(efectivo)}</b></span>
        </div>
      </div>
    </>
  );
}

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
  const [vista, setVista] = useState("Pedidos");
  const [diaRuta, setDiaRuta] = useState(null);
  const [salidaMin, setSalidaMin] = useState(null);   // null = la hora que toque
  const [margen, setMargen] = useState(MARGEN_POR_DEFECTO);
  const [optimo, setOptimo] = useState(null);         // el recorrido ya calculado
  const [calculando, setCalculando] = useState(null); // { hechas, total } mientras busca
  const [errorRuta, setErrorRuta] = useState("");
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

  /**
   * Los pedidos del repartidor, por día de entrega: hoy arriba, después los que
   * vienen, y al final los atrasados. Dentro de cada día, por franja.
   *
   * Antes salían en el orden en que estaban guardados, que no es ningún orden:
   * lo primero de la lista podía ser de la semana pasada.
   */
  const misPedidos = repartidor
    ? pedidos
        .filter(p => p.repartidorId === repartidor.id && p.estado !== "Cancelado")
        .sort((a, b) =>
          compararDias(a.fecha, b.fecha)
          || (minutoFranja(a.rangoHorario) ?? Infinity) - (minutoFranja(b.rangoHorario) ?? Infinity))
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
            {/* El comentario del cliente: el piso, el timbre, que es un regalo.
                Es justo lo que hace falta saber delante del portal. */}
            {(p.nota || p.notas) && (
              <p style={{ margin: "10px 0 0", padding: "9px 12px", background: BG_APP, borderRadius: 10,
                border: `1px solid ${BORDER}`, color: TEXT_MAIN, fontSize: 14, lineHeight: 1.45 }}>
                📝 {p.nota || p.notas}
              </p>
            )}
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

  // ── La ruta: solo lo que queda por entregar, y solo a domicilio ──────────
  // Una recogida no es una parada: el cliente viene a la tienda. Los pedidos
  // viejos no traen `tipoEntrega`, así que vale cualquiera que tenga dirección.
  const pendientes = misPedidos.filter(p => p.estado !== "Entregado");
  const paraRepartir = pendientes.filter(p => p.direccion && p.tipoEntrega !== "Recogida");
  const diasConRuta = ordenarDias([...new Set(paraRepartir.map(p => p.fecha).filter(Boolean))]);
  // Hoy por defecto; si hoy no hay nada, el primero de la lista, que ya viene
  // ordenada desde hoy: así no parece que no hay ruta cuando es para mañana.
  const diaElegido = diaRuta
    || (diasConRuta.includes(hoyISO()) ? hoyISO() : diasConRuta[0])
    || hoyISO();

  const delDia = paraRepartir.filter(p => p.fecha === diaElegido);
  const recogidasDelDia = pendientes.filter(p => p.tipoEntrega === "Recogida" && p.fecha === diaElegido).length;

  /**
   * A qué hora sale de la tienda. Si la ruta es de hoy, ahora mismo (redondeado
   * al múltiplo de cinco de arriba); si es de otro día, a la hora de abrir. Y en
   * cuanto el repartidor lo cambie a mano, manda lo que él diga.
   */
  const ahora = new Date().getHours() * 60 + new Date().getMinutes();
  const salida = salidaMin ?? (diaElegido === hoyISO()
    ? Math.max(HORA_INICIO * 60, Math.ceil(ahora / 5) * 5)
    : HORA_INICIO * 60);

  /**
   * El recorrido calculado solo vale para lo que se calculó: si cambia el día,
   * la hora de salida, el margen o la propia lista de pedidos, deja de servir y
   * se vuelve al orden sencillo hasta que se calcule otra vez.
   */
  const alDia = optimo
    && optimo.dia === diaElegido
    && optimo.salida === salida
    && optimo.margen === margen
    && optimo.ids === delDia.map(p => p.id).sort().join(",");

  const ruta = alDia
    ? [...optimo.paradas, ...optimo.sinSituar.map(p => ({ pedido: p, llegada: null, desvio: 0 }))]
    : ordenarRuta(delDia).map(p => ({ pedido: p, llegada: null, desvio: 0 }));

  const tramos = tramosDeRuta(ruta.map(r => r.pedido));
  const totalRuta = delDia.reduce((s, p) => s + totalesPedido(p).total, 0);
  const efectivoRuta = delDia
    .filter(p => p.formaPago === "Efectivo")
    .reduce((s, p) => s + totalesPedido(p).total, 0);
  const avisos = ruta.filter(r => r.desvio).length;

  const calcularRecorrido = async () => {
    setCalculando({ hechas: 0, total: 0 });
    setErrorRuta("");
    try {
      const r = await optimizar(delDia, {
        salida, margen,
        alAvanzar: (hechas, total) => setCalculando({ hechas, total }),
      });
      setOptimo({ dia: diaElegido, salida, margen, ids: delDia.map(p => p.id).sort().join(","), ...r });
    } catch {
      setErrorRuta("No se ha podido calcular el recorrido ahora mismo. Sigues con el orden por franja y zona, que también sirve.");
    } finally {
      setCalculando(null);
    }
  };

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
          {["Pedidos", "Ruta", "Estadísticas"].map(t => {
            const activo = t === vista;
            return (
              <button key={t} onClick={() => setVista(t)}
                style={{ flex: 1, padding: "9px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  background: activo ? "#ffffff1a" : "transparent",
                  color: activo ? "#fff" : SOBRE_MARRON,
                  border: "none", borderBottom: activo ? `2px solid ${ORO}` : "2px solid transparent",
                }}>{t}</button>
            );
          })}
        </div>
      </div>

      {vista === "Estadísticas" ? (
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
      ) : vista === "Ruta" ? (
        <div style={{ padding: 16, maxWidth: 480, margin: "0 auto" }}>
          {diasConRuta.length > 1 && (
            <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 12, paddingBottom: 2 }}>
              {diasConRuta.map(d => {
                const activo = d === diaElegido;
                return (
                  <button key={d} onClick={() => setDiaRuta(d)}
                    style={{ flex: "none", padding: "8px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                      background: activo ? VINO : BG_CARD,
                      color: activo ? "#fff" : TEXT_SUB,
                      border: activo ? `1.5px solid ${VINO}` : `1px solid ${BORDER}`,
                    }}>
                    {d === hoyISO() ? "Hoy" : fechaLegible(d)}
                    {d < hoyISO() && " ⚠️"}
                  </button>
                );
              })}
            </div>
          )}

          {ruta.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <p style={{ fontSize: 48, margin: "0 0 12px" }}>🗺️</p>
              <p style={{ fontSize: 15, color: TEXT_SUB, margin: 0 }}>
                No te quedan entregas a domicilio.
                {recogidasDelDia > 0 && " Lo que hay para ese día son recogidas en la tienda."}
              </p>
            </div>
          ) : (
            <>
              <div style={tarjeta}>
                <p style={rotulo}>Ruta de {fechaLegible(diaElegido)}</p>
                <div style={{ display: "flex", gap: 18, marginBottom: 16 }}>
                  <div>
                    <p style={{ margin: 0, fontFamily: TIPO_TIT, color: MARRON, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{ruta.length}</p>
                    <p style={{ margin: "3px 0 0", color: TEXT_SUB, fontSize: 12 }}>parada{ruta.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontFamily: TIPO_TIT, color: VINO, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{eur(totalRuta)}</p>
                    <p style={{ margin: "3px 0 0", color: TEXT_SUB, fontSize: 12 }}>a cobrar</p>
                  </div>
                  {efectivoRuta > 0 && (
                    <div>
                      <p style={{ margin: 0, fontFamily: TIPO_TIT, color: VERDE, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{eur(efectivoRuta)}</p>
                      <p style={{ margin: "3px 0 0", color: TEXT_SUB, fontSize: 12 }}>en efectivo</p>
                    </div>
                  )}
                </div>

                {/* La hora de salida cambia la ruta entera: salir a las 10 o a las
                    12 coloca las franjas en sitios distintos. */}
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
                  <div>
                    <label style={{ display: "block", color: TEXT_SUB, fontSize: 11.5, fontWeight: 700, marginBottom: 5 }}>Salgo a las</label>
                    <input type="time" value={hhmm(salida)}
                      onChange={e => {
                        const m = /^(\d{1,2}):(\d{2})$/.exec(e.target.value);
                        if (m) setSalidaMin(Number(m[1]) * 60 + Number(m[2]));
                      }}
                      style={{ background: BG_INPUT, border: `1.5px solid ${BORDER}`, borderRadius: 10,
                        color: TEXT_MAIN, padding: "9px 10px", fontFamily: "inherit", width: 108 }} />
                  </div>
                  <div>
                    <label style={{ display: "block", color: TEXT_SUB, fontSize: 11.5, fontWeight: 700, marginBottom: 5 }}>
                      Margen de franja
                    </label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[15, 30, 45].map(m => (
                        <button key={m} onClick={() => setMargen(m)}
                          style={{ padding: "9px 12px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                            cursor: "pointer", fontFamily: "inherit",
                            background: margen === m ? MARRON : BG_CARD,
                            color: margen === m ? "#fff" : TEXT_SUB,
                            border: margen === m ? `1.5px solid ${MARRON}` : `1px solid ${BORDER}`,
                          }}>{m}′</button>
                      ))}
                    </div>
                  </div>
                </div>

                {!alDia && (
                  <button onClick={calcularRecorrido} disabled={!!calculando}
                    style={{ width: "100%", background: calculando ? BORDER : MARRON, color: calculando ? TEXT_SUB : "#fff",
                      border: "none", borderRadius: 12, padding: "15px", marginBottom: 8,
                      cursor: calculando ? "wait" : "pointer", fontFamily: TIPO_TIT, fontSize: 14,
                      fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>
                    {calculando
                      ? (calculando.total ? `Situando direcciones (${calculando.hechas}/${calculando.total})…` : "Calculando…")
                      : "⚡ Calcular el mejor recorrido"}
                  </button>
                )}

                {errorRuta && (
                  <p style={{ background: "#fdf2e3", border: `1px solid ${ORO}66`, borderRadius: 10,
                    color: "#8a5a08", fontSize: 12.5, fontWeight: 600, padding: "10px 12px", margin: "0 0 8px" }}>
                    {errorRuta}
                  </p>
                )}

                {/* Un enlace por tramo: Maps no traga más de diez paradas de una vez. */}
                {tramos.map((t, i) => (
                  <a key={i} href={t.url} target="_blank" rel="noreferrer"
                    style={{ display: "block", textAlign: "center", background: VINO, color: "#fff",
                      borderRadius: 12, padding: "15px", marginBottom: 8, textDecoration: "none",
                      fontFamily: TIPO_TIT, fontSize: 14, fontWeight: 800, letterSpacing: ".06em",
                      textTransform: "uppercase", boxShadow: `0 4px 12px ${VINO}55` }}>
                    🗺️ {tramos.length === 1 ? "Abrir la ruta en Maps" : `Tramo ${i + 1}: paradas ${t.desde} a ${t.hasta}`}
                  </a>
                ))}

                <button onClick={() => window.print()}
                  style={{ width: "100%", background: BG_CARD, color: TEXT_MAIN, border: `1.5px solid ${BORDER}`,
                    borderRadius: 12, padding: "13px", cursor: "pointer", fontFamily: "inherit",
                    fontSize: 14, fontWeight: 700 }}>
                  🖨️ Imprimir la hoja de ruta
                </button>

                <p style={{ margin: "12px 0 0", color: TEXT_TENUE, fontSize: 11.5, lineHeight: 1.5 }}>
                  {alDia ? (
                    <>
                      Recorrido más corto saliendo de la tienda a las {hhmm(salida)}, contando
                      {" "}{MINUTOS_EN_PUERTA} minutos en cada puerta. Acaba sobre las {hhmm(optimo.fin)},
                      con {optimo.conduciendo} min al volante
                      {optimo.esperando > 0 && ` y ${Math.round(optimo.esperando / 60 * 10) / 10} h libres entre medias, esperando a que abran las franjas`}.
                      {avisos > 0
                        ? ` ${avisos} ${avisos === 1 ? "parada llega tarde" : "paradas llegan tarde"}; están marcadas abajo.`
                        : " Ninguna llega tarde."}
                      {" "}Son horas estimadas, sin contar el tráfico.
                    </>
                  ) : (
                    <>
                      Orden provisional: por franja y por zona. Dale a calcular y se ordena
                      por el camino más corto de verdad, aunque alguna entrega se salga
                      hasta {margen} minutos de su franja.
                    </>
                  )}
                </p>
              </div>

              {ruta.map(({ pedido: p, llegada, desvio }, i) => {
                const color = ESTADO_COLORS[p.estado] || TEXT_SUB;
                const aviso = avisoDesvio(desvio, margen);
                return (
                  <div key={p.id} style={{ ...tarjeta, borderLeft: `4px solid ${color}`, padding: 16, marginBottom: 10, display: "flex", gap: 14 }}>
                    <span style={{ flex: "none", width: 30, height: 30, borderRadius: 15, background: MARRON,
                      color: "#fff", fontFamily: TIPO_TIT, fontWeight: 800, fontSize: 14,
                      display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: TEXT_MAIN }}>{p.nombre}</p>
                        <span style={{ fontFamily: TIPO_TIT, color: VINO, fontWeight: 800, fontSize: 16, whiteSpace: "nowrap" }}>{eur(totalesPedido(p).total)}</span>
                      </div>
                      <div style={{ marginTop: 4 }}><BotonMaps direccion={p.direccion} cp={p.cp} /></div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
                        <span style={{ color: p.rangoHorario ? TEXT_SUB : TEXT_TENUE, fontSize: 12 }}>
                          🕐 {p.rangoHorario || "Sin hora fija"}
                        </span>
                        {llegada != null && (
                          <span style={{ color: TEXT_SUB, fontSize: 12 }}>➜ llegas ~{hhmm(llegada)}</span>
                        )}
                        <span style={{ color: TEXT_SUB, fontSize: 12 }}>💳 {p.formaPago}</span>
                        {p.telefono && (
                          <a href={`tel:${p.telefono}`} style={{ color: VINO, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                            📞 Llamar
                          </a>
                        )}
                      </div>

                      {(p.nota || p.notas) && (
                        <p style={{ margin: "8px 0 0", color: TEXT_MAIN, fontSize: 12.5, lineHeight: 1.45 }}>
                          📝 {p.nota || p.notas}
                        </p>
                      )}

                      {/* El aviso que pidió el dueño: salirse de la franja se permite,
                          pero se dice, y con el número delante. */}
                      {aviso && (
                        <p style={{ margin: "8px 0 0", padding: "7px 10px", borderRadius: 9, fontSize: 12, fontWeight: 700,
                          background: aviso.grave ? "#fdeaea" : "#fdf2e3",
                          color: aviso.grave ? "#9c2a2a" : "#8a5a08",
                          border: `1px solid ${aviso.grave ? "#9c2a2a33" : ORO + "66"}` }}>
                          ⚠️ {aviso.grave ? "Fuera de franja" : "Justo al límite"}: llegas {aviso.texto}.
                          {aviso.grave && " Avisa al cliente antes de salir."}
                        </p>
                      )}

                      {alDia && llegada == null && (
                        <p style={{ margin: "8px 0 0", color: TEXT_TENUE, fontSize: 11.5 }}>
                          Esta dirección no se ha podido situar en el mapa: va al final y sin hora estimada.
                        </p>
                      )}

                      <button onClick={() => { setPedidoAbierto(p); setCambiosPendientes({}); setGuardado(false); }}
                        style={{ background: "none", border: "none", padding: "8px 0 0", cursor: "pointer",
                          color: TEXT_SUB, fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", textDecoration: "underline" }}>
                        Ver el pedido y marcarlo
                      </button>
                    </div>
                  </div>
                );
              })}

              {recogidasDelDia > 0 && (
                <p style={{ color: TEXT_TENUE, fontSize: 12, textAlign: "center", marginTop: 14 }}>
                  Ese día hay además {recogidasDelDia} pedido{recogidasDelDia !== 1 ? "s" : ""} de
                  recogida en tienda, que no {recogidasDelDia !== 1 ? "entran" : "entra"} en la ruta.
                </p>
              )}

              <HojaRuta repartidor={repartidor.nombre} dia={diaElegido} entradas={ruta} margen={margen} />
            </>
          )}
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
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {/* El día, ahora que la lista va por fechas: sin él no se sabe
                      si lo de arriba es de hoy o se quedó de la semana pasada. */}
                  {p.fecha && (
                    <span style={{ color: p.fecha < hoyISO() ? "#b03a2e" : TEXT_SUB, fontSize: 12, fontWeight: p.fecha === hoyISO() ? 700 : 400 }}>
                      📅 {p.fecha === hoyISO() ? "Hoy" : fechaLegible(p.fecha)}
                    </span>
                  )}
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
