'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { CartActions, CartStates, LineMeta, Others, Stepper, discountView, useCartAccount } from '@/components/templates/families/D/cartParts'
import { DishPhoto, useDishIndex } from '@/components/templates/families/D/parts'
import type { CartLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount, mine, others } from '@/lib/domain/cart'
import type { Dish } from '@/lib/types'

// D3 · Carrito de vitrina (docs/diseno/plantillas/D3/carrito.html). Difiere de la piel de familia: cada línea lleva miniatura 54×54
// (radio 10; la foto se busca en la carta cargada por producto_id, con placeholder si no hay), nombre 16/500 y precio mono, meta, y
// debajo el contador − 1 ＋ con borde y «Quitar» en rojo; totales sobre superficie con la línea de descuento; «Ir a pagar» en acento.
export function D3Cart({ cart, busy, error, setQty, remove, confirm, goPay, goMenu, discount, retry, hrefs }: CartLayoutProps) {
  const t = useTranslations('diner')
  const account = useCartAccount()
  const index = useDishIndex()
  const pct = discount?.porcentaje ?? 0
  const view = discountView(discount, account)
  const primary = 'h-14 rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold'
  const secondary = 'h-14 rounded-t-boton bg-t-fondo border border-t-borde text-[16px] font-medium text-t-tinta'
  const row = 'flex justify-between gap-3 text-[15px] text-t-tinta-suave py-[3px]'
  // Miniatura: el plato de la carta si sigue en ella; si no, un plato mínimo sin foto (placeholder).
  const thumb = (id: number, nombre: string): Dish => index.get(id) ?? { id, nombre, precio: 0, agotado: false, categorias: [] }
  return (
    <div className="flex flex-col text-t-tinta">
      <header className="px-[18px] py-4 border-b border-t-borde flex items-baseline justify-between gap-3">
        <h1 className="t-title text-[19px] leading-[1.15]">{t('cart.title')}</h1>
        {cart && cart.lineas.length > 0 && <span className="text-[14px] text-t-tinta-suave">{t('cart.items', { n: itemCount(cart) })}</span>}
      </header>
      <CartStates cart={cart} error={error} retry={retry} goMenu={goMenu} button={`${primary} px-6`} />
      {cart && cart.lineas.length > 0 && (
        <>
          <ul className="flex flex-col">
            {mine(cart).map((l) => (
              <li key={l.id} className="px-[18px] py-3 border-b border-t-borde flex gap-3">
                <DishPhoto dish={{ ...thumb(l.producto_id, l.nombre), agotado: false }} className="w-[54px] h-[54px] rounded-[10px]" />
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex justify-between gap-2.5">
                    <span className="text-[16px] font-medium leading-snug">{l.nombre}</span>
                    <span className="font-t-mono tabular text-[15px] whitespace-nowrap">{formatCop(l.subtotal)}</span>
                  </div>
                  <LineMeta line={l} className="text-[13px] text-t-tinta-suave mt-0.5" />
                  <div className="mt-2">
                    <Stepper line={l} busy={busy} setQty={setQty} remove={remove} box="rounded-[9px] border border-t-borde bg-t-superficie" button="w-11 h-11 text-[17px] text-t-tinta-suave" qty="w-8 text-center text-[15px]" removeClass="text-[14px] text-busy-ink" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Others lines={others(cart)} />
          {view?.kind === 'hint' && <Link href={hrefs.signup} className="mx-[18px] mt-3 px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-[14px] font-medium text-t-tinta">{t('cart.discountHint', { pct })}</Link>}
          <Link href={hrefs.menu} className="mx-[18px] self-start inline-flex items-center h-11 text-[15px] font-medium text-t-acento">{t('cart.addMore')}</Link>
          <dl className="px-[18px] py-4 border-t border-t-borde bg-t-superficie flex flex-col">
            <div className={row}><dt>{t('cart.subtotalMine')}</dt><dd className="font-t-mono tabular">{formatCop(cart.mio)}</dd></div>
            {view?.kind === 'line' && <div className={`${row} text-free`}><dt>{t('cart.discountLine', { pct })}</dt><dd className="font-t-mono tabular">−{formatCop(view.amount)}</dd></div>}
            <div className="flex items-baseline justify-between gap-2.5 pt-2.5 mt-2 border-t border-t-borde">
              <dt className="text-[18px] font-bold tracking-[-0.02em] leading-[1.15]">{t('cart.subtotalTable')}</dt>
              <dd className="font-t-mono tabular text-[25px] whitespace-nowrap">$ {formatCop(Math.max(0, cart.total - (discount?.monto ?? 0)))}</dd>
            </div>
          </dl>
          <div className="px-[18px] py-3.5 border-t border-t-borde bg-t-superficie">
            <CartActions amount={Math.max(0, cart.total - (discount?.monto ?? 0))} busy={busy} confirm={confirm} goPay={goPay} hrefs={hrefs} primary={primary} secondary={secondary} link="text-[14px] text-t-tinta-suave" />
          </div>
        </>
      )}
    </div>
  )
}
