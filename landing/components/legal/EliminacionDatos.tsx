// Generado desde design/legal/data-deletion.html (copia de projectapp.co/es-co/waiter/data-deletion) con
// scripts/legal2jsx.py: no editar a mano, regenerar.
import Link from 'next/link'

// Cómo pedir la eliminación de tus datos
export function EliminacionDatos() {
  return (
    <article className="legal-doc">
      <h1 className="legal-h1">Cómo pedir la eliminación de tus datos</h1>
      <p className="legal-fecha">Última actualización: 7 de octubre de 2026.</p>
      <section id="comensales" className="legal-seccion">
        <h2 className="legal-h2">Si usaste Waiter como cliente de un restaurante</h2>
        <p className="legal-p">Aplica si usaste el menú digital, hiciste reservas o le escribiste a un restaurante por WhatsApp.</p>
        <ol className="legal-lista legal-lista-numerada">
          <li>Escribe a <a className="legal-a" href="mailto:team@projectapp.co">team@projectapp.co</a> con el asunto <strong>«Eliminar mis datos»</strong>.</li>
          <li>Indica:<ul className="legal-lista legal-lista-anidada">
            <li>el nombre del restaurante;</li>
            <li>el correo o el número de WhatsApp con el que lo usaste;</li>
            <li>si quieres eliminar todo o solo algo, por ejemplo la conversación con el asistente.</li>
          </ul></li>
          <li>Te pediremos confirmar que eres tú con un código enviado a ese mismo correo o número.</li>
          <li>En un plazo máximo de <strong>15 días hábiles</strong> eliminamos o anonimizamos:<ul className="legal-lista legal-lista-anidada">
            <li>tu cuenta del menú;</li>
            <li>tus conversaciones con el asistente y por WhatsApp;</li>
            <li>tus datos de contacto en los clientes del restaurante;</li>
            <li>tus favoritos y preferencias.</li>
          </ul></li>
          <li>Te enviamos una confirmación con un código de solicitud.</li>
        </ol>
        <p className="legal-p"><strong>Lo que conservamos por obligación legal:</strong> los pedidos, pagos y facturas que la ley obliga a guardar, sin tu nombre ni tus datos de contacto cuando eso sea posible.</p>
      </section>
      <section id="whatsapp" className="legal-seccion">
        <h2 className="legal-h2">Si dejaste de escribirle a un restaurante por WhatsApp</h2>
        <ul className="legal-lista">
          <li>puedes bloquear su número en WhatsApp para no recibir más mensajes;</li>
          <li>para borrar lo que ya enviaste, sigue los pasos de arriba.</li>
        </ul>
      </section>
      <section id="restaurantes" className="legal-seccion">
        <h2 className="legal-h2">Si eres un restaurante</h2>
        <p className="legal-p">Puedes desconectar WhatsApp desde tu consola de Waiter y pedir la eliminación de la información de tu cuenta escribiendo a <a className="legal-a" href="mailto:team@projectapp.co">team@projectapp.co</a>.</p>
      </section>
      <section id="dudas" className="legal-seccion">
        <h2 className="legal-h2">¿Dudas?</h2>
        <p className="legal-p"><a className="legal-a" href="mailto:team@projectapp.co">team@projectapp.co</a> · <a className="legal-a" href="tel:+573238122373">+57 323 812 2373</a>. Consulta también la <Link className="legal-a" href="/privacy">política de privacidad de Waiter</Link>.</p>
      </section>
      <div className="legal-volver">
        <Link className="legal-volver-enlace" href="/"><span className="legal-flecha" aria-hidden="true">←</span> Volver a Waiter</Link>
      </div>
    </article>
  )
}
