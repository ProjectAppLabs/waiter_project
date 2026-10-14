'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { CartActions, CartStates, LineMeta, Others, Stepper, discountView, useCartAccount, useOpenLines } from '@/components/templates/families/D/cartParts'
import type { CartLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount, mine, others } from '@/lib/domain/cart'

// D1 · Carrito de pizarra (docs/diseno/plantillas/D1/carrito.html). Difiere de la piel de familia: pizarra oscura, «Tu pedido»
// centrado en serif con el conteo debajo; líneas con el nombre en serif 20, guía de puntos y precio mono 15; totales sobre la
// superficie con separador punteado (Total en serif 21, monto mono 25); botones crema en serif de 60 px y radio 8.
// El marco no dibuja contador ni «Quitar»: un toque en la línea abre los controles. Descuento como línea verde.
export function D1Cart({ cart, busy, error, setQty, remove, confirm, goPay, goMenu, discount, retry, hrefs }: CartLayoutProps) {
  const t = useTranslations('diner')
  const tf = useTranslations('diner.templates.familiaD')
  const account = useCartAccount()
  const { isOpen, toggle } = useOpenLines()
  const pct = discount?.porcentaje ?? 0
  const view = discountView(discount, account)
  const serif = 'font-t-display text-[20px] leading-[1.1]'
  const primary = `h-[60px] rounded-[8px] bg-t-acento text-t-acento-tinta ${serif}`
  const secondary = `h-[60px] rounded-[8px] border border-t-borde bg-t-superficie text-t-tinta ${serif}`
  const row = 'flex justify-between gap-3 text-[15px] text-t-tinta-suave py-[3px]'
  return (
    <div className="flex flex-col text-t-tinta">
      <header className="px-[18px] py-4 border-b border-t-borde flex flex-col items-center gap-2.5 text-center">
        <h1 className="t-title text-[22px] leading-[1.1]">{t('cart.title')}</h1>
        {cart && cart.lineas.length > 0 && <span className="text-[14px] text-t-tinta-suave">{t('cart.items', { n: itemCount(cart) })}</span>}
      </header>
      <CartStates cart={cart} error={error} retry={retry} goMenu={goMenu} button={`${primary} px-6`} />
      {cart && cart.lineas.length > 0 && (
        <>
          <ul className="flex flex-col">
            {mine(cart).map((l) => (
              <li key={l.id} className="border-b border-t-borde">
                <button type="button" aria-expanded={isOpen(l.id)} aria-label={`${tf('edit')}: ${l.nombre}`} onClick={() => toggle(l.id)} className="w-full min-h-12 px-[18px] py-[15px] flex flex-col text-left">
                  <span className="flex items-baseline gap-2">
                    <span className={serif}>{l.nombre}</span>
                    <span aria-hidden="true" className="flex-1 border-b border-dotted border-t-borde translate-y-[-4px]" />
                    <span className="font-t-mono tabular text-[15px] whitespace-nowrap">{formatCop(l.subtotal)}</span>
                  </span>
                  <LineMeta line={l} className="text-[13px] text-t-tinta-suave mt-1" />
                </button>
                {isOpen(l.id) && (
                  <div className="px-[18px] pb-3.5">
                    <Stepper line={l} busy={busy} setQty={setQty} remove={remove} box="rounded-[9px] border border-t-borde bg-t-superficie" button="w-11 h-11 text-[17px] text-t-tinta" qty="w-8 text-center text-[15px]" removeClass="text-[14px] text-t-tinta-suave underline underline-offset-4" />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <Others lines={others(cart)} />
          {view?.kind === 'hint' && <Link href={hrefs.signup} className="mx-[18px] mt-3 px-3.5 py-2.5 rounded-[10px] bg-t-acento-suave text-[14px] font-medium text-t-tinta">{t('cart.discountHint', { pct })}</Link>}
          <Link href={hrefs.menu} className="mx-[18px] self-start inline-flex items-center h-11 text-[15px] font-medium text-t-tinta-suave underline underline-offset-4">{t('cart.addMore')}</Link>
          <dl className="px-[18px] py-4 border-t border-t-borde bg-t-superficie flex flex-col">
            <div className={row}><dt>{t('cart.subtotalMine')}</dt><dd className="font-t-mono tabular">{formatCop(cart.mio)}</dd></div>
            {view?.kind === 'line' && <div className={`${row} text-free`}><dt>{t('cart.discountLine', { pct })}</dt><dd className="font-t-mono tabular">−{formatCop(view.amount)}</dd></div>}
            <div className="flex items-baseline justify-between gap-2.5 pt-2.5 mt-2 border-t border-dotted border-t-borde">
              <dt className="font-t-display text-[21px] leading-[1.1]">{t('cart.subtotalTable')}</dt>
              <dd className="font-t-mono tabular text-[25px] whitespace-nowrap">$ {formatCop(Math.max(0, cart.total - (discount?.monto ?? 0)))}</dd>
            </div>
          </dl>
          <div className="px-[18px] py-3.5 border-t border-t-borde bg-t-superficie">
            <CartActions amount={Math.max(0, cart.total - (discount?.monto ?? 0))} busy={busy} confirm={confirm} goPay={goPay} hrefs={hrefs} primary={primary} secondary={secondary} link="text-[14px] text-t-tinta-suave" mono={false} />
          </div>
        </>
      )}
    </div>
  )
}
