/**
 * La tienda cerrada.
 *
 * Esto es lo ÚNICO que ve el cliente mientras el dueño tenga la tienda cerrada
 * desde la gestión: ni catálogo, ni carrito, ni forma de hacer un pedido. Se
 * cierra cuando la producción no da abasto, que es peor que no vender: un
 * pedido aceptado y no entregado se paga más caro que uno no hecho.
 *
 * No lleva nada de Firebase ni estado: lo que se enseña lo decide Tienda.jsx,
 * que es quien lee el ajuste antes de pintar nada.
 */
import './tienda.css'

export const MENSAJE_POR_DEFECTO =
  'Estamos preparando todos los pedidos que nos habéis hecho. ' +
  'Volvemos a abrir muy pronto. ¡Gracias por la paciencia!'

export default function Mantenimiento({ mensaje }) {
  return (
    <div className="dps">
      <div className="mant">
        <img className="mant-logo" src="/logo-donpepe.png" alt="Don Pepe Sabor" />
        <p className="mant-marca">Don Pepe <span>Sabor</span></p>
        <h1 className="mant-titulo">Volvemos enseguida</h1>
        <p className="mant-texto">{mensaje?.trim() || MENSAJE_POR_DEFECTO}</p>
        <div className="mant-sep" />
        <p className="mant-pie">
          Si tienes un pedido en marcha o necesitas algo, escríbenos por WhatsApp
          al <a href="https://wa.me/34604136371">604 136 371</a>.
        </p>
      </div>
    </div>
  )
}
