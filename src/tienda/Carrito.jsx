import { useEffect, useMemo, useState } from 'react'
import { getDoc, doc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { SIN_PREFERENCIA, huecosEn, sinReparto, textoFranja, turnosDe } from '../franjas.js'
import { DIRECCION_LOCAL, PAGOS, PREFIJOS, etiquetaPrep, eur, unidades } from './catalogo.js'
import { TARIFA_BASE, TEXTO_TARIFAS, calcularEnvio } from './envio.js'
import {
  conPlazo, fechaLegible, fechaMinima, hoyLocal, irAWhatsapp, nuevoCodigo, porEncargoDe, redactarMensaje, registrarEnNube, totalesDe,
} from './pedido.js'

/**
 * Datos del comprador guardados en SU propio móvil, para no reescribirlos cada vez.
 * No salen de ahí: no se envían a ningún sitio ni los vemos nosotros. La fecha, la
 * hora y la nota no se recuerdan, porque cambian en cada pedido.
 */
const CLAVE_DATOS = 'dps_datos_cliente'

function datosGuardados() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_DATOS) || '{}')
    return { nombre: g.nombre || '', prefijo: g.prefijo || '34', telefono: g.telefono || '',
             direccion: g.direccion || '', cp: g.cp || '', formaPago: g.formaPago || '' }
  } catch {
    return { nombre: '', prefijo: '34', telefono: '', direccion: '', cp: '', formaPago: '' }
  }
}

