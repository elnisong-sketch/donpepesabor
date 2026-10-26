import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from './firebase.js'
import './index.css'

// Cada app se descarga solo cuando se usa: el cliente de la tienda no baja la gestión.
const AppModerno    = lazy(() => import('./AppModerno.jsx'))
const AppRepartidor = lazy(() => import('./AppRepartidor.jsx'))
const Tienda        = lazy(() => import('./tienda/Tienda.jsx'))

// Los mismos colores y tipografías que la tienda y la gestión.
const MARRON = "#2a1200";
const VINO   = "#8a1f1f";
const ORO    = "#e8a317";
const CREMA  = "#fbf4e8";
const CREMA2 = "#efe1c8";
const TINTA  = "#2b1a10";
const TINTA2 = "#6f5a4a";

const hostname = window.location.hostname;
const params   = new URLSearchParams(window.location.search);

/**
 * Direcciones donde vive la TIENDA, una por una.
 *
 * Antes bastaba con que el dominio contuviera "donpepesabor", pero al renombrar la
 * gestión a un dominio de la marca (donpepesabor-gestion…) habría salido la tienda
 * en su lugar. Si algún día se añade otra dirección pública, va en esta lista;
 * cualquier dominio que no esté aquí muestra la gestión, que pide contraseña.
 */
const HOSTS_TIENDA = [
  "donpepesabor.vercel.app",
  "donpepesabor-tienda.web.app",
  "donpepesabor-tienda.firebaseapp.com",
];

const esPublico     = HOSTS_TIENDA.includes(hostname) || params.has("tienda");
const esRepartidor  = params.has("repartidor");

function mensajeError(code) {
  switch (code) {
    case "auth/invalid-email":          return "El correo no es válido";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":         return "Correo o contraseña incorrectos";
    case "auth/too-many-requests":      return "Demasiados intentos. Espera unos minutos";
    case "auth/network-request-failed": return "Sin conexión a internet";
    default:                            return "No se pudo entrar. Inténtalo de nuevo";
  }
}

function Login({ subtitulo }) {
  const [correo, setCorreo]   = useState("");
  const [clave, setClave]     = useState("");
  const [error, setError]     = useState("");
  const [cargando, setCargando] = useState(false);

  const intentar = async () => {
    if (!correo.trim() || !clave) { setError("Escribe correo y contraseña"); return; }
    setCargando(true); setError("");
    try {
      await signInWithEmailAndPassword(auth, correo.trim(), clave);
    } catch (e) {
      setError(mensajeError(e.code)); setClave("");
    } finally {
      setCargando(false);
    }
  };

  const estiloInput = { width: "100%", padding: "13px 15px", background: CREMA, border: `1.5px solid ${error ? "#b3261e" : CREMA2}`, borderRadius: 12, fontSize: 16, fontFamily: "inherit", color: TINTA, outline: "none", boxSizing: "border-box", marginBottom: 11 };

  return (
    <div style={{ minHeight: "100vh", background: CREMA, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Manrope', system-ui, sans-serif", color: TINTA, padding: 24 }}>
      <div style={{ background: "#fff", border: `1px solid ${CREMA2}`, borderRadius: 20, padding: "34px 30px", maxWidth: 360, width: "100%", boxShadow: "0 18px 50px rgba(42,18,0,.12)", textAlign: "center" }}>
        <img src="/logo-donpepe.png" alt="" style={{ width: 86, height: 86, objectFit: "contain", margin: "0 auto 14px", display: "block" }} />
        <h1 style={{ fontFamily: "'Archivo', system-ui, sans-serif", color: MARRON, fontSize: 23, fontWeight: 800, margin: "0 0 3px" }}>
          Don Pepe <span style={{ color: VINO }}>Sabor</span>
        </h1>
        <p style={{ color: TINTA2, fontSize: 10.5, letterSpacing: ".18em", textTransform: "uppercase", fontWeight: 700, margin: "0 0 26px" }}>{subtitulo}</p>

        <input
          type="email"
          autoComplete="username"
          placeholder="Correo"
          value={correo}
          onChange={e => setCorreo(e.target.value)}
          onKeyDown={e => e.key === "Enter" && intentar()}
          style={estiloInput}
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Contraseña"
          value={clave}
          onChange={e => setClave(e.target.value)}
          onKeyDown={e => e.key === "Enter" && intentar()}
          style={estiloInput}
        />

        {error && <p style={{ color: "#b3261e", fontSize: 13, fontWeight: 700, margin: "0 0 12px" }}>{error}</p>}

        <button onClick={intentar} disabled={cargando} style={{ width: "100%", background: VINO, border: "none", borderRadius: 12, color: "#fff", padding: "15px", fontFamily: "'Archivo', system-ui, sans-serif", fontSize: 14, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", cursor: cargando ? "wait" : "pointer", opacity: cargando ? 0.7 : 1 }}>
          {cargando ? "Entrando…" : "Entrar"}
        </button>

        <p style={{ color: "#a8968a", fontSize: 11, marginTop: 22 }}>Inversiones Ayala 1992 · Sistema de gestión</p>
      </div>
    </div>
  );
}

/**
 * Botón de cerrar sesión.
 *
 * Va abajo a la DERECHA: a la izquierda se montaba encima del pie del menú
 * lateral y tapaba el correo de quien ha entrado.
 */
function BotonSalir() {
  return (
    <button
      onClick={() => signOut(auth)}
      title="Cerrar sesión"
      style={{ position: "fixed", bottom: 12, right: 12, zIndex: 9999, background: "#fff", border: "1px solid #efe1c8", borderRadius: 50, color: "#6f5a4a", padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 10px rgba(42,18,0,.12)" }}
    >
      Salir
    </button>
  );
}

function ConSesion({ subtitulo, children }) {
  // undefined = comprobando, null = sin sesión
  const [usuario, setUsuario] = useState(undefined);

  useEffect(() => onAuthStateChanged(auth, setUsuario), []);

  if (usuario === undefined) return null;
  if (!usuario) return <Login subtitulo={subtitulo} />;
  return <>{children}<BotonSalir /></>;
}

function Root() {
  if (esRepartidor) return <ConSesion subtitulo="Acceso repartidor"><AppRepartidor /></ConSesion>;
  if (esPublico)    return <Tienda />;
  return <ConSesion subtitulo="Acceso a gestión interna"><AppModerno /></ConSesion>;
}

createRoot(document.getElementById('root')).render(
  <StrictMode><Suspense fallback={null}><Root /></Suspense></StrictMode>
)
