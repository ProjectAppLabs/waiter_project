'use client'

import { freeFromText } from '@/lib/domain/deliveryPricing'
import type { Cart, DeliveryMethod, DeliveryQuote } from '@/lib/types'
import { METHOD_LABEL } from './DeliverySheet'
import { Icon, money } from './SmartMenu'

// Plan D: el segundo paso del domicilio. Antes de pagar se confirma a dónde va (con «Cambiar» para corregirla) y se ve
// el detalle de lo que se paga: platos, envío (gratis o cuánto falta para que lo sea) y total, con el medio de pago.
export function DeliveryReview({ cart, quote, method, onMethod, onBack, onConfirm, sending, blocked, error }: {
  cart: Cart; quote: DeliveryQuote; method: DeliveryMethod | null; onMethod: (m: DeliveryMethod) => void
  onBack: () => void; onConfirm: () => void; sending: boolean; blocked: boolean; error?: string | null
}) {
  const lines = cart.lineas.filter((l) => l.mio)
  const food = lines.reduce((sum, l) => sum + l.subtotal, 0)
  const fee = cart.envio ?? 0
  const total = food + fee
  const short = !!quote.minimo && food < quote.minimo
  const free = freeFromText(quote.gratis_desde, food, money)
  return (
    <section className="sm-delivery-review" aria-label="Revisa y paga">
      <div className="sm-delivery-quote">
        <p className="sm-review-label">¿Es correcta la dirección?</p>
        <p><strong>{quote.direccion}</strong>{quote.indicaciones ? ` · ${quote.indicaciones}` : ''}</p>
        <p>{quote.nombre} · {quote.telefono.replace(/^\+57/, '')}</p>
        <p>Te lo lleva {quote.sede.nombre} · {quote.distancia_km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km</p>
        <button type="button" className="sm-text-button" disabled={sending} onClick={onBack}><Icon name="back" />Cambiar dirección o datos</button>
      </div>
      <h3>Lo que vas a pagar</h3>
      <ul className="sm-review-lines">{lines.map((l) => <li key={l.id}><span>{l.cantidad} × {l.nombre}</span><strong>{money(l.subtotal)}</strong></li>)}</ul>
      {!!quote.recargo && <p className="sm-note">Precios para domicilio (+{quote.recargo} %).</p>}
      <dl className="sm-review-totals">
        <div><dt>Platos</dt><dd>{money(food)}</dd></div>
        <div><dt>Envío</dt><dd>{fee ? money(fee) : 'Gratis'}</dd></div>
        <div className="sm-review-total"><dt>Total</dt><dd>{money(total)}</dd></div>
      </dl>
      {free && <p className="sm-note">{free}</p>}
      {quote.nota && <p className="sm-note">{quote.nota}</p>}
      {quote.sugerida && <p className="sm-note">La sede {quote.sugerida.nombre} te queda más cerca. Puedes pedir desde su menú para un envío más rápido.</p>}
      {short ? <p className="sm-error" role="alert">El pedido mínimo para domicilio es de {money(quote.minimo ?? 0)} en platos. Agrega algo más para seguir.</p>
        : <fieldset className="sm-delivery-methods"><legend>¿Cómo quieres pagar?</legend>
          {quote.metodos.map((m) => <label key={m} className="sm-check"><input type="radio" name="metodo" checked={method === m} disabled={sending} onChange={() => onMethod(m)} /><span>{METHOD_LABEL[m]}</span></label>)}
        </fieldset>}
      {error && <p className="sm-error" role="alert">{error}</p>}
      <button type="button" className="sm-primary" disabled={sending || blocked || short || !method} onClick={onConfirm}>
        {sending ? 'Preparando…' : method === 'online' ? `Pagar ${money(total)}` : method ? 'Confirmar pedido' : 'Escoge cómo pagar'}<Icon name="arrow" /></button>
    </section>
  )
}