export default function Carrito({ abierto, carrito, onCerrar, onCambiar }) {
  const [codigo] = useState(nuevoCodigo)
  const [datos, setDatos] = useState(() => ({
    tipoEntrega: 'Domicilio', fechaEntrega: hoyLocal(), franja: '',
    nota: '', ...datosGuardados(),
  }))
  const [distancia, setDistancia] = useState(null)   // { km, tarifa }
  const [agenda, setAgenda] = useState({})           // huecos ya ocupados, por día y franja
  const [direccion, setDireccion] = useState('vacia') // vacia | buscando | ok | no | sin-revisar
  const [calculando, setCalculando] = useState(false)
  const [verMensaje, setVerMensaje] = useState(false)
  const [enviando, setEnviando] = useState(false)

  /**
   * Huecos de reparto ya ocupados, que publica la gestión.
   *
   * Es un resumen con fechas y cuentas, nada de clientes. Si no se puede leer
   * (sin conexión, o aún no se ha publicado), se sigue adelante con todo libre:
   * perder un pedido por no poder contar huecos sería peor que doblar una franja.
   */
  useEffect(() => {
    if (!abierto) return
    getDoc(doc(db, 'datos', 'agenda'))
      .then((s) => setAgenda(s.exists() ? JSON.parse(s.data().valor || '{}') : {}))
      .catch(() => setAgenda({}))
  }, [abierto])

  const domicilio = datos.tipoEntrega === 'Domicilio'
  const cpMadrid = /^28\d{3}$/.test(datos.cp.trim())

  /**
   * Comprueba la dirección un segundo después de dejar de escribir.
   *
   * No vale solo para cobrar el envío: si la dirección no existe, no se deja
   * cerrar el pedido. Antes se cobraba la tarifa base y el repartidor se
   * enteraba del problema delante del portal.
   */
  useEffect(() => {
    setDistancia(null)
    if (!domicilio) { setDireccion('vacia'); return }
    if (!cpMadrid || datos.direccion.trim().length < 5) { setDireccion('vacia'); return }
    setDireccion('buscando')
    const t = setTimeout(async () => {
      setCalculando(true)
      const res = await calcularEnvio(datos.direccion.trim(), datos.cp.trim())
      setDistancia(res)
      setDireccion(res.estado)      // ok | no | sin-revisar
      setCalculando(false)
    }, 1000)
    return () => clearTimeout(t)
  }, [datos.direccion, datos.cp, domicilio, cpMadrid])

  // Si el cliente escribe él mismo "+..." o "00...", se respeta; si no, se le pone el prefijo elegido.
  const tel = datos.telefono.trim()
  const telefonoCompleto = !tel ? '' : /^(\+|00)/.test(tel) ? tel : `+${datos.prefijo} ${tel}`
  const cifrasTel = tel.replace(/\D/g, '').length
  const telOk = datos.prefijo === '34' && !/^(\+|00)/.test(tel) ? cifrasTel === 9 : cifrasTel >= 6

  // Con productos por encargo, el primer día posible se mueve adelante.
  const minFecha = fechaMinima(carrito)
  const encargo = porEncargoDe(carrito)
  useEffect(() => {
    if (datos.fechaEntrega < minFecha) setDatos((d) => ({ ...d, fechaEntrega: minFecha }))
  }, [minFecha, datos.fechaEntrega])

  /**
   * Los turnos cambian según el día: el viernes la tarde es de 15 a 18 y el
   * sábado hay uno solo. Si el cliente elige la tarde del jueves y luego se
   * cambia al viernes, ese turno ya no existe y hay que soltarlo, o se enviaría
   * un pedido con una hora que la tienda no da.
   */
  const turnos = turnosDe(datos.fechaEntrega)
  useEffect(() => {
    if (datos.franja && !turnosDe(datos.fechaEntrega).some((t) => t.id === datos.franja)) {
      setDatos((d) => ({ ...d, franja: '' }))
    }
  }, [datos.fechaEntrega, datos.franja])

  const envio = domicilio ? (distancia?.tarifa ?? TARIFA_BASE) : 0
  const t = totalesDe(carrito, envio)
  const bandejas = carrito.reduce((s, l) => s + l.cantidad, 0)

  const falta = useMemo(() => {
    if (!carrito.length) return 'Añade al menos un producto'
    if (!datos.fechaEntrega) return 'Elige el día de entrega'
    if (datos.fechaEntrega < minFecha) return `${encargo} necesita 48 h: elige el ${fechaLegible(minFecha)} o un día posterior`
    if (domicilio && sinReparto(datos.fechaEntrega)) return 'Los domingos no repartimos: elige otro día o pásate a recogerlo'
    // Ya no hay "me da igual la hora": o mañana o tarde. Un pedido sin turno no
    // ocupaba hueco en la agenda y acababa descuadrándola.
    if (turnos.length && !datos.franja) return 'Elige si lo quieres por la mañana o por la tarde'
    if (datos.franja && domicilio && huecosEn(agenda, datos.fechaEntrega, datos.franja) <= 0) return 'Ese turno se acaba de llenar: elige el otro'
    if (!datos.nombre.trim()) return 'Escribe tu nombre'
    if (!tel) return 'Escribe tu teléfono'
    if (!telOk) return 'Revisa el teléfono: faltan o sobran números'
    if (domicilio && !datos.direccion.trim()) return 'Escribe la dirección de entrega'
    if (domicilio && !datos.cp.trim()) return 'Escribe el código postal'
    if (domicilio && !cpMadrid) return 'Solo repartimos en Madrid (código postal 28xxx)'
    if (domicilio && direccion === 'buscando') return 'Comprobando la dirección…'
    if (!datos.formaPago) return 'Elige la forma de pago'
    return ''
  }, [carrito, datos, domicilio, cpMadrid, tel, telOk, minFecha, encargo, direccion])

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
      const { nombre, prefijo, telefono, direccion, cp, formaPago } = datos
      localStorage.setItem(CLAVE_DATOS, JSON.stringify({ nombre, prefijo, telefono, direccion, cp, formaPago }))
    } catch { /* en modo privado no se puede guardar; da igual */ }
    /**
     * El pedido entra en la gestión y, acto seguido, se abre WhatsApp con el
     * pedido escrito, como siempre. Si la nube falla o tarda, se sigue a WhatsApp
     * igual: el mensaje es el aviso de verdad y ahí no se pierde el pedido.
     *
     * El plazo es largo (8 s) a propósito. La hoja de Google se mandaba con
     * `keepalive` y terminaba sola aunque la página se fuera; esto no puede, así
     * que al saltar a WhatsApp se cancelaría lo que quedara a medias. Mejor que
     * el botón diga "Preparando…" un momento más que perder el pedido.
     */
    try {
      await conPlazo(registrarEnNube({ ...datos, telefono: telefonoCompleto, codigo }, carrito, envio, distancia), 8000)
    } catch (e) {
      console.error('No se pudo dejar el pedido en la gestión; se sigue a WhatsApp.', e)
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
                  {unidades(l.presentacion)}{l.preparacion ? ` · ${etiquetaPrep(l.preparacion)}` : ''}
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
                {encargo && (
                  <div className="note">
                    ⏳ <strong>{encargo}</strong> se {carrito.filter((l) => l.horasEncargo > 0).length > 1 ? 'hacen' : 'hace'} por
                    encargo, con <strong>48 horas</strong> de antelación. El primer día que podemos
                    es el <strong>{fechaLegible(minFecha)}</strong>.
                  </div>
                )}
                <div className="field">
                  <label htmlFor="fFecha">Día</label>
                  <input id="fFecha" type="date" min={minFecha} value={datos.fechaEntrega} onChange={cambiar('fechaEntrega')} />
                  {minFecha > hoyLocal() && (
                    <span className="hint">El primer día posible es el {fechaLegible(minFecha)}.</span>
                  )}
                </div>
                {domicilio && sinReparto(datos.fechaEntrega) && (
                  <div className="note aviso">
                    Los <strong>domingos no repartimos</strong>. Elige otro día, o pásate
                    a recogerlo por la tienda.
                  </div>
                )}

                {turnos.length > 0 && (
                  <div className="field">
                    <label>¿Mañana o tarde?</label>
                    <div className="franjas">
                      {turnos.map((f) => {
                        const huecos = huecosEn(agenda, datos.fechaEntrega, f.id)
                        const llena = domicilio && huecos <= 0
                        return (
                          <button key={f.id} type="button" disabled={llena}
                            className={`franja-pick${datos.franja === f.id ? ' on' : ''}${llena ? ' llena' : ''}`}
                            onClick={() => poner('franja', f.id)}>
                            <b>{f.nombre}</b>
                            <small>{llena ? 'Completo' : `${f.desde} – ${f.hasta}`}</small>
                          </button>
                        )
                      })}
                    </div>
                    {/* Aquí NO se promete una llamada antes de salir: el repartidor
                        va con la ruta hecha y no se pone a llamar casa por casa. Lo
                        único que se promete es el turno, que es lo que sí se cumple. */}
                    <span className="hint">
                      La entrega se realizará en la franja horaria seleccionada.
                    </span>
                  </div>
                )}
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
                      <>
                        <div className={`envio-box${direccion === 'ok' ? '' : ' pendiente'}`}>
                          <span>
                            {direccion === 'buscando' || calculando ? '📍 Comprobando la dirección…'
                              : direccion === 'ok' ? <>📍 <b>{distancia.km} km</b> hasta tu dirección</>
                              : direccion === 'sin-revisar' || direccion === 'no' ? 'No hemos podido situarla en el mapa; lo confirmamos contigo'
                              : 'Escribe tu dirección para calcular el envío'}
                          </span>
                          {direccion !== 'vacia' && !calculando && <b>{eur(envio)}</b>}
                        </div>
                        {direccion === 'no' && (
                          <p className="hint">
                            Puedes enviar el pedido igualmente: te escribimos por WhatsApp para
                            confirmar la dirección antes de salir. El envío sale a {eur(TARIFA_BASE)};
                            si tu casa queda más lejos, te lo decimos antes de cobrarte.
                          </p>
                        )}
                      </>
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
                  <label htmlFor="fNota">Comentario (opcional)</label>
                  <input id="fNota" value={datos.nota} onChange={cambiar('nota')} placeholder="Timbre 3ºB, es para un cumpleaños…" />
                </div>
              </div>

              <div className="hr" />

              <div className="totals">
                <div><span>Productos ({bandejas} {bandejas === 1 ? 'bandeja' : 'bandejas'})</span><b>{eur(t.productos)}</b></div>
                {t.fritura > 0 && <div><span>Fritura ({t.bandejasFritas} {t.bandejasFritas === 1 ? 'bandeja' : 'bandejas'})</span><b>{eur(t.fritura)}</b></div>}
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
