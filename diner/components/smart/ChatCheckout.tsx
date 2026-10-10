'use client'

import { useState } from 'react'

import { myCount } from '@/lib/domain/cartEvents'
import { freeFromText } from '@/lib/domain/deliveryPricing'
import { setDelivery } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { DeliveryMethod, DeliveryQuote } from '@/lib/types'
import { closedText } from './ClosedBanner'
import { money as formatCop, useSmartRoute } from './SmartMenu'

type Step = 'inicio' | 'nombre' | 'telefono' | 'indicaciones' | 'resumen'
const PAY: Record<DeliveryMethod, string> = { online: 'Pagar en línea', cash: 'Efectivo al recibir', card_on_delivery: 'Datáfono al recibir' }
const phoneOk = (value: string) => /^(?:\+?57)?\s*(?:3\d{2}|60[1-8])[\s-]?\d{3}[\s-]?\d{4}$/.test(value.trim())

// Plan D: el mesero termina el domicilio en la misma conversación, como uno de verdad. Con platos en el pedido y la
// ubicación ya puesta, pide uno a uno el nombre, el teléfono y las indicaciones, muestra el resumen con el envío y el
// total, y lleva al pago (en línea) o manda el pedido a la cocina (contra entrega). Los datos los valida el servidor.
export function ChatCheckout({ onClose }: { onClose: () => void }) {
  const { cart, entry, deliveryDraft } = useDinerStore()
  if (!deliveryDraft || !entry?.domicilio?.enabled || entry.contexto?.mesa || myCount(cart) === 0) return null
  return <CheckoutSteps onClose={onClose} />
}

