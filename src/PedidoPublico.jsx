import { useState, useEffect } from "react";
import { db } from "./firebase.js";
import { doc, getDoc, setDoc } from "firebase/firestore";

const NAVY   = "#1e3a5f";
const ORANGE = "#f97316";
const BG     = "#f8fafc";
const VINO   = "#6b1a1a";
const CREMA  = "#fdf3e0";
const GOLD   = "#c8920a";

const PAGOS  = ["Bizum","Efectivo","Transferencia","Tarjeta"];

function hoy() { return new Date().toISOString().slice(0, 10); }

const SeccionTitulo = ({ titulo }) => (
  <div style={{ background: VINO, borderRadius: 8, padding: "8px 18px", display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
    <span style={{ color: "#fff", fontWeight: 900, fontSize: 18, letterSpacing: 1, fontFamily: "Georgia, serif" }}>{titulo}</span>
    <span style={{ color: GOLD, fontSize: 18 }}>✦</span>
  </div>
);

const FilaProducto = ({ nombre, cantidad, precio }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px dashed #e5d5b0" }}>
    <div>
      <span style={{ color: VINO, fontWeight: 700, fontSize: 13 }}>• </span>
      <span style={{ color: "#3d1a00", fontWeight: 700, fontSize: 13 }}>{nombre}</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ color: "#888", fontSize: 12 }}>{cantidad}</span>
      <span style={{ background: VINO, color: "#fff", borderRadius: 8, padding: "3px 10px", fontWeight: 900, fontSize: 14 }}>{precio}€</span>
    </div>
  </div>
);

// ── LANDING ─────────────────────────────────────────────────────────────────
const IMG_TEQUENOS      = "/tequeños.jpg";
const IMG_EMPANADAS     = "/empanadas.jpg";
const IMG_PASTEL_POLLO  = "/pastelpollo.jpg";
const IMG_PASTEL_CARNE  = "/pastelcarne.jpg";
const IMG_TODOS         = "/todosproductos.jpg";
const IMG_CACHITOS      = "/cachitos.jpg";
const IMG_CHEFS         = "/donpepechefs.jpg";

