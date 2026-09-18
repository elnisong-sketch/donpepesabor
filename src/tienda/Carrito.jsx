import { useEffect, useMemo, useState } from 'react'
import { COSTO_FRITO, DIRECCION_LOCAL, PAGOS, PREFIJOS, eur, unidades } from './catalogo.js'
import { TARIFA_BASE, TEXTO_TARIFAS, calcularEnvio } from './envio.js'
import {
  conPlazo, hoyLocal, irAWhatsapp, nuevoCodigo, redactarMensaje, registrarEnHoja, totalesDe,
} from './pedido.js'

export default function Carrito({ abierto, carrito, onCerrar, onCambiar }) {
  const [codigo] = useState(nuevoCodigo)
  const [datos, setDatos] = useState({
    tipoEntrega: 'Domicilio', fechaEntrega: hoyLocal(), horaDesde: '', horaHasta: '',
    nombre: '', prefijo: '34', telefono: '', direccion: '', cp: '', formaPago: '', nota: '',
  })
  const [distancia, setDistancia] = useState(null)   // { km, tarifa }
  const [calculando, setCalculando] = useState(false)
  const [verMensaje, setVerMensaje] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const domicilio = datos.tipoEntrega === 'Domicilio'
  const cpMadrid = /^28\d{3}$/.test(datos.cp.trim())

  // Calcula el envío un segundo después de que se deje de escribir la dirección.
  useEffect(() => {
    setDistancia(null)
    if (!domicilio || !cpMadrid || datos.direccion.trim().length < 5) return
    const t = setTimeout(async () => {
      setCalculando(true)
      setDistancia(await calcularEnvio(datos.direccion.trim(), datos.cp.trim()))
      setCalculando(false)
    }, 1000)
    return () => clearTimeout(t)
  }, [datos.direccion, datos.cp, domicilio, cpMadrid])

  // Si el cliente escribe él mismo "+..." o "00...", se respeta; si no, se le pone el prefijo elegido.
  const tel = datos.telefono.trim()
  const telefonoCompleto = !tel ? '' : /^(\+|00)/.test(tel) ? tel : `+${datos.prefijo} ${tel}`
  const cifrasTel = tel.replace(/\D/g, '').length
  const telOk = datos.prefijo === '34' && !/^(\+|00)/.test(tel) ? cifrasTel === 9 : cifrasTel >= 6

  const envio = domicilio ? (distancia?.tarifa ?? TARIFA_BASE) : 0
  const t = totalesDe(carrito, envio)
  const bandejas = carrito.reduce((s, l) => s + l.cantidad, 0)

  const falta = useMemo(() => {
    if (!carrito.length) return 'Añade al menos un producto'
    if (!datos.fechaEntrega) return 'Elige el día de entrega'
    if (!datos.horaDesde || !datos.horaHasta) return 'Indica la franja horaria'
    if (datos.horaHasta <= datos.horaDesde) return 'La hora final debe ser posterior a la inicial'
    if (!datos.nombre.trim()) return 'Escribe tu nombre'
    if (!tel) return 'Escribe tu teléfono'
    if (!telOk) return 'Revisa el teléfono: faltan o sobran números'
    if (domicilio && !datos.direccion.trim()) return 'Escribe la dirección de entrega'
    if (domicilio && !datos.cp.trim()) return 'Escribe el código postal'
    if (domicilio && !cpMadrid) return 'Solo repartimos en Madrid (código postal 28xxx)'
    if (!datos.formaPago) return 'Elige la forma de pago'
    return ''
  }, [carrito.length, datos, domicilio, cpMadrid, tel, telOk])

  const mensaje = useMemo(
    () => redactarMensaje({ ...datos, telefono: telefonoCompleto, codigo }, carrito, envio, distancia),
    [datos, telefonoCompleto, codigo, carrito, envio, distancia]
  )

  const cambiar = (campo) => (e) => setDatos({ ...datos, [campo]: e.target.value })
  const poner = (campo, valor) => setDatos({ ...datos, [campo]: valor })

  function ajustar(id, delta) {
    onCambiar(carrito
      .map((l) => (l.id === id ? { ...l, cantidad: Math.min(99, l.cantidad + delta) } : l))
      .filter((l) => l.cantidad > 0))
  }

  async function finalizar() {
    if (falta || enviando) return
    setEnviando(true)
    try {
      await conPlazo(registrarEnHoja({ ...datos, telefono: telefonoCompleto, codigo }, carrito, envio))
    } catch (e) {
      console.error('No se pudo registrar el pedido en la hoja; se sigue a WhatsApp.', e)
    }
    irAWhatsapp(mensaje)
  }

  return (
    <>
      <div className={`scrim${abierto ? ' on' : ''}`} onClick={onCerrar} />
      <aside className={`drawer${abierto ? ' on' : ''}`} aria-label="Tu pedido">
        <div className="dr-head">
          <h3>Tu pedido ({bandejas})</h3>
          <button onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>

        <div className="dr-body">
          {!carrito.length && (
            <div className="empty">Todavía no has añadido nada.<br />Elige un producto para empezar.</div>
          )}

          {carrito.map((l) => (
            <div className="line" key={l.id}>
              <img src={l.imagen} alt="" />
              <div>
                <div className="line-name">{l.nombre}</div>
                <div className="line-var">
                  {unidades(l.presentacion)} · {l.preparacion === 'Frito' ? '🔥 Frito' : '❄️ Congelado'}
                </div>
                <div className="line-bot">
                  <div className="qty-sm">
                    <button onClick={() => ajustar(l.id, -1)} aria-label="Quitar una">−</button>
                    <span>{l.cantidad}</span>
                    <button onClick={() => ajustar(l.id, 1)} aria-label="Añadir una">+</button>
                  </div>
                  <button className="trash" onClick={() => onCambiar(carrito.filter((x) => x.id !== l.id))}>Quitar</button>
                </div>
              </div>
              <div className="line-price">{eur(l.precio * l.cantidad)}</div>
            </div>
          ))}

          {carrito.length > 0 && (
            <>
              <div className="hr" />

              <div className="form-sec">
                <h4>¿Cómo lo recibes?</h4>
                <div className="radios two">
                  {['Domicilio', 'Recogida'].map((op) => (
                    <button key={op} className={`radio${datos.tipoEntrega === op ? ' on' : ''}`} onClick={() => poner('tipoEntrega', op)}>
                      <b>{op === 'Domicilio' ? '🚚 A domicilio' : '🏪 Recogida'}</b>
                    </button>
                  ))}
                </div>
                {!domicilio && <p className="hint">Recogida en {DIRECCION_LOCAL}</p>}
              </div>

              <div className="form-sec">
                <h4>¿Cuándo?</h4>
                <div className="field">
                  <label htmlFor="fFecha">Día</label>
                  <input id="fFecha" type="date" min={hoyLocal()} value={datos.fechaEntrega} onChange={cambiar('fechaEntrega')} />
                </div>
                <div className="field">
                  <label>Franja horaria</label>
                  <div className="franja">
                    <input type="time" aria-label="Desde" value={datos.horaDesde} onChange={cambiar('horaDesde')} />
                    <span>a</span>
                    <input type="time" aria-label="Hasta" value={datos.horaHasta} onChange={cambiar('horaHasta')} />
                  </div>
                </div>
              </div>

              <div className="form-sec">
                <h4>Tus datos</h4>
                <div className="field">
                  <label htmlFor="fNom">Nombre y apellido</label>
                  <input id="fNom" value={datos.nombre} onChange={cambiar('nombre')} placeholder="María García" autoComplete="name" />
                </div>
                <div className="field">
                  <label htmlFor="fTel">Teléfono (WhatsApp)</label>
                  <div className="tel">
                    {/* Cerrado muestra solo bandera y prefijo; al abrirlo, la lista con los países. */}
                    <label className="pref">
                      <span>{PREFIJOS.find(([n]) => n === datos.prefijo)?.[1]} +{datos.prefijo} ▾</span>
                      <select aria-label="Prefijo del país" value={datos.prefijo} onChange={cambiar('prefijo')}>
                        {PREFIJOS.map(([n, bandera, pais]) => (
                          <option key={n + pais} value={n}>{bandera} {pais} (+{n})</option>
                        ))}
                      </select>
                    </label>
                    <input id="fTel" value={datos.telefono} onChange={cambiar('telefono')}
                      placeholder={datos.prefijo === '34' ? '612 345 678' : 'Número sin el prefijo'}
                      inputMode="tel" autoComplete="tel-national" />
                  </div>
                </div>
                {domicilio && (
                  <>
                    <div className="field">
                      <label htmlFor="fDir">Dirección de entrega</label>
                      <input id="fDir" value={datos.direccion} onChange={cambiar('direccion')} placeholder="Calle, número, piso…" autoComplete="street-address" />
                    </div>
                    <div className="field">
                      <label htmlFor="fCp">Código postal</label>
                      <input id="fCp" value={datos.cp} onChange={cambiar('cp')} placeholder="28001" inputMode="numeric" maxLength={5} autoComplete="postal-code" />
                    </div>
                    {datos.cp.trim().length === 5 && !cpMadrid && <p className="hint warn">Solo repartimos en Madrid (código postal 28xxx).</p>}
                    {cpMadrid && (
                      <div className="envio-box">
                        <span>
                          {calculando ? '📍 Calculando distancia…'
                            : distancia ? <>📍 <b>{distancia.km} km</b> hasta tu dirección</>
                            : datos.direccion.trim().length < 5 ? 'Escribe tu dirección para calcular el envío'
                            : 'No pudimos calcular la distancia; se aplica la tarifa base'}
                        </span>
                        <b>{eur(envio)}</b>
                      </div>
                    )}
                    {cpMadrid && <p className="hint">{TEXTO_TARIFAS}</p>}
                  </>
                )}
              </div>

              <div className="form-sec">
                <h4>Forma de pago</h4>
                <div className="chips">
                  {PAGOS.map((p) => (
                    <button key={p} className={`chip${datos.formaPago === p ? ' on' : ''}`} onClick={() => poner('formaPago', p)}>{p}</button>
                  ))}
                </div>
                <div className="field">
                  <label htmlFor="fNota">Nota (opcional)</label>
                  <input id="fNota" value={datos.nota} onChange={cambiar('nota')} placeholder="Timbre 3ºB, es para un cumpleaños…" />
                </div>
              </div>

              <div className="hr" />

              <div className="totals">
                <div><span>Productos ({bandejas} {bandejas === 1 ? 'bandeja' : 'bandejas'})</span><b>{eur(t.productos)}</b></div>
                {t.fritura > 0 && <div><span>Fritura ({t.bandejasFritas} × {eur(COSTO_FRITO)})</span><b>{eur(t.fritura)}</b></div>}
                {domicilio && <div><span>Envío</span><b>{eur(t.envio)}</b></div>}
                <div className="t-big"><span>Total</span><span>{eur(t.total)}</span></div>
              </div>

              {verMensaje && <div className="msg-prev">{mensaje}</div>}
            </>
          )}
        </div>

        <div className="dr-foot">
          {carrito.length > 0 && falta && <div className="falta">{falta}</div>}
          <button className="btn-wa" disabled={Boolean(falta) || enviando} onClick={finalizar}>
            <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.4.8 3.2.6a2.8 2.8 0 001.8-1.3 2.3 2.3 0 00.2-1.3c-.1-.1-.3-.2-.5-.3z" /></svg>
            {enviando ? 'Preparando…' : 'Enviar pedido por WhatsApp'}
          </button>
          {carrito.length > 0 && (
            <button className="see-msg" onClick={() => setVerMensaje(!verMensaje)}>
              {verMensaje ? 'Ocultar el mensaje ▴' : 'Ver el mensaje que se enviará ▾'}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