function CheckoutSteps({ onClose }: { onClose: () => void }) {
  const { session, cart, account, entry, preview, deliveryDraft, confirm } = useDinerStore()
  const { go } = useSmartRoute()
  const [step, setStep] = useState<Step>('inicio')
  const [name, setName] = useState(account?.nombre ?? ''), [phone, setPhone] = useState(account?.celular ?? ''), [details, setDetails] = useState('')
  const [quote, setQuote] = useState<DeliveryQuote | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  if (!deliveryDraft || !entry) return null
  const closed = closedText(entry)

  async function summarize(indicaciones: string) {
    if (!session || !deliveryDraft) return
    setBusy(true); setError('')
    try {
      const r = await setDelivery(session.id, { lat: deliveryDraft.lat, lng: deliveryDraft.lng, direccion: deliveryDraft.direccion || 'Ubicación compartida en el chat',
        indicaciones, telefono: phone.trim(), nombre: name.trim(), guardar: false, acepta_datos: false })
      useDinerStore.setState({ cart: r.carrito })
      setQuote(r.domicilio)
      setStep('resumen')
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos preparar tu domicilio.') }
    finally { setBusy(false) }
  }
  async function pay(method: DeliveryMethod) {
    setBusy(true); setError('')
    try {
      const id = await confirm(false, { notas: '', alergenos: account?.alergenos ?? '', metodo_pago: method })
      if (!id) { setError(useDinerStore.getState().error ?? 'No pudimos confirmar tu pedido.'); return }
      onClose()
      // Contra entrega el pedido ya va a la cocina y se sigue su estado; en línea se paga primero.
      if (method === 'online') go('pago'); else go('estado', id)
    } finally { setBusy(false) }
  }

  const food = (cart?.lineas ?? []).filter((l) => l.mio)
  const subtotal = food.reduce((sum, l) => sum + l.subtotal, 0)
  const short = quote?.minimo && subtotal < quote.minimo ? quote.minimo : 0
  const off = busy || !!preview
  return (
    <div className="sm-chat-turn" data-current="true">
      <div className="sm-chat-bubble"><span className="sr-only">Mesero: </span>
        {step === 'inicio' && <>
          <p>Ya tengo tu ubicación{deliveryDraft.direccion ? <> (<strong>{deliveryDraft.direccion}</strong>)</> : null} y {myCount(cart)} {myCount(cart) === 1 ? 'plato' : 'platos'} en tu pedido. ¿Lo terminamos aquí?</p>
          {closed ? <p className="sm-note">{closed}</p>
            : <div className="sm-chat-choices"><button type="button" disabled={off} onClick={() => setStep('nombre')}>🛵 Terminar mi domicilio aquí</button></div>}
        </>}
        {step === 'nombre' && <form className="sm-chat-checkout" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) setStep('telefono') }}>
          <label className="sm-field"><span>¿A nombre de quién va el pedido?</span>
            <input autoFocus value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} /></label>
          <button type="submit" className="sm-primary" disabled={off || name.trim().length < 2}>Seguir</button>
        </form>}
        {step === 'telefono' && <form className="sm-chat-checkout" onSubmit={(e) => { e.preventDefault(); if (phoneOk(phone)) setStep('indicaciones') }}>
          <label className="sm-field"><span>¿A qué número te llamamos si el domiciliario lo necesita?</span>
            <input autoFocus type="tel" inputMode="tel" value={phone} maxLength={20} autoComplete="tel" placeholder="300 123 4567" onChange={(e) => setPhone(e.target.value)} /></label>
          {phone.trim() && !phoneOk(phone) && <p className="sm-note">Escribe un celular colombiano de 10 dígitos.</p>}
          <button type="submit" className="sm-primary" disabled={off || !phoneOk(phone)}>Seguir</button>
        </form>}
        {step === 'indicaciones' && <form className="sm-chat-checkout" onSubmit={(e) => { e.preventDefault(); void summarize(details.trim()) }}>
          <label className="sm-field"><span>¿Alguna indicación para llegar? Por ejemplo, torre, apartamento o portería.</span>
            <input autoFocus value={details} maxLength={200} onChange={(e) => setDetails(e.target.value)} /></label>
          <div className="sm-chat-choices">
            <button type="submit" disabled={off || !details.trim()}>{busy ? 'Calculando…' : 'Seguir'}</button>
            <button type="button" disabled={off} onClick={() => { setDetails(''); void summarize('') }}>Sin indicaciones</button>
          </div>
        </form>}
        {step === 'resumen' && quote && cart && <div className="sm-delivery-quote" role="status">
          <p>Este es tu pedido para <strong>{[quote.direccion, quote.indicaciones].filter(Boolean).join(' · ')}</strong>, a nombre de {quote.nombre}:</p>
          <ul className="sm-chat-checkout-lines">{food.map((l) => <li key={l.id}><span>{l.cantidad} × {l.nombre}</span><strong>{formatCop(l.subtotal)}</strong></li>)}</ul>
          {!!quote.recargo && <p className="sm-note">Precios para domicilio (+{quote.recargo} %).</p>}
          <p>Envío: <strong>{cart.envio ? formatCop(cart.envio) : 'gratis'}</strong></p>
          {freeFromText(quote.gratis_desde, subtotal, formatCop) && <p className="sm-note">{freeFromText(quote.gratis_desde, subtotal, formatCop)}</p>}
          <p><strong>Total: {formatCop(cart.total)}</strong></p>
          {short ? <p className="sm-note">El pedido mínimo para domicilio es de {formatCop(short)} en platos. Agrega algo más para seguir.</p>
            : <><p>¿Cómo quieres pagar?</p>
              <div className="sm-chat-choices" aria-label="¿Cómo quieres pagar?">{quote.metodos.map((m) => <button type="button" key={m} disabled={off} onClick={() => void pay(m)}>{PAY[m]}</button>)}</div></>}
          <button type="button" className="sm-text-button" disabled={off} onClick={() => setStep('nombre')}>Cambiar mis datos</button>
        </div>}
        {error && <p className="sm-error" role="alert">{error}</p>}
      </div>
    </div>
  )
}
