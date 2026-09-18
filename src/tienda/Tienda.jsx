import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { DIRECCION_LOCAL, eur, fotoDe, precioDesde, unidades } from './catalogo.js'
import { totalesDe } from './pedido.js'
import Ficha from './Ficha.jsx'
import Carrito from './Carrito.jsx'
import './tienda.css'

export default function Tienda() {
  const [productos, setProductos] = useState(null)
  const [error, setError] = useState(false)

  const [filtro, setFiltro] = useState('Todos')
  const [ficha, setFicha] = useState(null)
  const [carrito, setCarrito] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    getDoc(doc(db, 'datos', 'productos'))
      .then((snap) => setProductos(snap.exists() ? aLaVenta(JSON.parse(snap.data().valor)) : []))
      .catch(() => setError(true))
  }, [])

  // Con el carrito o la ficha abiertos, la página de fondo no se desplaza.
  useEffect(() => {
    document.body.style.overflow = abierto || ficha ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [abierto, ficha])

  const categorias = useMemo(
    () => (productos ? [...new Set(productos.map((p) => p.categoria).filter(Boolean))] : []),
    [productos]
  )
  const visibles = useMemo(
    () => (productos || []).filter((p) => filtro === 'Todos' || p.categoria === filtro),
    [productos, filtro]
  )

  const bandejas = carrito.reduce((s, l) => s + l.cantidad, 0)
  const { productos: subtotal } = totalesDe(carrito, 0)

  function agregar(linea) {
    setCarrito((actual) => {
      const i = actual.findIndex((l) => l.id === linea.id)
      if (i === -1) return [...actual, linea]
      const copia = [...actual]
      copia[i] = { ...copia[i], cantidad: Math.min(99, copia[i].cantidad + linea.cantidad) }
      return copia
    })
    setFicha(null)
    setAviso(`${linea.nombre} añadido`)
    setTimeout(() => setAviso(''), 2200)
  }

  return (
    <div className="dps">
      <div className="topbar">
        <div className="col">
          <div><strong>Reparto a domicilio en Madrid</strong> · Recogida en {DIRECCION_LOCAL}</div>
          <div className="tb-lema">Auténtica comida venezolana hecha con amor</div>
        </div>
      </div>

      <header className="head">
        <div className="col">
          <a href="#inicio" className="logo">
            <img className="logo-mark" src="/logo-donpepe.png" alt="Don Pepe" />
            <div className="logo-stack">
              <span className="logo-word">Don Pepe <em>Sabor</em></span>
              <span className="logo-tag">Tequeños · Pasteles · Empanadas</span>
            </div>
          </a>
          <nav className="nav">
            <a href="#inicio">Inicio</a>
            <a href="#productos">Productos</a>
            <a href="#como-pedir">Cómo pedir</a>
          </nav>
          <button className="cart-btn" onClick={() => setAbierto(true)} aria-label="Ver mi pedido">
            <svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 11.2a2 2 0 002 1.6h7.7a2 2 0 002-1.6L21 8H6" /><circle cx="10" cy="20" r="1.3" /><circle cx="18" cy="20" r="1.3" /></svg>
            {bandejas > 0 && <span className="cart-count">{bandejas}</span>}
          </button>
        </div>
      </header>

      <section className="hero" id="inicio">
        <div className="hero-glow" />
        <div className="col hero-in">
          <div>
            <div className="hero-kicker eyebrow">Tequeños <span /> Pastelitos <span /> Empanadas</div>
            <h1>Sabor que<br /><em>te encanta</em></h1>
            <p className="lede">Pasapalos venezolanos para tus reuniones y celebraciones. Congelados para freír en casa o fritos y listos para comer.</p>
            <a href="#productos" className="btn-cta">
              Haz tu pedido
              <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
          </div>
          <div className="hero-art">
            <img src="/productos/tequeno-tradicional.webp" alt="Tequeños de queso" />
            <div className="hero-script">¡Recién<br />hechos!<u /></div>
          </div>
        </div>
        <div className="trust">
          <div className="col">
            <Sello titulo="Ingredientes de calidad" pie="Receta venezolana de siempre" />
            <Sello titulo="Congelados o fritos" pie="Tú eliges cómo los quieres" />
            <Sello titulo="Reparto en Madrid" pie="O recógelos en Carabanchel" />
          </div>
        </div>
      </section>

      {categorias.length > 0 && (
        <section className="cats col">
          <div className="cats-scroll">
            {categorias.map((c) => {
              const muestra = productos.find((p) => p.categoria === c)
              return (
                <button className={`cat${filtro === c ? ' on' : ''}`} key={c}
                  onClick={() => { setFiltro(c); irA('productos') }}>
                  <img src={fotoDe(muestra)} alt="" loading="lazy" />
                  <b>{c}</b>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section className="coleccion col" id="productos">
        <div className="sec-head">
          <h2>Nuestros <em>productos</em></h2>
          <div className="pills">
            {['Todos', ...categorias].map((c) => (
              <button key={c} className={`pill${filtro === c ? ' on' : ''}`} onClick={() => setFiltro(c)}>{c}</button>
            ))}
          </div>
        </div>

        {error && <p className="note">No se pudieron cargar los productos. Revisa tu conexión y recarga la página.</p>}
        {!productos && !error && <p className="note">Cargando productos…</p>}

        {productos && (
          <div className="grid">
            {visibles.map((p) => <Tarjeta key={p.id} p={p} onAbrir={() => setFicha(p)} />)}
          </div>
        )}
      </section>

      <section className="pasos" id="como-pedir">
        <div className="col">
          <h2>¿Cómo <em>pedir</em>?</h2>
          <ol>
            <li><b>Elige</b><span>Tus productos, la bandeja y si los quieres congelados o fritos.</span></li>
            <li><b>Completa</b><span>Tus datos, el día y la franja horaria. El envío se calcula solo.</span></li>
            <li><b>Envía</b><span>Se abre WhatsApp con tu pedido escrito. Solo tienes que enviarlo.</span></li>
          </ol>
        </div>
      </section>

      <footer className="foot">
        <div className="col">
          <a href="#inicio" className="logo">
            <img className="logo-mark" src="/logo-donpepe.png" alt="Don Pepe" />
          </a>
          <nav>
            <a href="https://instagram.com/donpepesabor" target="_blank" rel="noreferrer">Instagram</a>
            <a href="https://facebook.com/donpepesabor" target="_blank" rel="noreferrer">Facebook</a>
          </nav>
          <div className="foot-tag">Sabor que te encanta<u /></div>
        </div>
        <div className="foot-legal">
          <div className="col">© {new Date().getFullYear()} Don Pepe Sabor · {DIRECCION_LOCAL}</div>
        </div>
      </footer>

      {carrito.length > 0 && !abierto && (
        <button className="barra-pedido" onClick={() => setAbierto(true)}>
          <span>Ver mi pedido · {bandejas} {bandejas === 1 ? 'bandeja' : 'bandejas'}</span>
          <b>{eur(subtotal)}</b>
        </button>
      )}

      {aviso && <div className="toast" role="status">✓ {aviso}</div>}

      {ficha && <Ficha p={ficha} onAgregar={agregar} onCerrar={() => setFicha(null)} />}

      <Carrito abierto={abierto} carrito={carrito} onCerrar={() => setAbierto(false)} onCambiar={setCarrito} />
    </div>
  )
}

// Solo se muestran las presentaciones con precio, y los productos que tengan alguna.
function aLaVenta(lista) {
  return lista
    .map((p) => ({ ...p, variantes: (p.variantes || []).filter((v) => v.precio > 0).sort((a, b) => tamaño(a) - tamaño(b)) }))
    .filter((p) => p.variantes.length > 0)
    .map((p, i) => ({ p, i }))
    // Agrupados por categoría (en el orden en que aparece cada una), sin mezclar.
    .sort((a, b) => ordenCat(lista, a.p) - ordenCat(lista, b.p) || a.i - b.i)
    .map(({ p }) => p)
}

const tamaño = (v) => Number(String(v.presentacion).match(/\d+/)?.[0] || 0)
function ordenCat(lista, p) {
  return lista.findIndex((x) => x.categoria === p.categoria)
}

function irA(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function Sello({ titulo, pie }) {
  return (
    <div className="trust-i">
      <svg viewBox="0 0 24 24"><path d="M12 2l3 5 5.5.8-4 3.9.9 5.5L12 15.5 6.6 17.2l.9-5.5-4-3.9L9 7z" /></svg>
      <div><b>{titulo}</b><span>{pie}</span></div>
    </div>
  )
}

function Tarjeta({ p, onAbrir }) {
  const varias = (p.variantes || []).length > 1
  return (
    <article className="card">
      <button className="card-img" onClick={onAbrir} aria-label={`Ver ${p.nombre}`}>
        <img src={fotoDe(p)} alt={p.nombre} loading="lazy" />
      </button>
      <div className="card-body">
        <div className="card-ref">{p.categoria}</div>
        <h3 className="card-name">{p.nombre}</h3>
        <div className="price-row">
          {varias && <span className="price-desde">desde</span>}
          <span className="price">{eur(precioDesde(p))}</span>
        </div>
        <div className="sizes">
          {(p.variantes || []).map((v) => <span key={v.presentacion} className="size-chip">{unidades(v.presentacion)}</span>)}
        </div>
        <button className="card-add" onClick={onAbrir}>Añadir al pedido</button>
      </div>
    </article>
  )
}
