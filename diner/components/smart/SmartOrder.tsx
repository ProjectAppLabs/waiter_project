'use client'
/* eslint-disable @next/next/no-img-element -- Original local status illustrations. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { DeliverySheet } from './DeliverySheet'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import {CouponField,PaidCelebration} from './SmartBenefits'
import {SmartWallet} from './SmartWallet'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Cart, CartLine, DeliveryMethod, DeliveryQuote, Dish, OrderState, OrderStatus, PayMethod, PayScope } from '@/lib/types'
import { Plantilla } from '@/components/plantillas/Renderizador'
import { usePlantilla } from '@/components/plantillas/usePlantilla'
import { closedText } from './ClosedBanner'
import type { TemplateData } from '@/lib/domain/plantillas'
import {
  Empty,
  FoodPhoto,
  Icon,
  money,
  Title,
  useSmartRoute,
} from './SmartMenu'

export function SmartCart({ actionTarget }: { actionTarget?: HTMLElement | null } = {}) {
  const { cart, entry, account, busy, setQty, remove, confirm, refreshCart } =
    useDinerStore()
  // Plan D: sin mesa (la entrada de la sede) se recoge en el local o se pide a domicilio.
  const noTable = !!entry && !entry.contexto?.mesa
  const draft = useDinerStore((s) => s.deliveryDraft)
  // Si compartió la ubicación en el chat, el pedido arranca en domicilio hasta que escoja otra cosa.
  const [choice, setDeliveryMode] = useState<boolean | null>(null)
  const delivery = choice ?? (!!draft && noTable && !!entry?.domicilio?.enabled)
  // Llegó de otra sede con su pedido mientras pagaba: se reabre la confirmación en domicilio, con su dirección puesta.
  const reopen = useDinerStore((s) => s.reopenDelivery)
  useEffect(() => {
    if (!reopen || !cart?.lineas.length) return
    useDinerStore.setState({ reopenDelivery: false })
    if (!modeDialog.current?.open) modeDialog.current?.showModal()
  }, [reopen, cart?.lineas.length])
  const [ready, setReady] = useState<{ quote: DeliveryQuote | null; method: DeliveryMethod | null }>({ quote: null, method: null })
  const onReady = useCallback((quote: DeliveryQuote | null, method: DeliveryMethod | null) => setReady({ quote, method }), [])
  const { go, href } = useSmartRoute()
  const [sending, setSending] = useState(false)
  const [takeaway,setTakeaway] = useState(false)
  const [notes,setNotes] = useState('')
  const [allergens,setAllergens] = useState(account?.alergenos || '')
  const modeDialog = useRef<HTMLDialogElement>(null)
  const [swiped,setSwiped] = useState<number|null>(null)
  const lock = useRef(false)
  const send = async () => {
    if (lock.current) return
    lock.current = true
    setSending(true)
    try {
      if (delivery && (!ready.quote || !ready.method)) return
      const id = await confirm(delivery ? false : noTable ? true : takeaway, {notas:notes.trim(), alergenos:allergens.trim(), ...(delivery && ready.method ? {metodo_pago: ready.method} : {})})
      // Contra entrega el pedido ya va a cocina: se sigue su estado; en línea se paga primero.
      if (id) {modeDialog.current?.close(); if (delivery && ready.method !== 'online') go('estado', id); else go('pago')}
    } finally {
      lock.current = false
      setSending(false)
    }
  }
  // Fuera del horario de la sede no se confirma (el servidor también lo impide); el aviso de arriba dice cuándo abre.
  const closed = !!closedText(entry)
  const confirmAction = (
    <div className="sm-cart-submit"><button
              className="sm-primary"
              disabled={busy || sending || closed}
              onClick={() => {setAllergens(account?.alergenos || '');modeDialog.current?.showModal()}}
            >
              {sending ? 'Preparando pago…' : 'Continuar al pago'}
              {!actionTarget && <Icon name="arrow" />}
            </button></div>
  )
  const dishes = entry?.carta.categorias.flatMap((c) => c.productos) ?? []
  if (!cart)
    return (
      <Empty
        title="Cargando tu pedido"
        action="Actualizar"
        onAction={() => void refreshCart()}
      />
    )
  return (
    <>
      <Title
        title="Tu pedido"
        sub="Un antojo está a punto de hacerse realidad"
      />
      <dialog className="sm-filter-dialog sm-fulfillment-dialog" ref={modeDialog}>
        <button className="sm-icon" aria-label="Cerrar modalidad del pedido" disabled={sending} onClick={()=>modeDialog.current?.close()}><Icon name="close"/></button>
        <h2>{noTable ? '¿Cómo quieres recibirlo?' : '¿Dónde vas a disfrutarlo?'}</h2><p>{delivery ? 'Comparte tu ubicación y te decimos cuánto vale el envío.' : 'Enviaremos tus platos a cocina después de confirmar el pago.'}</p>
        {noTable
          ? <div className="sm-home-options"><button aria-pressed={!delivery} disabled={sending} className="sm-fulfillment-option" onClick={()=>{setDeliveryMode(false);setTakeaway(true)}}><Icon name="bag"/><span>Recoger en el local</span></button>{entry?.domicilio?.enabled && <button aria-pressed={delivery} disabled={sending} className="sm-fulfillment-option" onClick={()=>{setDeliveryMode(true);setTakeaway(false)}}><Icon name="pin"/><span>A domicilio</span></button>}</div>
          : <div className="sm-home-options"><button aria-pressed={!takeaway} disabled={sending} className="sm-fulfillment-option" onClick={()=>setTakeaway(false)}><Icon name="cutlery"/><span>Comer aquí</span></button><button aria-pressed={takeaway} disabled={sending} className="sm-fulfillment-option" onClick={()=>setTakeaway(true)}><Icon name="bag"/><span>Para llevar</span></button></div>}
        {delivery && <DeliverySheet onReady={onReady} disabled={sending} />}
<div className="sm-order-details"><h3>¿Alguna nota o alergia?</h3><label className="sm-field"><span>Notas para tus platos (opcional)</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={500} rows={2} disabled={sending} placeholder="Por ejemplo: la salsa aparte"/></label><label className="sm-field"><span>Alergias y alérgenos (opcional)</span><textarea value={allergens} onChange={e=>setAllergens(e.target.value)} maxLength={500} rows={2} disabled={sending} placeholder="Indica lo que debe saber la cocina"/></label><p className="sm-note">Se enviarán con tus platos. Confirma con el personal que puedan atender tu alergia.</p></div>
        <button className="sm-primary" disabled={busy||sending||closed||(delivery&&(!ready.quote||!ready.method))} onClick={()=>void send()}>{sending?'Preparando…':delivery&&ready.method&&ready.method!=='online'?'Confirmar domicilio':'Continuar al pago'}<Icon name="arrow"/></button>
      </dialog>
      {cart.lineas.length ? (
        <div className="sm-checkout-layout">
          <OrderSummary cart={cart}
            lineas={<section className="sm-cart-lines" aria-label="Lo que pediste">
              {cart.lineas.map((line) => {
                const dish = dishes.find((d) => d.id === line.producto_id)
                return (
                  <CartLineItem key={line.id} line={line} dish={dish} swiped={swiped===line.id} onSwipe={(id)=>setSwiped(id)} busy={busy||sending} setQty={setQty} remove={remove} />
                )
              })}
              <Link href={href('carta')} className="sm-text-button sm-cart-more">
                <Icon name="plus" />
                Agregar algo más
              </Link>
            </section>}
            confirmar={actionTarget ? createPortal(confirmAction, actionTarget) : confirmAction}
            pago={<button className="sm-text-button" disabled={busy || sending} onClick={() => go('pago')}>Ver opciones de pago</button>} />
        </div>
      ) : (
        <Empty
          icon="bag"
          title="Tu pedido está por empezar"
          action="Explorar el menú"
          onAction={() => go('carta')}
        >
          Encuentra algo delicioso y agrégalo aquí.
        </Empty>
      )}
    </>
  )
}
const labels: Record<OrderState, string> = {
  pendiente_pago: 'Tu pedido espera el pago',
  enviado: 'Recibimos tu pedido',
  en_cocina: 'Ya estamos cocinando',
  listo: 'Tu pedido está listo',
  servido: '¡Buen provecho!',
  pagado: 'Gracias por tu visita',
  fallido: 'No pudimos enviar tu pedido',
}
const hints: Record<OrderState, string> = {
  pendiente_pago: 'La cocina recibirá tus platos cuando se confirme el pago.',
  enviado: 'La cocina recibió tu comanda. Pronto comenzaremos a prepararla.',
  en_cocina: 'Estamos preparando tus platos con todo el cuidado.',
  listo: 'Estamos listos para llevarlo a tu mesa.',
  servido: 'Disfruta cada bocado. Estamos aquí si necesitas algo más.',
  pagado: 'Tu cuenta fue cerrada en el restaurante.',
  fallido:
    'Tu carrito sigue guardado. Vuelve al pedido para intentarlo de nuevo.',
}
const steps: OrderState[] = ['enviado', 'en_cocina', 'listo', 'servido']
export function SmartStatus({ id }: { id: string | null }) {
  const {
    order: stored,
    refreshOrder,
    call,
    entry,
    busy,
    error,
  } = useDinerStore()
  const { go } = useSmartRoute()
  const [called, setCalled] = useState(false)
  const order = stored?.id === id ? stored : null
  const settled =
    !!order && ['pagado', 'fallido'].includes(order.estado)
  useEffect(() => {
    if (!id) return
    void refreshOrder(id)
    if (settled) return
    const timer = setInterval(() => {
      void refreshOrder(id)
    }, 8000)
    return () => clearInterval(timer)
  }, [id, settled, refreshOrder])
  if (!order)
    return (
      <Empty
        icon="clock"
        title={error ? 'No pudimos cargar el pedido' : 'Consultando tu pedido'}
        action="Ver mis pedidos"
        onAction={() => go('historial')}
      />
    )
  const current = order.estado === 'pagado' ? 4 : steps.indexOf(order.estado)
  return (
    <>
      {order.estado==='pagado'?<PaidCelebration order={order}/>:<Title title="Sigue tu pedido" back="historial" />}
      <section className="sm-status sm-exporty-status" hidden={order.estado==='pagado'}>
        <StatusCard order={order} current={current} />
        <details className="sm-status-details">
          <summary>Tu pedido y sus precios<span>⌄</span></summary>
          <p>{hints[order.estado]}</p>
          <p className="sm-eyebrow">Pedido #{order.id.slice(0,8)}</p>
          {!!order.lineas?.length && <div className="sm-receipt-lines">{order.lineas.map((line,i)=><div key={i}><FoodPhoto dish={entry?.carta.categorias.flatMap(c=>c.productos).find(d=>d.id===line.producto_id)||{id:line.producto_id,nombre:line.nombre,precio:line.precio,agotado:false,categorias:[]}}/><span><strong>{line.nombre}</strong><small>{line.cantidad} unidades</small></span><strong>{money(line.precio*line.cantidad)}</strong></div>)}</div>}
          {!['fallido','pendiente_pago'].includes(order.estado) && <ol className="sm-timeline">{steps.map((s,i) => <li key={s} aria-current={order.estado === s ? 'step' : undefined} data-done={i <= current}><span>{i < current ? <Icon name="check"/> : i + 1}</span><p>{['Recibido','En preparación','Listo','Entregado'][i]}</p></li>)}</ol>}
          <div className="sm-receipt-total"><span>Impuestos incluidos</span><strong>{money(order.impuestos)}</strong></div>
          <div className="sm-receipt-total"><span>Total del pedido</span><strong>{money(order.total)}</strong></div>
        </details>
        <button
          className="sm-primary"
          onClick={() => go(order.estado === 'pendiente_pago' ? 'pago' : order.estado === 'fallido' ? 'pedido' : order.estado === 'servido' ? 'pago' : 'carta')}
        >
          {order.estado === 'pendiente_pago' ? 'Continuar al pago' : order.estado === 'fallido' ? 'Reintentar envío' : order.estado === 'servido' ? 'Ver opciones de pago' : 'Volver al menú'}
          <Icon name="arrow" />
        </button>
        {entry?.contexto.mesa && order.estado !== 'pagado' && (
          <button className="sm-secondary" onClick={() => go('la-cuenta')}>
            Pedir la cuenta
          </button>
        )}
        {entry?.contexto.mesa && (
          <button
            className="sm-text-button"
            disabled={busy || called}
            onClick={async () => {
              if (await call()) setCalled(true)
            }}
          >
            {called ? 'El mesero está avisado' : 'Llamar al mesero'}
          </button>
        )}
      </section>
    </>
  )
}
export function SmartBill() {
  const { askBill, bill, busy, entry } = useDinerStore()
  const { go } = useSmartRoute()
  const [mode, setMode] = useState<'all' | 'mine' | 'split'>('all')
  const [parts, setParts] = useState(2)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    void askBill().finally(() => setLoaded(true))
  }, [askBill])
  if (!loaded) return <Empty icon="clock" title="Consultando tu cuenta" />
  if (!bill?.total)
    return (
      <Empty
        title="No hay consumo por cobrar"
        action="Ver el menú"
        onAction={() => go('carta')}
      />
    )
  const amount =
    mode === 'mine'
      ? bill.mio
      : mode === 'split'
        ? Math.round(bill.total / parts)
        : bill.total
  return (
    <>
      <Title title="La cuenta, por favor" back="historial" />
      <section className="sm-summary sm-narrow">
        <h2>¿Cómo quieres repartirla?</h2>
        <div className="sm-segmented">
          {(['all', 'mine', 'split'] as const).map((m, i) => (
            <button
              key={m}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {['Toda la mesa', 'Lo mío', 'Dividir'][i]}
            </button>
          ))}
        </div>
        {mode === 'split' && (
          <label className="sm-field">
            <span>Número de personas</span>
            <input
              type="number"
              min={2}
              max={20}
              value={parts}
              onChange={(e) =>
                setParts(Math.min(20, Math.max(2, Number(e.target.value) || 2)))
              }
            />
          </label>
        )}
        <div className="sm-total">
          <span>{mode === 'split' ? 'Por persona' : 'Total'}</span>
          <strong>{money(amount)}</strong>
        </div>
        <p>
          Impuestos incluidos. El pago se realiza con el personal del
          restaurante.
        </p>
        {entry?.contexto.mesa && (
          <p role="status" className="sm-note">
            {bill.ok
              ? 'Avisamos al mesero que deseas pagar.'
              : 'No pudimos avisar al mesero.'}
          </p>
        )}
        {!bill.ok && entry?.contexto.mesa && (
          <button
            disabled={busy}
            className="sm-secondary"
            onClick={() => void askBill()}
          >
            Volver a avisar
          </button>
        )}
        <button className="sm-primary" onClick={() => go('carta')}>
          Volver al menú
        </button>
      </section>
    </>
  )
}
const methods: { id: PayMethod; name: string; hint: string }[] = [
  { id: 'tarjeta', name: 'Tarjeta', hint: 'Crédito o débito' },
  { id: 'pse', name: 'PSE', hint: 'Transferencia bancaria' },
  { id: 'nequi', name: 'Nequi', hint: 'Billetera digital' },
]
export function SmartDemoPay() {
  const {
    bill,
    refreshBill,
    simulatePay,
    resetPay,
    payState,
    payResult,
    confirm,
    entry,
    busy,
  } = useDinerStore()
  const { go } = useSmartRoute()
  const [method, setMethod] = useState<PayMethod>('tarjeta'),
    [scope, setScope] = useState<PayScope>('all'),
    [quoted, setQuoted] = useState(false)
  const lock = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    void refreshBill().finally(() => setQuoted(true))
    return resetPay
  }, [refreshBill, resetPay])
  const tablePay = async () => {
    if (lock.current) return
    lock.current = true
    setSubmitting(true)
    try {
      const id = await confirm()
      if (id) go('la-cuenta')
    } finally {
      lock.current = false
      setSubmitting(false)
    }
  }
  if (payState === 'paid')
    return (
      <>
        <Title title="Resultado de la prueba" />
        <section className="sm-journey sm-intro"><div className="sm-orbit-hero"><img src="/smart-menu/payment.png" alt=""/></div><h1>Simulación completada</h1><p>No se ha cobrado dinero ni cerrado la cuenta del restaurante.</p><p className="sm-footnote">Referencia: {payResult?.referencia}</p><div className="sm-journey-footer"><button className="sm-primary" onClick={()=>go('historial')}>Ver mis pedidos<Icon name="arrow"/></button><button className="sm-secondary" onClick={()=>go('recompensas')}>Mis recompensas</button></div></section>
      </>
    )
  const total =
    payResult?.monto ??
    (bill?.total ?? 0)
  const due = scope === 'mine' ? bill?.mio ?? 0 : total
  return <><Title title="Finalizar pedido" back="pedido"/><section className="sm-checkout sm-narrow">
    {method==='tarjeta'&&<SmartWallet embedded/>}
    <details className="sm-checkout-options"><summary>Opciones del pago de prueba</summary><p>El cupón se aplica a tus platos por confirmar y sustituye el descuento de primera compra.</p><div className="sm-payment-methods">{methods.map(m=><label key={m.id}><input type="radio" name="method" value={m.id} checked={method===m.id} onChange={()=>setMethod(m.id)} disabled={payState==='authorizing'}/><span><strong>{m.name}</strong><small>{m.hint}</small></span></label>)}</div>{entry?.contexto.mesa&&<div className="sm-segmented">{(['all','mine'] as const).map(s=><button key={s} aria-pressed={scope===s} onClick={()=>setScope(s)} disabled={payState==='authorizing'}>{s==='all'?'Toda la mesa':'Mi consumo'}</button>)}</div>}</details>
    <div className="sm-checkout-prices"><dl><div><dt>Consumo</dt><dd>{money(due+(bill?.descuento?.monto??0))}</dd></div><div><dt>Impuestos</dt><dd>Incluidos</dd></div></dl><CouponField/><div className="sm-checkout-tip"><span aria-hidden="true">◉</span><span>Propina</span><small>Elige al pagar en el POS</small></div><dl><div><dt>Subtotal</dt><dd>{money(due+(bill?.descuento?.monto??0))}</dd></div><div><dt>Descuento</dt><dd>− {money(bill?.descuento?.monto??0)}</dd></div><div className="sm-checkout-grand"><dt>Total</dt><dd>{money(due)}</dd></div></dl></div>
    <div className="sm-checkout-footer"><button className="sm-primary" disabled={!quoted||!bill||due<=0||busy||payState==='authorizing'} onClick={()=>void simulatePay(method,scope)}>{payState==='authorizing'?'Procesando…':`Simular pago ${money(due)}`}</button><p className="sm-footnote">Prueba sin cobro. El pago real se registra en el POS.</p>{entry?.contexto.mesa&&<button className="sm-text-button" disabled={submitting||busy} onClick={()=>void tablePay()}>{submitting?'Confirmando…':'Pagar con el mesero'}</button>}{payState==='declined'&&<p className="sm-error" role="alert">La simulación fue rechazada. Intenta otra vez.</p>}</div>
  </section></>
}

export { SmartOnlinePay as SmartPay } from './SmartOnlinePay'

// ---- Plan K5: componentes plantillables del pedido ----------------------------------------------------------------
// Datos que una plantilla de la línea puede enlazar (contrato «linea-pedido»).
export function cartLineTemplateData(line: CartLine): TemplateData {
  return { 'linea.nombre': line.nombre, 'linea.subtotal': line.subtotal, 'linea.precio': line.precio, 'linea.cantidad': line.cantidad,
    'linea.mia': line.mio, 'linea.comensal': line.mio ? 'Para ti' : `Comensal ${line.comensal.slice(0, 6)}`, 'linea.nota': line.nota || null }
}
// Una línea del carrito: la raíz y el gesto de deslizar para eliminar son del código; dentro, la plantilla o el diseño de fábrica.
export function CartLineItem({ line, dish, swiped, onSwipe, busy, setQty, remove }: { line: CartLine; dish?: Dish; swiped: boolean; onSwipe: (id: number | null) => void; busy: boolean; setQty: (lineId: number, qty: number) => Promise<void>; remove: (lineId: number) => Promise<void> }) {
  const { arbol, marker } = usePlantilla('linea-pedido')
  const pointer = useRef<{x:number;y:number}|null>(null)
  const controles = <div className="sm-line-controls">{line.mio ? (<><div className="sm-stepper"><button disabled={busy || line.cantidad <= 1} aria-label={`Menos ${line.nombre}`} onClick={() => void setQty(line.id, line.cantidad - 1)}><Icon name="minus" /></button><output>{line.cantidad}</output><button disabled={busy || line.cantidad >= 99} aria-label={`Más ${line.nombre}`} onClick={() => void setQty(line.id, line.cantidad + 1)}><Icon name="plus" /></button></div><button disabled={busy} className="sm-text-button" aria-label={`Eliminar ${line.nombre}`} onClick={() => void remove(line.id)}>Eliminar</button></>) : (<span>{line.cantidad} unidades</span>)}</div>
  const foto = dish ? <FoodPhoto dish={dish} /> : null
  const info = <div className="sm-cart-line-info"><h2><span className="sm-cart-line-qty">{line.cantidad}×</span> {line.nombre}</h2><strong>{money(line.subtotal)}</strong><p>{line.mio ? 'Para ti' : `Comensal ${line.comensal.slice(0, 6)}`}{line.nota && ` · ${line.nota}`}</p>{controles}</div>
  // En el resumen lo pedido va en texto: la foto solo aparece si una plantilla usa su ranura.
  const factory = info
  return (
    <article className="sm-cart-line" data-swiped={swiped} {...marker} onPointerDown={e=>{if(line.mio && !(e.target as HTMLElement).closest('button'))pointer.current={x:e.clientX,y:e.clientY}}} onPointerCancel={()=>{pointer.current=null}} onPointerUp={e=>{if(pointer.current){const dx=e.clientX-pointer.current.x,dy=e.clientY-pointer.current.y;if(Math.abs(dy)<40 && Math.abs(dx)>60)onSwipe(dx<0?line.id:null);pointer.current=null}}}>
      {swiped && <button className="sm-swipe-delete" aria-label={`Confirmar eliminación de ${line.nombre}`} disabled={busy} onClick={()=>void remove(line.id)}><Icon name="close"/>Eliminar</button>}
      {arbol ? <Plantilla arbol={arbol} datos={cartLineTemplateData(line)} ranuras={{ foto, info, controles }} fallback={factory} /> : factory}
    </article>
  )
}

const STATUS_TEXT: Record<OrderState, string> = { pendiente_pago: 'Pendiente de pago', enviado: 'Esperando preparación', en_cocina: 'En preparación', listo: 'En camino a tu mesa', servido: 'Disfruta tu comida', pagado: 'Cuenta cerrada', fallido: 'Intenta nuevamente' }
// Datos que una plantilla de la tarjeta de estado puede enlazar (contrato «tarjeta-estado»).
export function statusTemplateData(order: OrderStatus): TemplateData {
  return { 'estado.titulo': labels[order.estado], 'estado.texto': STATUS_TEXT[order.estado], 'estado.codigo': order.estado, 'estado.fallido': order.estado === 'fallido' }
}
export function StatusCard({ order, current }: { order: OrderStatus; current: number }) {
  const { arbol, marker } = usePlantilla('tarjeta-estado')
  const titulo = <h2>{labels[order.estado]}</h2>
  const texto = <strong>{STATUS_TEXT[order.estado]}</strong>
  const arte = <div className="sm-status-art">
    {order.estado === 'fallido' ? <Icon name="close"/> : <img src={`/smart-menu/${current >= 3 ? 'served' : current === 2 ? 'ready' : 'preparing'}.png`} alt=""/>}
    <span/><span/>
  </div>
  const factory = <>{titulo}{texto}{arte}</>
  return (
    <div className="sm-status-card" role="status" aria-live="polite" {...marker}>
      {arbol ? <Plantilla arbol={arbol} datos={statusTemplateData(order)} ranuras={{ titulo, texto, arte }} fallback={factory} /> : factory}
    </div>
  )
}

// Datos que una plantilla del resumen puede enlazar (contrato «resumen»).
export function orderSummaryTemplateData(cart: Cart) {
  const monto = cart.descuento?.monto ?? 0
  return { 'pedido.subtotal': cart.total, 'pedido.consumo': cart.mio, 'pedido.descuento': !!monto, 'pedido.descuento.porcentaje': cart.descuento?.porcentaje ?? 0,
    'pedido.descuento.monto': monto, 'pedido.total': Math.max(0, cart.total - monto) }
}

// Plan K, paquete D: la única tarjeta del pedido. Lo pedido va dentro, en texto (ranura «lineas»), antes del cupón y los
// totales. Las líneas, el cupón, confirmar y el enlace al pago son del código.
export function OrderSummary({ cart, lineas, confirmar, pago }: { cart: Cart; lineas: ReactNode; confirmar: ReactNode; pago: ReactNode }) {
  const { arbol, marker } = usePlantilla('resumen')
  const cupon = <CouponField />
  const titulo = <h2>Resumen del pedido</h2>
  const filas = <>
    {cart.domicilio ? <>
      {/* Plan D: en un domicilio el total ya incluye el envío; se muestra aparte para que se entienda. */}
      <div><span>Tus platos</span><strong>{money(cart.total - (cart.envio ?? 0))}</strong></div>
      <div><span>Envío a domicilio</span><strong>{money(cart.envio ?? 0)}</strong></div>
    </> : <>
      <div><span>Subtotal de la mesa</span><strong>{money(cart.total)}</strong></div>
      <div><span>Tu consumo</span><strong>{money(cart.mio)}</strong></div>
    </>}
    {!!cart.descuento?.monto && <div><span>Descuento {cart.descuento.porcentaje}%</span><strong>− {money(cart.descuento.monto)}</strong></div>}
  </>
  const total = <div className="sm-total"><span>Total estimado</span><strong>{money(Math.max(0, cart.total - (cart.descuento?.monto ?? 0)))}</strong></div>
  const nota = <p>Revisaremos disponibilidad y precios al confirmar. Los pedidos de tu mesa se enviarán juntos después de pagar.</p>
  const factory = <>{titulo}{lineas}{cupon}{filas}{total}{nota}{confirmar}{pago}</>
  return <aside className="sm-summary" {...marker}>
    {arbol ? <Plantilla arbol={arbol} datos={orderSummaryTemplateData(cart)} ranuras={{ cupon, titulo, lineas, filas, total, nota, confirmar, pago }} fallback={factory} /> : factory}
  </aside>
}
