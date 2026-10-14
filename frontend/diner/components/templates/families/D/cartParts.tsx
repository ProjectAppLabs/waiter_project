'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { CartHrefs, CartLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Account, CartLine, Discount } from '@/lib/types'

// Piezas compartidas de los carritos de la familia D. Conservan lo funcional del genérico (cantidad, quitar, enviar a cocina, ir a
// pagar, pagar en la mesa, lo de los demás) con el trazo de cada marco.

// Cuenta ligada a la cookie (para saber si el 5 % «ya se usó») — la carta la recibe el carrito por el store, no por props.
export const useCartAccount = (): Account | null => useDinerStore((s) => s.account)

// Cómo pintar el descuento: línea (ya aplicado o proyectado para una cuenta verificada), invitación a registrarse, o «ya usado»
// (cuenta verificada que ya lo gastó; solo el marco D4 lo dibuja). Nada si la sede lo apagó.
export type DiscountView = { kind: 'line'; amount: number } | { kind: 'hint' } | { kind: 'used' } | null
export function discountView(discount: Discount | null, account: Account | null): DiscountView {
  if (!discount || discount.porcentaje <= 0) return null
  if (discount.aplicado || discount.aplicable) return { kind: 'line', amount: discount.monto }
  if (discount.registrado || account?.verificada) return { kind: 'used' }
  return { kind: 'hint' }
}

// Meta de una línea: nota y, con más de una unidad, «N × precio».
export function LineMeta({ line, className }: { line: CartLine; className: string }) {
  const t = useTranslations('diner')
  const parts: string[] = []
  if (line.nota) parts.push(`${t('cart.note')}: ${line.nota}`)
  if (line.cantidad > 1) parts.push(t('templates.familiaD.perUnit', { n: line.cantidad, amount: formatCop(line.precio) }))
  return parts.length > 0 ? <span className={className}>{parts.join(' · ')}</span> : null
}

// Contador − / cantidad / ＋ (44 px de toque) y «Quitar». Bajar de 1 quita la línea.
export function Stepper({ line, busy, setQty, remove, box, button, qty, removeClass }: { line: CartLine; busy: boolean; setQty: CartLayoutProps['setQty']; remove: CartLayoutProps['remove']; box: string; button: string; qty: string; removeClass: string }) {
  const t = useTranslations('diner')
  const step = (delta: number) => { const next = line.cantidad + delta; if (next < 1) remove(line.id); else setQty(line.id, next) }
  return (
    <div className="flex items-center gap-2">
      <div role="group" aria-label={line.nombre} className={`inline-flex items-center overflow-hidden ${box}`}>
        <button type="button" aria-label={t('dish.fewer')} disabled={busy} onClick={() => step(-1)} className={`${button} disabled:opacity-50`}>−</button>
        <span className={`font-t-mono tabular ${qty}`}>{line.cantidad}</span>
        <button type="button" aria-label={t('dish.more')} disabled={busy} onClick={() => step(1)} className={`${button} disabled:opacity-50`}>＋</button>
      </div>
      <button type="button" aria-label={`${t('cart.remove')}: ${line.nombre}`} disabled={busy} onClick={() => remove(line.id)} className={`h-11 px-2 ${removeClass} disabled:opacity-50`}>{t('cart.remove')}</button>
    </div>
  )
}

// Un toque en la línea abre los controles (los marcos sin contador): el botón lleva aria-expanded y el nombre de la línea.
export function useOpenLines() {
  const [open, setOpen] = useState<number | null>(null)
  return { isOpen: (id: number) => open === id, toggle: (id: number) => setOpen((o) => (o === id ? null : id)) }
}

// Acciones del pie: «Enviar a cocina · $ total» (principal), «Ir a pagar» y «o pagar en la mesa con el mesero».
export function CartActions({ amount, busy, confirm, goPay, hrefs, primary, secondary, link, mono = true }: { amount: number; busy: boolean; confirm: () => Promise<string | null>; goPay: () => void; hrefs: CartHrefs; primary: string; secondary: string; link: string; mono?: boolean }) {
  const t = useTranslations('diner.cart')
  // «Enviando…» solo mientras se envía de verdad: `busy` es global (cambiar cantidades también lo enciende).
  const [sending, setSending] = useState(false)
  const onConfirm = async () => { setSending(true); try { await confirm() } finally { setSending(false) } }
  const formatted = formatCop(amount)
  const [before, after] = t('confirm', { amount: formatted }).split(formatted)
  return (
    <div className="flex flex-col gap-2.5">
      <button type="button" disabled={busy || sending} onClick={() => void onConfirm()} className={`${primary} disabled:opacity-60`}>
        {sending ? t('confirming') : <>{before}<span className={mono ? 'font-t-mono tabular' : ''}>{formatted}</span>{after}</>}
      </button>
      <button type="button" disabled={busy || sending} onClick={goPay} className={`${secondary} disabled:opacity-60`}>{t('goPay')}</button>
      <Link href={hrefs.table} className={`self-center inline-flex items-center h-11 ${link}`}>{t('payAtTable')}</Link>
    </div>
  )
}

// Tres estados previos al carrito lleno: cargando, no se pudo leer (reintentar) y vacío (ver la carta). null si hay líneas.
export function CartStates({ cart, error, retry, goMenu, button }: { cart: CartLayoutProps['cart']; error: string | null; retry: () => void; goMenu: () => void; button: string }) {
  const t = useTranslations('diner')
  if (cart && cart.lineas.length > 0) return null
  return (
    <section className="px-[18px] py-8 flex flex-col items-center gap-4 text-center">
      {!cart
        ? <><p className="text-base text-t-tinta-suave">{error ? t('cart.loadFailed') : t('common.loading')}</p>{error && <button type="button" onClick={retry} className={button}>{t('common.retry')}</button>}</>
        : <><p className="text-base text-t-tinta-suave">{t('cart.empty')}</p><button type="button" onClick={goMenu} className={button}>{t('cart.goMenu')}</button></>}
    </section>
  )
}

// Lo que pidieron los demás en la mesa: se mira y se envía junto, no se edita.
export function Others({ lines, className = '' }: { lines: CartLine[]; className?: string }) {
  const t = useTranslations('diner.cart')
  if (lines.length === 0) return null
  return (
    <section className={`px-[18px] pt-4 flex flex-col ${className}`}>
      <h2 className="pb-1 text-[14px] font-medium text-t-tinta-suave">{t('others')}</h2>
      <ul className="flex flex-col">
        {lines.map((l) => (
          <li key={l.id} className="py-2.5 border-b border-t-borde flex justify-between gap-3">
            <span className="flex flex-col min-w-0"><span className="text-[15px] leading-snug">{l.nombre}</span><LineMeta line={l} className="text-[13px] text-t-tinta-suave" /></span>
            <span className="font-t-mono tabular text-[14px] text-t-tinta-suave whitespace-nowrap">{formatCop(l.subtotal)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