function Landing({ onPedir }) {
  return (
    <div style={{ minHeight: "100vh", background: CREMA, fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <style>{`
        .dp-hero { display: grid; grid-template-columns: 1fr 1fr; min-height: 420px; align-items: center; }
        .dp-hero-img { height: 100%; min-height: 420px; }
        .dp-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; align-items: stretch; }
        .dp-sellos { display: flex; justify-content: space-around; flex-wrap: wrap; gap: 20px; }
        .dp-hero-title { font-size: 56px; }
        .dp-hero-subtitle { font-size: 44px; }
        @media (max-width: 700px) {
          .dp-hero { grid-template-columns: 1fr !important; }
          .dp-hero-text { padding: 28px 20px 20px !important; }
          .dp-hero-img { min-height: unset !important; height: auto !important; max-height: unset !important; }
          .dp-hero-img img { height: auto !important; object-fit: contain !important; }
          .dp-hero-title { font-size: 36px !important; }
          .dp-hero-subtitle { font-size: 28px !important; }
          .dp-grid-2 { grid-template-columns: 1fr !important; }
          .dp-grid-2 img { max-height: 220px !important; object-fit: cover !important; }
          .dp-grid-2-rev > :first-child { order: 2; }
          .dp-grid-2-rev > :last-child { order: 1; }
          .dp-sellos { flex-direction: column; align-items: center; }
        }
      `}</style>

      {/* Hero — 2 columnas */}
      <div style={{ background: `linear-gradient(160deg, #3d1a00 0%, ${VINO} 100%)` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }} className="dp-hero">
          <div className="dp-hero-text" style={{ padding: "48px 40px 48px 48px" }}>
            <p style={{ color: "#e5d5b0", fontSize: 12, letterSpacing: 4, margin: "0 0 12px", textTransform: "uppercase" }}>Tequeños · Pasteles · Empanadas</p>
            <h1 className="dp-hero-title" style={{ color: GOLD, margin: "0 0 4px", fontWeight: 900, fontStyle: "italic", lineHeight: 1 }}>Don Pepe</h1>
            <h2 className="dp-hero-subtitle" style={{ color: "#fff", margin: "0 0 16px", fontWeight: 900, fontStyle: "italic" }}>Sabor</h2>
            <p style={{ color: GOLD, fontSize: 20, fontStyle: "italic", margin: "0 0 12px" }}>❝ Sabor que te encanta ❞</p>
            <p style={{ color: "#c8b090", fontSize: 14, margin: "0 0 32px", lineHeight: 1.6 }}>Auténtica comida venezolana hecha con amor.<br/>Pedidos a domicilio en Madrid.</p>
            <button onClick={onPedir} style={{ background: GOLD, border: "none", borderRadius: 50, color: "#3d1a00", padding: "16px 44px", fontSize: 18, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 20px #0005", fontFamily: "inherit" }}>
              🛒 Haz tu pedido
            </button>
          </div>
          <div className="dp-hero-img" style={{ overflow: "hidden", background: CREMA }}>
            <img src={IMG_CHEFS} alt="Don Pepe Sabor"
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }} />
          </div>
        </div>
      </div>

      {/* Menú completo */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>

        {/* Tequeños: texto izq, foto der */}
        <div className="dp-grid-2">
          <div style={{ background: "#fff8ed", border: "2px solid #e5d5b0", borderRadius: 14, padding: 20 }}>
            <SeccionTitulo titulo="TEQUEÑOS" />
            <FilaProducto nombre="Tequeños Tradicionales"     cantidad="25 uds" precio={12} />
            <FilaProducto nombre="Tequeños Tradicionales"     cantidad="50 uds" precio={22} />
            <FilaProducto nombre="Tequeños Guayaba y Queso"   cantidad="25 uds" precio={22} />
            <FilaProducto nombre="Tequeños de Salchicha"      cantidad="25 uds" precio={20} />
            <FilaProducto nombre="Tequeños Plátano con Queso" cantidad="25 uds" precio={20} />
            <FilaProducto nombre="Tequeños Jamón y Queso"     cantidad="25 uds" precio={22} />
            <FilaProducto nombre="Tequeños de Chocolate"      cantidad="24 uds" precio={22} />
          </div>
          <div style={{ borderRadius: 14, overflow: "hidden" }}>
            <img src={IMG_TEQUENOS} alt="Tequeños" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }} />
          </div>
        </div>

        {/* Pastelitos: foto izq, texto der */}
        <div className="dp-grid-2 dp-grid-2-rev">
          <div style={{ borderRadius: 14, overflow: "hidden" }}>
            <img src={IMG_PASTEL_POLLO} alt="Pastelitos" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }} />
          </div>
          <div style={{ background: "#fff8ed", border: "2px solid #e5d5b0", borderRadius: 14, padding: 20 }}>
            <SeccionTitulo titulo="PASTELITOS" />
            <FilaProducto nombre="Pastelito de Pollo"               cantidad="25 uds" precio={22} />
            <FilaProducto nombre="Pastelito de Carne Molida"        cantidad="25 uds" precio={22} />
            <FilaProducto nombre="Pastelito de Carne Mechada"       cantidad="25 uds" precio={22} />
            <FilaProducto nombre="Pastelito de Jamón y Queso"       cantidad="25 uds" precio={22} />
            <FilaProducto nombre="Pastelito Carne Mechada c/ Queso" cantidad="25 uds" precio={22} />
            <FilaProducto nombre="Pastelito de Pollo c/ Queso"      cantidad="25 uds" precio={22} />
          </div>
        </div>

        {/* Empanadas: texto izq, foto der */}
        <div className="dp-grid-2">
          <div style={{ background: "#fff8ed", border: "2px solid #e5d5b0", borderRadius: 14, padding: 20 }}>
            <SeccionTitulo titulo="EMPANADAS" />
            <FilaProducto nombre="Empanada de Carne Molida"  cantidad="25 uds" precio={21} />
            <FilaProducto nombre="Empanada de Pollo"         cantidad="25 uds" precio={21} />
            <FilaProducto nombre="Empanada de Carne Mechada" cantidad="25 uds" precio={21} />
            <FilaProducto nombre="Empanada de Queso"         cantidad="25 uds" precio={21} />
            <FilaProducto nombre="Empanada de Jamón y Queso" cantidad="25 uds" precio={21} />
          </div>
          <div style={{ borderRadius: 14, overflow: "hidden" }}>
            <img src={IMG_EMPANADAS} alt="Empanadas" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }} />
          </div>
        </div>

        {/* Cachitos: foto izq, texto der */}
        <div className="dp-grid-2 dp-grid-2-rev">
          <div style={{ borderRadius: 14, overflow: "hidden" }}>
            <img src={IMG_CACHITOS} alt="Cachitos" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }} />
          </div>
          <div style={{ background: "#fff8ed", border: "2px solid #e5d5b0", borderRadius: 14, padding: 20 }}>
            <SeccionTitulo titulo="CACHITOS" />
            <FilaProducto nombre="Cachitos Horneados" cantidad="6 uds" precio={18} />
          </div>
        </div>

        {/* Sellos */}
        <div className="dp-sellos" style={{ background: `linear-gradient(135deg, #3d1a00, ${VINO})`, borderRadius: 16, padding: "28px 32px", marginBottom: 28 }}>
          {[
            { icon: "🏅", texto: "Ingredientes de calidad" },
            { icon: "❤️", texto: "Hechos con amor para ti" },
            { icon: "🎉", texto: "Ideales para reuniones y celebraciones" },
            { icon: "🚚", texto: "Reparto a domicilio en Madrid" },
          ].map(s => (
            <div key={s.texto} style={{ textAlign: "center", color: "#fff", maxWidth: 140 }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>{s.icon}</div>
              <p style={{ color: GOLD, fontWeight: 700, fontSize: 13, margin: 0 }}>{s.texto}</p>
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", color: VINO, fontStyle: "italic", fontWeight: 700, fontSize: 20, margin: "0 0 28px" }}>
          ✦ ¡Disfruta el auténtico sabor venezolano! ✦
        </p>

        <button onClick={onPedir} style={{ display: "block", width: "100%", background: VINO, border: `3px solid ${GOLD}`, borderRadius: 50, color: "#fff", padding: "20px", fontSize: 20, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 20px #6b1a1a44", fontFamily: "inherit" }}>
          🛒 Hacer mi pedido ahora
        </button>
      </div>

      {/* Pie */}
      <div style={{ background: "#3d1a00", padding: "28px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 32, flexWrap: "wrap", marginBottom: 16 }}>
          <a href="https://wa.me/34600111222" style={{ color: "#4ade80", textDecoration: "none", fontWeight: 700, fontSize: 15 }}>📱 WhatsApp</a>
          <a href="https://instagram.com/donpepesabor" style={{ color: "#f9a8d4", textDecoration: "none", fontWeight: 700, fontSize: 15 }}>📸 Instagram</a>
          <a href="https://facebook.com/donpepesabor" style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 700, fontSize: 15 }}>👥 Facebook</a>
          <a href="tel:+34600111222" style={{ color: "#fde68a", textDecoration: "none", fontWeight: 700, fontSize: 15 }}>📞 600 111 222</a>
        </div>
        <p style={{ color: "#9a7a5a", fontSize: 12, margin: 0 }}>© 2025 Don Pepe Sabor · Madrid, España</p>
      </div>

      {/* Botón flotante */}
      <button onClick={onPedir} style={{ position: "fixed", bottom: 24, right: 24, background: VINO, border: `3px solid ${GOLD}`, borderRadius: 50, color: "#fff", padding: "14px 22px", fontSize: 15, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 20px #0005", zIndex: 100, fontFamily: "inherit" }}>
        🛒 Pedir ahora
      </button>
    </div>
  );
}

const ORIGEN_LAT = 40.3867;
const ORIGEN_LON = -3.7112; // Berrocal 56, 28021 Madrid

function tarifaPorKm(km) {
  if (km <= 10) return 6;
  if (km <= 12) return 8;
  return 10;
}

async function calcularDistanciaOSRM(direccion, cp) {
  try {
    // Intentar primero con dirección completa restringida a Madrid
    const query = encodeURIComponent(`${direccion}, ${cp}, Madrid, España`);
    const geo = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=5&countrycodes=es`,
      { headers: { "Accept-Language": "es" } }
    );
    const geoData = await geo.json();
    if (!geoData.length) return null;

    // Filtrar solo resultados dentro del área de Madrid (lat 40.2-40.7, lon -4.0 a -3.4)
    const enMadrid = geoData.filter(r =>
      parseFloat(r.lat) > 40.2 && parseFloat(r.lat) < 40.7 &&
      parseFloat(r.lon) > -4.0 && parseFloat(r.lon) < -3.4
    );

    // Si no hay ninguno en Madrid, fallback a centroide del CP
    const resultado = enMadrid.length ? enMadrid[0] : null;
    if (!resultado) {
      const geoCP = await fetch(
        `https://nominatim.openstreetmap.org/search?postalcode=${cp}&country=es&format=json&limit=1`,
        { headers: { "Accept-Language": "es" } }
      );
      const cpData = await geoCP.json();
      if (!cpData.length) return null;
      const { lat, lon } = cpData[0];
      const ruta2 = await fetch(`https://router.project-osrm.org/route/v1/driving/${ORIGEN_LON},${ORIGEN_LAT};${lon},${lat}?overview=false`);
      const rutaData2 = await ruta2.json();
      if (rutaData2.code !== "Ok") return null;
      const km2 = rutaData2.routes[0].distance / 1000;
      return { km: Math.round(km2 * 10) / 10, tarifa: tarifaPorKm(km2) };
    }

    const { lat, lon } = resultado;
    const ruta = await fetch(`https://router.project-osrm.org/route/v1/driving/${ORIGEN_LON},${ORIGEN_LAT};${lon},${lat}?overview=false`);
    const rutaData = await ruta.json();
    if (rutaData.code !== "Ok") return null;
    const km = rutaData.routes[0].distance / 1000;
    return { km: Math.round(km * 10) / 10, tarifa: tarifaPorKm(km) };
  } catch { return null; }
}

// ── FORMULARIO DE PEDIDO ─────────────────────────────────────────────────────
function Formulario({ onVolver }) {
  const [productos, setProductos] = useState([]);
  const [lineas, setLineas]       = useState([{ productoId: "", presentacion: "", cantidad: 1, preparacion: "" }]);
  const hoyISO = new Date().toISOString().slice(0, 10);
  const [form, setForm]           = useState({ nombre: "", telefono: "", direccion: "", cp: "", formaPago: "", horaDesde: "", horaHasta: "", tipoEntrega: "Domicilio", fechaEntrega: hoyISO });
  const [paso, setPaso]           = useState("form"); // form | enviando | confirmado
  const [error, setError]         = useState("");
  const [costoEnvio, setCostoEnvio] = useState(6);
  const [distanciaInfo, setDistanciaInfo] = useState(null); // { km, tarifa }
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "datos", "productos")).then(snap => {
      if (snap.exists()) setProductos(JSON.parse(snap.data().valor));
    });
  }, []);

  useEffect(() => {
    if (form.tipoEntrega !== "Domicilio") { setDistanciaInfo(null); return; }
    if (!form.cp.startsWith("28") || form.cp.length < 5 || form.direccion.length < 5) return;
    const timer = setTimeout(async () => {
      setCalculando(true);
      const resultado = await calcularDistanciaOSRM(form.direccion, form.cp);
      if (resultado) {
        setDistanciaInfo(resultado);
        setCostoEnvio(resultado.tarifa);
      }
      setCalculando(false);
    }, 1000); // espera 1s después de que el usuario deje de escribir
    return () => clearTimeout(timer);
  }, [form.direccion, form.cp, form.tipoEntrega]);

  const COSTO_FRITO = 5;

  const addLinea = () => setLineas(l => [...l, { productoId: "", presentacion: "", cantidad: 1, preparacion: "" }]);
  const removeLinea = i => setLineas(l => l.filter((_, idx) => idx !== i));
  const updateLinea = (i, key, val) => setLineas(l => l.map((li, idx) => idx === i ? { ...li, [key]: val, ...(key === "productoId" ? { presentacion: "", preparacion: "" } : {}) } : li));

  const lineasValidas = lineas.filter(l => l.productoId && l.presentacion && l.cantidad > 0);
  const lineasFrito = lineas.filter(l => l.productoId && l.preparacion === "Frito");
  const hayFrito = lineasFrito.length > 0;
  const cantidadFritos = lineasFrito.reduce((sum, l) => sum + Number(l.cantidad || 1), 0);
  const total = lineasValidas.reduce((s, l) => {
    const prod = productos.find(p => p.id === l.productoId);
    const vari = prod?.variantes.find(v => v.presentacion === l.presentacion);
    return s + (vari?.precio || 0) * l.cantidad;
  }, 0);

  const enviar = async () => {
    // Validar productos
    if (lineas.every(l => !l.productoId)) return setError("⚠️ Debes añadir al menos un producto.");
    const sinPresentacion = lineas.filter(l => l.productoId && !l.presentacion);
    if (sinPresentacion.length > 0) return setError("⚠️ Hay productos sin presentación seleccionada. Por favor, completa todos los productos.");
    if (lineasValidas.length === 0) return setError("⚠️ Añade al menos un producto válido.");
    const sinPreparacion = lineas.filter(l => l.productoId && l.presentacion && !l.preparacion);
    if (sinPreparacion.length > 0) return setError("⚠️ Selecciona si cada producto es Congelado o Frito.");

    // Validar datos personales
    if (!form.nombre.trim())   return setError("⚠️ Por favor, introduce tu nombre completo.");
    if (!form.telefono.trim()) return setError("⚠️ Por favor, introduce tu número de teléfono.");

    // Validar dirección solo si es domicilio
    if (form.tipoEntrega === "Domicilio") {
      if (!form.direccion.trim()) return setError("⚠️ Por favor, introduce tu dirección de entrega.");
      if (!form.cp.trim())        return setError("⚠️ Por favor, introduce el código postal.");
      if (!form.cp.startsWith("28")) return setError("⚠️ Solo realizamos entregas en Madrid (CP que empiece por 28).");
    }

    // Validar pago y horario
    if (!form.fechaEntrega) return setError("⚠️ Por favor, selecciona la fecha de entrega.");
    if (!form.formaPago)                    return setError("⚠️ Por favor, selecciona una forma de pago.");
    if (!form.horaDesde || !form.horaHasta) return setError("⚠️ Por favor, indica la franja horaria en la que deseas recibir el pedido.");
    setError(""); setPaso("enviando");
    try {
      const items = lineasValidas.map((l, idx) => {
        const prod = productos.find(p => p.id === l.productoId);
        const vari = prod?.variantes.find(v => v.presentacion === l.presentacion);
        return { id: "item-" + idx, productoId: l.productoId, nombreProducto: prod?.nombre, presentacion: l.presentacion, preparacion: l.preparacion || "Congelado", estado: "Congelado", cantidad: Number(l.cantidad), precio: vari?.precio || 0, subtotal: (vari?.precio || 0) * Number(l.cantidad), comision: 0, recargoFrito: 0 };
      });
      const envio = form.tipoEntrega === "Domicilio" && form.cp.startsWith("28") ? costoEnvio : 0;
      const servicio = cantidadFritos * COSTO_FRITO;
      const nuevoPedido = { id: "web-" + Date.now(), ...form, fecha: hoy(), estado: "Pendiente", envio, servicio, repartidorId: "", notas: "", items, total };
      // Enviar a Google Sheets via GET
      const productosTexto = items.map(i => `• ${i.nombreProducto} (${i.presentacion}) x${i.cantidad} [${i.preparacion}]`).join("\n");
      const totalFinal = total + envio + servicio;
      const params = new URLSearchParams({
        id: nuevoPedido.id,
        fecha: form.fechaEntrega,
        horario: form.horaDesde + " a " + form.horaHasta,
        cliente: form.nombre,
        telefono: form.telefono,
        cp: form.tipoEntrega === "Domicilio" ? form.cp : "",
        direccion: form.tipoEntrega === "Domicilio" ? form.direccion : "",
        productos: productosTexto,
        pago: form.formaPago,
        subtotal: total.toFixed(2) + " €",
        servicio: servicio.toFixed(2) + " €",
        envio: envio.toFixed(2) + " €",
        total: totalFinal.toFixed(2) + " €",
        notas: (form.tipoEntrega === "Recogida" ? "🏪 Recogida en tienda" : "🚚 Domicilio") + (form.notas ? " | " + form.notas : "")
      });
      fetch("https://script.google.com/macros/s/AKfycbySjQNlkoTT_Wo28xxCKRgk41QvXaECsItCooxiqmwxdn5xNqUORVtHWCX7hhAC8gSY/exec?" + params.toString(), {
        mode: "no-cors"
      }).catch(() => {});

      setPaso("confirmado");
    } catch { setError("Error al enviar. Inténtalo de nuevo."); setPaso("form"); }
  };

  if (paso === "confirmado") return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 72 }}>✅</div>
      <h2 style={{ color: NAVY, marginTop: 16, fontSize: 26 }}>¡Pedido recibido!</h2>
      <p style={{ color: "#64748b", maxWidth: 320, fontSize: 15 }}>Nos pondremos en contacto contigo para confirmar la entrega.</p>
      <p style={{ color: ORANGE, fontWeight: 900, fontSize: 24, margin: "8px 0 24px" }}>Total: {(total + (form.tipoEntrega === "Domicilio" && form.cp.startsWith("28") ? costoEnvio : 0) + (cantidadFritos * COSTO_FRITO)).toFixed(2)} €</p>
      <button onClick={onVolver} style={{ background: NAVY, border: "none", borderRadius: 50, color: "#fff", padding: "14px 32px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>← Volver al inicio</button>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Inter', sans-serif", paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ background: NAVY, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px #0003" }}>
        <button onClick={onVolver} style={{ background: "transparent", border: "none", color: "#94b4d4", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <span style={{ fontSize: 24 }}>👨‍🍳</span>
        <h1 style={{ color: "#fff", margin: 0, fontSize: 18, fontWeight: 900 }}>Hacer pedido</h1>
        {total > 0 && <span style={{ marginLeft: "auto", background: ORANGE, color: "#fff", borderRadius: 50, padding: "5px 14px", fontWeight: 700, fontSize: 14 }}>{total.toFixed(2)} €</span>}
      </div>

      <div style={{ maxWidth: 500, margin: "0 auto", padding: "20px 16px" }}>

        {/* Productos */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 1px 6px #0001" }}>
          <h3 style={{ color: NAVY, margin: "0 0 16px", fontSize: 17, fontWeight: 800 }}>🧀 Productos</h3>

          {lineas.map((linea, i) => {
            const prod = productos.find(p => p.id === linea.productoId);
            return (
              <div key={i} style={{ background: "#f8fafc", borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Producto {i + 1}</span>
                  {lineas.length > 1 && <button onClick={() => removeLinea(i)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 18, fontWeight: 700 }}>×</button>}
                </div>
                <select value={linea.productoId} onChange={e => updateLinea(i, "productoId", e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: "#fff", marginBottom: 8, boxSizing: "border-box" }}>
                  <option value="">— Selecciona un producto —</option>
                  {[...new Set(productos.map(p => p.categoria))].map(cat => (
                    <optgroup key={cat} label={cat}>
                      {productos.filter(p => p.categoria === cat).map(p => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                {prod && (
                  <>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <select value={linea.presentacion} onChange={e => updateLinea(i, "presentacion", e.target.value)}
                        style={{ flex: 2, padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" }}>
                        <option value="">— Presentación —</option>
                        {prod.variantes.map(v => (
                          <option key={v.presentacion} value={v.presentacion}>{v.presentacion} — {v.precio} €</option>
                        ))}
                      </select>
                      <input type="number" min="1" max="99" value={linea.cantidad} onChange={e => updateLinea(i, "cantidad", e.target.value)}
                        style={{ flex: 1, padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontFamily: "inherit", textAlign: "center", boxSizing: "border-box" }} />
                    </div>
                    {linea.presentacion ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        {["Congelado", "Frito"].map(op => {
                          const activo = linea.preparacion === op;
                          return (
                            <button key={op} onClick={() => updateLinea(i, "preparacion", op)}
                              style={{ flex: 1, padding: "8px", borderRadius: 10,
                                border: `1.5px solid ${activo ? (op === "Frito" ? ORANGE : NAVY) : "#e2e8f0"}`,
                                background: activo ? (op === "Frito" ? ORANGE : NAVY) : "#fff",
                                color: activo ? "#fff" : "#64748b",
                                fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                              {op === "Frito" ? "🔥 Frito" : "❄️ Congelado"}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>Selecciona una presentación para elegir preparación</p>
                    )}
                  </>
                )}
              </div>
            );
          })}

          <button onClick={() => {
              const sinProducto = lineas.find(l => !l.productoId);
              if (sinProducto) return setError("⚠️ Selecciona un producto antes de añadir otro.");
              const sinPresentacion = lineas.find(l => !l.presentacion);
              if (sinPresentacion) return setError("⚠️ Selecciona la presentación del producto antes de añadir otro.");
              const sinPreparacion = lineas.find(l => !l.preparacion);
              if (sinPreparacion) return setError("⚠️ Selecciona si el producto es Congelado o Frito antes de añadir otro.");
              addLinea();
            }} style={{ width: "100%", background: "transparent", border: `1.5px dashed ${ORANGE}`, borderRadius: 10, color: ORANGE, padding: "10px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>
            + Añadir otro producto
          </button>
        </div>

        {/* Datos cliente */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 1px 6px #0001" }}>
          <h3 style={{ color: NAVY, margin: "0 0 16px", fontSize: 17, fontWeight: 800 }}>📋 Tus datos</h3>

          {/* Fecha de entrega */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 8 }}>📅 Fecha de entrega *</label>
            <input type="date" value={form.fechaEntrega} min={hoyISO}
              onChange={e => setForm(f => ({ ...f, fechaEntrega: e.target.value }))}
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>

          {/* Tipo de entrega */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Tipo de entrega *</label>
            <div style={{ display: "flex", gap: 10 }}>
              {["Domicilio", "Recogida"].map(op => (
                <button key={op} onClick={() => setForm(f => ({ ...f, tipoEntrega: op }))}
                  style={{ flex: 1, padding: "12px", borderRadius: 12, border: `2px solid ${form.tipoEntrega === op ? VINO : "#e2e8f0"}`, background: form.tipoEntrega === op ? VINO : "#fff", color: form.tipoEntrega === op ? "#fff" : "#64748b", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                  {op === "Domicilio" ? "🚚 Domicilio" : "🏪 Recogida"}
                </button>
              ))}
            </div>
            {form.tipoEntrega === "Recogida" && (
              <p style={{ color: "#64748b", fontSize: 12, margin: "8px 0 0", textAlign: "center" }}>Recogida en Berrocal 56, 28021 Madrid</p>
            )}
          </div>

          {/* Campos básicos */}
          {[
            { label: "Nombre completo *", key: "nombre", type: "text", placeholder: "Ej: María García" },
            { label: "Teléfono *", key: "telefono", type: "tel", placeholder: "Ej: 612345678" },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 4 }}>{f.label}</label>
              <input type={f.type} placeholder={f.placeholder} value={form[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
            </div>
          ))}

          {/* Campos solo para Domicilio */}
          {form.tipoEntrega === "Domicilio" && [
            { label: "Dirección de entrega *", key: "direccion", type: "text", placeholder: "Calle, número, piso..." },
            { label: "Código postal *", key: "cp", type: "text", placeholder: "Ej: 28001" },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 4 }}>{f.label}</label>
              <input type={f.type} placeholder={f.placeholder} value={form[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
            </div>
          ))}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Forma de pago *</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PAGOS.map(p => (
                <button key={p} onClick={() => setForm(f => ({ ...f, formaPago: p }))}
                  style={{ padding: "9px 16px", borderRadius: 50, border: `1.5px solid ${form.formaPago === p ? ORANGE : "#e2e8f0"}`, background: form.formaPago === p ? ORANGE : "#fff", color: form.formaPago === p ? "#fff" : "#64748b", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Franja horaria para recibir el pedido *</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="time" value={form.horaDesde} onChange={e => setForm(f => ({ ...f, horaDesde: e.target.value }))}
                style={{ flex: 1, padding: "11px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
              <span style={{ color: "#64748b", fontWeight: 700, fontSize: 14 }}>a</span>
              <input type="time" value={form.horaHasta} onChange={e => setForm(f => ({ ...f, horaHasta: e.target.value }))}
                style={{ flex: 1, padding: "11px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
            </div>
            {form.horaDesde && form.horaHasta && (
              <p style={{ color: "#475569", fontSize: 12, margin: "6px 0 0", textAlign: "center" }}>
                Entrega entre las <strong>{form.horaDesde}</strong> y las <strong>{form.horaHasta}</strong>
              </p>
            )}
          </div>
        </div>

        {/* Servicio de preparación (frito) */}
        {hayFrito && (
          <div style={{ background: "#fff", borderRadius: 16, padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 6px #0001" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 700, color: NAVY, fontSize: 15 }}>🔥 Servicio de preparación</span>
                <p style={{ color: "#94a3b8", fontSize: 11, margin: "4px 0 0" }}>{cantidadFritos} producto{cantidadFritos > 1 ? "s" : ""} × {COSTO_FRITO}€ por fritura</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: ORANGE, borderRadius: 10, padding: "10px 18px" }}>
                <span style={{ color: "#fff", fontWeight: 900, fontSize: 22 }}>{cantidadFritos * COSTO_FRITO}</span>
                <span style={{ color: "#fff", fontWeight: 900, fontSize: 22 }}>€</span>
              </div>
            </div>
          </div>
        )}

        {/* Coste de envío — solo Domicilio */}
        {form.tipoEntrega === "Domicilio" && form.cp.length >= 5 && (
          <div style={{ background: "#fff", borderRadius: 16, padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 6px #0001" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontWeight: 700, color: NAVY, fontSize: 15 }}>🚚 Coste de envío</span>
              {!form.cp.startsWith("28") && <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>Solo entregamos en Madrid</span>}
            </div>
            {form.cp.startsWith("28") && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  {/* KM informativo */}
                  <div style={{ flex: 1, background: calculando ? "#fff7ed" : distanciaInfo ? "#eef2ff" : "#f8fafc", borderRadius: 10, padding: "12px 14px", border: `1.5px solid ${calculando ? "#fed7aa" : distanciaInfo ? "#c7d2fe" : "#e2e8f0"}`, textAlign: "center" }}>
                    {calculando
                      ? <span style={{ fontSize: 13, color: "#c2410c" }}>📍 Calculando...</span>
                      : distanciaInfo
                        ? <><span style={{ fontSize: 22, fontWeight: 900, color: "#3730a3" }}>{distanciaInfo.km}</span><span style={{ fontSize: 13, color: "#6366f1", fontWeight: 600 }}> km</span></>
                        : <span style={{ fontSize: 12, color: "#94a3b8" }}>Escribe tu dirección</span>
                    }
                  </div>
                  {/* Precio fijo no editable */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: VINO, borderRadius: 10, padding: "12px 18px" }}>
                    <span style={{ color: "#fff", fontWeight: 900, fontSize: 22 }}>{costoEnvio}</span>
                    <span style={{ color: "#fde68a", fontWeight: 900, fontSize: 22 }}>€</span>
                  </div>
                </div>
                <p style={{ color: "#94a3b8", fontSize: 11, margin: 0 }}>≤10 km: 6€ · 10-12 km: 8€ · &gt;12 km: 10€ · Puedes ajustarlo manualmente</p>
              </>
            )}
          </div>
        )}

        {/* Total */}
        {total > 0 && (
          <div style={{ background: NAVY, borderRadius: 16, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: "#94b4d4", fontWeight: 700, fontSize: 15 }}>Productos</span>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>{total.toFixed(2)} €</span>
            </div>
            {hayFrito && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: "#94b4d4", fontWeight: 700, fontSize: 15 }}>🔥 Fritura ({cantidadFritos} × {COSTO_FRITO}€)</span>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>{(cantidadFritos * COSTO_FRITO).toFixed(2)} €</span>
              </div>
            )}
            {form.tipoEntrega === "Domicilio" && form.cp.startsWith("28") && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: "#94b4d4", fontWeight: 700, fontSize: 15 }}>🚚 Envío</span>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>{costoEnvio.toFixed(2)} €</span>
              </div>
            )}
            <div style={{ borderTop: "1px solid #2d5a8e", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#fff", fontWeight: 900, fontSize: 15 }}>TOTAL</span>
              <span style={{ color: "#fff", fontWeight: 900, fontSize: 22 }}>
                {(total + (cantidadFritos * COSTO_FRITO) + (form.tipoEntrega === "Domicilio" && form.cp.startsWith("28") ? costoEnvio : 0)).toFixed(2)} €
              </span>
            </div>
          </div>
        )}

        {error && <p style={{ color: "#dc2626", fontWeight: 600, fontSize: 14, textAlign: "center", marginBottom: 12 }}>{error}</p>}

        <button onClick={enviar} disabled={paso === "enviando"}
          style={{ width: "100%", background: paso === "enviando" ? "#94a3b8" : ORANGE, border: "none", borderRadius: 50, color: "#fff", padding: "16px", fontSize: 17, fontWeight: 800, cursor: paso === "enviando" ? "default" : "pointer", boxShadow: "0 4px 16px #f9731644" }}>
          {paso === "enviando" ? "Enviando..." : "✅ Confirmar pedido"}
        </button>
      </div>
    </div>
  );
}

// ── RAÍZ ────────────────────────────────────────────────────────────────────
export default function PedidoPublico() {
  const path = window.location.pathname;
  const [vista, setVista] = useState(path === "/pedido" ? "formulario" : "landing");
  if (vista === "formulario") return <Formulario onVolver={() => { window.history.pushState({}, "", "/"); setVista("landing"); }} />;
  return <Landing onPedir={() => { window.history.pushState({}, "", "/pedido"); setVista("formulario"); }} />;
}
