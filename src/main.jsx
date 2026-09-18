import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from './firebase.js'
import './index.css'
import AppModerno from './AppModerno.jsx'
import AppRepartidor from './AppRepartidor.jsx'
import PedidoPublico from './PedidoPublico.jsx'

const NAVY   = "#1e3a5f";

const hostname = window.location.hostname;
const params   = new URLSearchParams(window.location.search);

const esPublico     = hostname.includes("donpepesabor");
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

  const estiloInput = { width: "100%", padding: "13px 16px", border: `2px solid ${error ? "#ef4444" : "#e2e8f0"}`, borderRadius: 12, fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 12 };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "40px 32px", maxWidth: 360, width: "100%", boxShadow: "0 4px 32px #0002", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
        <h1 style={{ color: NAVY, fontSize: 20, fontWeight: 900, margin: "0 0 4px" }}>Inversiones Ayala 1992</h1>
        <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 28px" }}>{subtitulo}</p>

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

        {error && <p style={{ color: "#ef4444", fontSize: 13, fontWeight: 600, margin: "0 0 12px" }}>{error}</p>}

        <button onClick={intentar} disabled={cargando} style={{ width: "100%", background: NAVY, border: "none", borderRadius: 50, color: "#fff", padding: "14px", fontSize: 16, fontWeight: 700, cursor: cargando ? "wait" : "pointer", opacity: cargando ? 0.7 : 1 }}>
          {cargando ? "Entrando…" : "Entrar"}
        </button>

        <p style={{ color: "#cbd5e1", fontSize: 11, marginTop: 24 }}>Don Pepe Sabor · Sistema de gestión</p>
      </div>
    </div>
  );
}

function BotonSalir() {
  return (
    <button
      onClick={() => signOut(auth)}
      title="Cerrar sesión"
      style={{ position: "fixed", bottom: 12, left: 12, zIndex: 9999, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 50, color: "#64748b", padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px #0001" }}
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
  if (esPublico)    return <PedidoPublico />;
  return <ConSesion subtitulo="Acceso a gestión interna"><AppModerno /></ConSesion>;
}

createRoot(document.getElementById('root')).render(
  <StrictMode><Root /></StrictMode>
)
