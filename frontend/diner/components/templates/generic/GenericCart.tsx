'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import type { CartLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount, mine, others } from '@/lib/domain/cart'
import type { CartLine } from '@/lib/types'

const TABS = ['mine', 'table'] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL = { mine: 'cart.mine', table: 'cart.table' } as const

// Carrito genérico (familia B, base de las 30): el carrito es de la mesa. "Lo mío" se edita; lo de los demás se mira y se envía junto.
// Pie: subtotal, línea de descuento (si la sede lo activa), total, «Enviar a cocina», «Ir a pagar» y «o pagar en la mesa con el mesero».
export function GenericCart({ cart, busy, error, setQty, remove, confirm, goPay, goMenu, discount, retry, hrefs }: CartLayoutProps) {
  const t = useTranslations('diner')
  const [tab, setTab] = useState<Tab>('mine')
  // "Enviando…" solo mientras se envía de verdad: `busy` es global (cambiar cantidades o releer también lo encienden).
  const [sending, setSending] = useState(false)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ mine: null, table: null })

  // Bajar de 1 quita la línea: nunca queda una línea con cantidad 0 en el carrito de la mesa.
  const step = (line: CartLine, delta: number) => { const qty = line.cantidad + delta; if (qty < 1) remove(line.id); else setQty(line.id, qty) }
  // Idempotente en el servidor. Si falla, el store guarda el detalle y la página lo pinta: aquí no se repite ni se contradice.
  const onConfirm = async () => { setSending(true); try { await confirm() } finally { setSending(false) } }
  // Dos pestañas (WAI-ARIA tabs): las flechas alternan y mueven el foco; solo la activa entra en el orden de tabulación.
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next: Tab = tab === 'mine' ? 'table' : 'mine'
    setTab(next)
    tabRefs.current[next]?.focus()
  }
  const primary = 'h-tap px-6 rounded-t-boton bg-t-acento text-t-acento-tinta text-base font-medium'
  const secondary = 'h-tap px-6 rounded-t-boton bg-t-superficie border border-t-borde text-base font-medium text-t-tinta'
  const tabClass = (k: Tab) => `h-tap-min rounded-t-boton text-[15px] font-medium ${tab === k ? 'bg-t-acento-suave text-t-tinta' : 'text-t-tinta-suave'}`
  const shell = 'px-[18px] pt-[22px] pb-[18px] flex flex-col gap-4 text-t-tinta'
  const head = (
    <>
      <Link href={hrefs.home} className="self-start inline-flex items-center h-tap-min text-[15px] font-medium text-t-tinta-suave">← {t('common.back')}</Link>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="t-title text-[32px] leading-tight">{t('cart.title')}</h1>
        {cart && cart.lineas.length > 0 && <span className="text-[14px] text-t-tinta-suave">{t('cart.items', { n: itemCount(cart) })}</span>}
      </div>
    </>
  )

  // Tres estados distintos (§07 "di qué pasa y qué hacer"): cargando, no se pudo leer (reintentar) y vacío de verdad (ver la carta).
  if (!cart) {
    return (
      <div className={shell}>
        {head}
        <section className="py-8 flex flex-col items-center gap-4 text-center">
          <p className="text-base text-t-tinta-suave">{error ? t('cart.loadFailed') : t('common.loading')}</p>
          {error && <button type="button" onClick={retry} className={primary}>{t('common.retry')}</button>}
        </section>
      </div>
    )
  }
  if (cart.lineas.length === 0) {
    return (
      <div className={shell}>
        {head}
        <section className="py-8 flex flex-col items-center gap-4 text-center">
          <p className="text-base text-t-tinta-suave">{t('cart.empty')}</p>
          <button type="button" onClick={goMenu} className={primary}>{t('cart.goMenu')}</button>
        </section>
      </div>
    )
  }

  const own = mine(cart)
  const theirs = others(cart)
  // El total del botón va en mono: se parte el copy alrededor de la cifra para no duplicar el texto en es.json.
  const amount = formatCop(Math.max(0, cart.total - (discount?.monto ?? 0)))
  const [before, after] = t('cart.confirm', { amount }).split(amount)
  const pct = discount?.porcentaje ?? 0
  return (
    <div className={shell}>
      {head}
      <div role="tablist" aria-label={t('cart.title')} className="grid grid-cols-2 gap-1 p-1 rounded-t-boton bg-t-superficie border border-t-borde">
        {TABS.map((k) => (
          <button key={k} ref={(el) => { tabRefs.current[k] = el }} type="button" role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls="panel-cart" tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)} onKeyDown={onTabKey} className={tabClass(k)}>{t(TAB_LABEL[k])}</button>
        ))}
      </div>
      <div role="tabpanel" id="panel-cart" aria-labelledby={`tab-${tab}`} className="flex flex-col">
        {own.length > 0 ? (
          <ul className="flex flex-col">
            {own.map((l) => (
              <Line key={l.id} line={l} noteLabel={t('cart.note')}>
                <div className="flex items-center justify-between">
                  <div role="group" aria-label={l.nombre} className="inline-flex items-center rounded-t-boton border border-t-borde bg-t-superficie overflow-hidden">
                    <button type="button" aria-label={t('dish.fewer')} disabled={busy} onClick={() => step(l, -1)} className="w-tap-min h-tap-min text-xl leading-none disabled:opacity-50">−</button>
                    <span className="min-w-9 text-center font-t-mono tabular text-[15px]">{l.cantidad}</span>
                    <button type="button" aria-label={t('dish.more')} disabled={busy} onClick={() => step(l, 1)} className="w-tap-min h-tap-min text-xl leading-none disabled:opacity-50">＋</button>
                  </div>
                  <button type="button" aria-label={`${t('cart.remove')}: ${l.nombre}`} disabled={busy} onClick={() => remove(l.id)} className="h-tap-min px-2 text-[15px] font-medium text-busy-ink disabled:opacity-50">{t('cart.remove')}</button>
                </div>
              </Line>
            ))}
          </ul>
        ) : tab === 'mine' && (
          <div className="py-6 flex flex-col items-center gap-3 text-center">
            <p className="text-t-tinta-suave">{t('cart.empty')}</p>
            <button type="button" onClick={goMenu} className={secondary}>{t('cart.goMenu')}</button>
          </div>
        )}
        {tab === 'table' && (
          <section className="flex flex-col">
            {theirs.length > 0
              ? <h2 className="pt-4 pb-1 text-[15px] font-medium text-t-tinta-suave">{t('cart.others')}</h2>
              : <p className="pt-4 text-[15px] text-t-tinta-suave">{t('cart.othersEmpty')}</p>}
            {theirs.length > 0 && <ul className="flex flex-col">{theirs.map((l) => <Line key={l.id} line={l} noteLabel={t('cart.note')} />)}</ul>}
          </section>
        )}
      </div>
      <Link href={hrefs.menu} className="self-start inline-flex items-center h-tap-min text-[15px] font-medium text-t-acento">{t('cart.addMore')}</Link>
      {/* El comensal ve el ahorro tres veces (carrito, factura, confirmación): aquí como línea propia si ya aplica, o como invitación si aún no se identificó. */}
      {discount && discount.porcentaje > 0 && !discount.registrado && !discount.aplicable && !discount.aplicado && (
        <Link href={hrefs.signup} className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-[14px] font-medium text-t-tinta">{t('cart.discountHint', { pct })}</Link>
      )}
      {/* Pie pegado abajo: la lista scrollea por encima y lo que se va a pagar nunca sale del viewport (§06). */}
      <div className="sticky bottom-0 bg-t-fondo pt-3 pb-[18px] flex flex-col gap-4">
        <dl className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between"><dt className="text-[15px] text-t-tinta-suave">{t('cart.subtotalMine')}</dt><dd className="font-t-mono tabular text-[15px]">$ {formatCop(cart.mio)}</dd></div>
          {discount && (discount.aplicado || discount.aplicable) && (
            <div className="flex items-baseline justify-between text-free-ink"><dt className="text-[15px]">{t('cart.discountLine', { pct })}</dt><dd className="font-t-mono tabular text-[15px]">−{formatCop(discount.monto)}</dd></div>
          )}
          <div className="flex items-baseline justify-between"><dt className="text-lg font-medium">{t('cart.subtotalTable')}</dt><dd className="font-t-mono tabular text-[24px]">$ {amount}</dd></div>
        </dl>
        <button type="button" disabled={busy || sending} onClick={() => void onConfirm()} className="h-tap-money rounded-t-boton bg-t-acento text-t-acento-tinta text-[17px] font-medium disabled:opacity-60">
          {sending ? t('cart.confirming') : <>{before}<span className="font-t-mono tabular">{amount}</span>{after}</>}
        </button>
        <button type="button" disabled={busy || sending} onClick={goPay} className={`${secondary} disabled:opacity-60`}>{t('cart.goPay')}</button>
        <Link href={hrefs.table} className="self-center inline-flex items-center h-tap-min text-[14px] text-t-tinta-suave">{t('cart.payAtTable')}</Link>
      </div>
    </div>
  )
}

// Una línea del carrito: nombre, nota, precio unitario × cantidad y subtotal en mono. Los controles (si es mía) van debajo.
function Line({ line, noteLabel, children }: { line: CartLine; noteLabel: string; children?: React.ReactNode }) {
  return (
    <li className="py-3 border-b border-t-borde flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-[15px] font-medium leading-snug">{line.nombre}</span>
          {line.nota && <span className="text-[13px] text-t-tinta-suave leading-snug">{noteLabel}: {line.nota}</span>}
          <span className="font-t-mono tabular text-[13px] text-t-tinta-suave">{formatCop(line.precio)} × {line.cantidad}</span>
        </div>
        <span className="font-t-mono tabular text-[15px] shrink-0">{formatCop(line.subtotal)}</span>
      </div>
      {children}
    </li>
  )
}
