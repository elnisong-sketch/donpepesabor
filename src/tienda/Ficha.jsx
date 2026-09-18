import { useState } from 'react'
import { COSTO_FRITO, detallePrep, etiquetaPrep, eur, fotoDe, preparacionesDe, unidades } from './catalogo.js'

/** Ficha del producto: aquí se elige la bandeja, congelado o frito, y la cantidad. */
export default function Ficha({ p, onAgregar, onCerrar }) {
  const variantes = p.variantes || []
  const [presentacion, setPresentacion] = useState(variantes.length === 1 ? variantes[0].presentacion : null)
  const opciones = preparacionesDe(p)
  const [preparacion, setPreparacion] = useState(opciones.length ? null : '')
  const [cantidad, setCantidad] = useState(1)

  const variante = variantes.find((v) => v.presentacion === presentacion)
  const precioUnidad = (variante?.precio || 0) + (preparacion === 'Frito' ? COSTO_FRITO : 0)
  const listo = variante && preparacion != null

  function añadir() {
    if (!listo) return
    onAgregar({
      id: `${p.id}|${presentacion}|${preparacion}`,
      productoId: p.id,
      nombre: p.nombre,
      imagen: fotoDe(p),
      presentacion,
      preparacion,
      precio: variante.precio,
      cantidad,
    })
  }

  const textoBoton = !variante ? 'Elige la bandeja'
    : preparacion == null ? `Elige ${opciones.join(' o ').toLowerCase()}`
    : `Añadir al pedido · ${eur(precioUnidad * cantidad)}`

  return (
    <>
      <div className="scrim on" onClick={onCerrar} />
      <div className="modal on" role="dialog" aria-modal="true" aria-label={p.nombre}>
        <button className="x-btn" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <div className="modal-grid">
          <img src={fotoDe(p)} alt={p.nombre} />
          <div className="modal-side">
            <div>
              <div className="card-ref">{p.categoria}</div>
              <h3 className="modal-title">{p.nombre}</h3>
              <div className="price-row">
                <span className="price" style={{ fontSize: 28 }}>{eur(variante ? variante.precio : Math.min(...variantes.map((v) => v.precio)))}</span>
                {variante && <span className="price-desde">{unidades(presentacion)}</span>}
              </div>
            </div>

            <div>
              <span className="opt-label">Bandeja</span>
              <div className="opt-row">
                {variantes.map((v) => (
                  <button key={v.presentacion} className={`size-pick${v.presentacion === presentacion ? ' on' : ''}`}
                    onClick={() => setPresentacion(v.presentacion)}>
                    {unidades(v.presentacion)} <small>{eur(v.precio)}</small>
                  </button>
                ))}
              </div>
            </div>

            {opciones.length > 0 && <div>
              <span className="opt-label">¿Cómo lo quieres?</span>
              <div className="opt-row prep">
                {opciones.map((op) => (
                  <button key={op} className={`prep-pick${op === preparacion ? ' on' : ''}${op === 'Frito' || op === 'Horneado' ? ' frito' : ''}`}
                    onClick={() => setPreparacion(op)}>
                    <b>{etiquetaPrep(op)}</b>
                    <small>{detallePrep(op)}{op === 'Frito' ? ` · +${eur(COSTO_FRITO)}` : ''}</small>
                  </button>
                ))}
              </div>
            </div>}

            <div>
              <span className="opt-label">Cantidad de bandejas</span>
              <div className="qty">
                <button onClick={() => setCantidad(Math.max(1, cantidad - 1))} aria-label="Quitar una">−</button>
                <span>{cantidad}</span>
                <button onClick={() => setCantidad(Math.min(99, cantidad + 1))} aria-label="Añadir una">+</button>
              </div>
            </div>

            <button className="btn-solid" onClick={añadir} disabled={!listo}>{textoBoton}</button>
          </div>
        </div>
      </div>
    </>
  )
}
