'use client'

import { DemoPaymentNotice } from '@/components/ui/DemoPaymentNotice'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { formatCop } from '@/lib/domain/cart'
import { pathFor } from '@/lib/domain/route'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Entry, OrderState } from '@/lib/types'

const STEPS: OrderState[] = ['enviado', 'en_cocina', 'listo', 'servido']
const POLL_MS = 8_000
// Estados en los que el servidor ya no cambia solo: servido y pagado terminan; fallido espera el reintento desde el carrito.
const SETTLED: OrderState[] = ['servido', 'pagado', 'fallido']
// Pasos alcanzados por estado: pagado cubre los cuatro; fallido ninguno (indexOf = -1).
const reachedSteps = (estado: OrderState) => (estado === 'pagado' ? STEPS.length : STEPS.indexOf(estado) + 1)

// Estado del pedido (Plan F, tarea 4): enviado → en cocina → listo → servido, sondeando hasta que llegue a la mesa.
export function Status({ entry, rest, venue, token, id }: { entry: Entry; rest: string; venue: string; token: string | null; id: string | null }) {
  const t = useTranslations('diner.status')
  const tc = useTranslations('diner.common')
  const th = useTranslations('diner.home')
  const tb = useTranslations('diner.bill')
  const router = useRouter()
  const { order: stored, error, busy, refreshOrder, call } = useDinerStore()
  const [called, setCalled] = useState(false)
  // El store puede traer el pedido anterior: solo se muestra el que pide la URL.
  const order = stored && stored.id === id ? stored : null
  const settled = order !== null && SETTLED.includes(order.estado)
  // Sin id, o con el pedido perdido (404: otro celular, cookie vencida) o sin red, no hay nada que sondear: se corta y se ofrece salida.
  const [attempted, setAttempted] = useState(false)
  const lost = !order && (!id || (attempted && error !== null))
  const atTable = entry.contexto.mesa !== null
  // 'la-cuenta' es pedir la cuenta al salón (Plan F); 'cuenta' pasó a ser Mi cuenta del comensal (Plan H).
  const go = (screen: 'carta' | 'pedido' | 'la-cuenta') => router.push(pathFor(rest, venue, token, screen))
  const secondary = 'h-tap-min px-[18px] rounded-rest bg-surface border border-border text-[15px] font-medium disabled:opacity-50'

  useEffect(() => { if (id) void Promise.resolve(refreshOrder(id)).finally(() => setAttempted(true)) }, [id, refreshOrder])
  useEffect(() => {
    if (!id || settled || lost) return
    const timer = setInterval(() => { void refreshOrder(id) }, POLL_MS)
    return () => clearInterval(timer)
  }, [id, settled, lost, refreshOrder])

  if (!order) {
    if (busy || !lost) return <p className="p-[18px] text-soft">{tc('loading')}</p>
    return (
      <section className="px-[18px] pt-[22px] flex flex-col items-start gap-4">
        <p className="text-base text-soft">{t('notFound')}</p>
        {id && <button type="button" onClick={() => void refreshOrder(id)} className={secondary}>{tc('retry')}</button>}
        <button type="button" onClick={() => go('pedido')} className="h-tap-min rounded-rest text-[15px] font-medium text-brand">{tb('back')}</button>
      </section>
    )
  }
  const { estado } = order
  const failed = estado === 'fallido'
  const reached = reachedSteps(estado)
  return (
    <div className="px-[18px] pt-[22px] pb-[18px] flex flex-col gap-4">
      <DemoPaymentNotice />
      {order.descuento?.aplicado && <p>{t('discount', { pct: order.descuento.porcentaje, amount: formatCop(order.descuento.monto) })}</p>}
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] tracking-[0.12em] uppercase text-soft">{t('title')}</span>
        <span className="font-mono tabular text-[17px]">$ {formatCop(order.total)}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[32px] leading-tight">{t(estado)}</h1>
        <p className="text-base text-soft">{t(`hint.${estado}`)}</p>
      </div>
      {/* Los pasos se distinguen con texto (✓ en los superados, peso en los alcanzados) y colores propios de Waiter, no solo con color. */}
      {!failed && (
        <ol aria-label={t('steps')} className="grid grid-cols-4 gap-1 pt-2">
          {STEPS.map((step, i) => {
            const current = step === estado
            const done = i < reached && !current
            return (
              <li key={step} aria-current={current ? 'step' : undefined} className="flex flex-col items-center gap-2 text-center">
                <span aria-hidden="true" className={`w-3 h-3 rounded-full ${current ? 'bg-kitchen' : i < reached ? 'bg-ink' : 'bg-border'}`} />
                <span className={`text-[15px] leading-tight text-balance ${i < reached ? 'text-ink font-medium' : 'text-soft'}`}>{done ? '✓ ' : ''}{t(step)}</span>
              </li>
            )
          })}
        </ol>
      )}
      <div className="flex flex-col gap-2.5 pt-2">
        {failed
          ? <button type="button" onClick={() => go('pedido')} className="h-tap rounded-rest bg-brand text-brand-ink text-base font-medium">{tc('retry')}</button>
          : <button type="button" onClick={() => go('carta')} className="h-tap rounded-rest bg-brand text-brand-ink text-base font-medium">{t('orderMore')}</button>}
        {atTable && (
          <button type="button" onClick={async () => { if (await call()) setCalled(true) }} className={secondary}>{t('callWaiter')}</button>
        )}
        {atTable && !failed && estado !== 'pagado' && (
          <button type="button" onClick={() => go('la-cuenta')} className={secondary}>{t('askBill')}</button>
        )}
        {called && <p role="status" className="text-center text-[15px] text-free-ink bg-free-soft rounded-rest">{th('called')}</p>}
      </div>
    </div>
  )
}
