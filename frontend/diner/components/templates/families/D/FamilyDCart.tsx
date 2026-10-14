'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { D1Cart } from '@/components/templates/families/D/D1Cart'
import { D3Cart } from '@/components/templates/families/D/D3Cart'
import { CartActions, CartStates, LineMeta, Others, Stepper, discountView, useCartAccount, useOpenLines } from '@/components/templates/families/D/cartParts'
import type { CartLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount, mine, others } from '@/lib/domain/cart'

// Cómo dibuja el 5 % cada plantilla de la familia (spec.pantallas.carrito.descuento5): chip junto al total (D2), «ya usado» con
// «—» (D4), banner bajo la cabecera (D5); el resto, línea verde.
type Discount5 = 'linea' | 'chip' | 'usado' | 'banner'
const DISCOUNT5: Record<string, Discount5> = { D2: 'chip', D4: 'usado', D5: 'banner' }

// Carrito de la familia D (Café y panadería). La piel de familia la definen D2/D4/D5 (docs/diseno/plantillas/D4/carrito.html es la
// base): «Tu pedido» + conteo; filas nombre 16/500, meta 13 y precio mono; totales sobre superficie; CTA en acento (en D2, en tinta:
// la acción del carrito usa tinta, no acento). D1 (pizarra serif) y D3 (miniaturas con contador) difieren estructuralmente y tienen
// componente propio; el registro solo admite claves por familia, así que aquí se ramifica por template.codigo.
// Como el marco no dibuja contador ni «Quitar», un toque en la línea abre los controles. Lo de los demás va debajo, solo lectura.
// La fila de sellos de fidelidad se omite: no hay programa de sellos en los datos.
export function FamilyDCart(props: CartLayoutProps) {
  const code = props.template.codigo.toUpperCase()
  if (code === 'D1') return <D1Cart {...props} />
  if (code === 'D3') return <D3Cart {...props} />
  return <BaseCart {...props} mode={DISCOUNT5[code] ?? 'linea'} />
}

function BaseCart({ cart, template, busy, error, setQty, remove, confirm, goPay, goMenu, discount, retry, hrefs, mode }: CartLayoutProps & { mode: Discount5 }) {
  const t = useTranslations('diner')
  const tf = useTranslations('diner.templates.familiaD')
  const account = useCartAccount()
  const { isOpen, toggle } = useOpenLines()
  const dark = template.codigo.toUpperCase() === 'D2'
  const primary = `h-14 rounded-t-boton text-[16px] font-bold ${dark ? 'bg-t-tinta text-t-fondo' : 'bg-t-acento text-t-acento-tinta'}`
  const secondary = 'h-14 rounded-t-boton bg-t-fondo border border-t-borde text-[16px] font-medium text-t-tinta'
  const pct = discount?.porcentaje ?? 0
  const view = discountView(discount, account)
  const row = 'flex justify-between gap-3 text-[15px] text-t-tinta-suave py-[3px]'
  return (
    <div className="flex flex-col text-t-tinta">
      <header className="px-[18px] py-4 border-b border-t-borde flex items-baseline justify-between gap-3">
        <h1 className="t-title text-[19px] leading-[1.15]">{t('cart.title')}</h1>
        {cart && cart.lineas.length > 0 && <span className="text-[14px] text-t-tinta-suave">{t('cart.items', { n: itemCount(cart) })}</span>}
      </header>
      {mode === 'banner' && view?.kind === 'line' && (
        <p className="px-[18px] py-[13px] bg-t-acento-suave border-b border-t-borde flex items-center gap-2.5">
          <span className="text-[22px] font-bold tracking-[-0.02em] text-t-acento">{tf('pct', { pct })}</span>
          <span className="text-[14px] leading-[1.35] text-t-tinta-terciaria">{tf('discountBanner')}</span>
        </p>
      )}
      <CartStates cart={cart} error={error} retry={retry} goMenu={goMenu} button={`${primary} px-6`} />
      {cart && cart.lineas.length > 0 && (
        <>
          <ul className="flex flex-col">
            {mine(cart).map((l) => (
              <li key={l.id} className="border-b border-t-borde">
                <button type="button" aria-expanded={isOpen(l.id)} aria-label={`${tf('edit')}: ${l.nombre}`} onClick={() => toggle(l.id)} className="w-full min-h-12 px-[18px] py-3 flex justify-between gap-2.5 text-left">
                  <span className="flex flex-col min-w-0">
                    <span className="text-[16px] font-medium leading-snug">{l.nombre}</span>
                    {mode === 'chip'
                      ? (l.nota || l.cantidad > 1) && <span className="mt-[7px] flex flex-wrap gap-1.5"><LineMeta line={l} className="inline-flex items-center h-[26px] px-[9px] rounded-md bg-muted text-t-tinta-suave text-[12px]" /></span>
                      : <LineMeta line={l} className="text-[13px] text-t-tinta-suave" />}
                  </span>
                  <span className="font-t-mono tabular text-[15px] whitespace-nowrap">{formatCop(l.subtotal)}</span>
                </button>
                {isOpen(l.id) && (
                  <div className="px-[18px] pb-3">
                    <Stepper line={l} busy={busy} setQty={setQty} remove={remove} box="rounded-[9px] border border-t-borde bg-t-fondo" button="w-11 h-11 text-[17px] text-t-tinta-suave" qty="w-8 text-center text-[15px]" removeClass="text-[14px] text-busy-ink" />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <Others lines={others(cart)} />
          {view?.kind === 'hint' && <Link href={hrefs.signup} className="mx-[18px] mt-3 px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-[14px] font-medium text-t-tinta">{t('cart.discountHint', { pct })}</Link>}
          <Link href={hrefs.menu} className="mx-[18px] self-start inline-flex items-center h-11 text-[15px] font-medium text-t-acento">{t('cart.addMore')}</Link>
          <dl className="px-[18px] py-4 border-t border-t-borde bg-t-superficie flex flex-col">
            <div className={row}><dt>{t('cart.subtotalMine')}</dt><dd className="font-t-mono tabular">{formatCop(cart.mio)}</dd></div>
            {view?.kind === 'line' && <div className={`${row} text-free`}><dt>{t('cart.discountLine', { pct })}</dt><dd className="font-t-mono tabular">−{formatCop(view.amount)}</dd></div>}
            {mode === 'usado' && view?.kind === 'used' && <div className={row}><dt>{tf('discountUsed', { pct })}</dt><dd className="font-t-mono tabular">—</dd></div>}
            <div className="flex items-baseline justify-between gap-2.5 pt-2.5 mt-2 border-t border-t-borde">
              <dt className="text-[18px] font-bold tracking-[-0.02em] leading-[1.15]">{t('cart.subtotalTable')}</dt>
              <dd className="flex items-center gap-2">
                {mode === 'chip' && view?.kind === 'line' && <span className="inline-flex items-center h-[26px] px-[9px] rounded-[7px] bg-free-soft text-free-ink text-[13px] font-medium">{tf('discountChip', { pct })}</span>}
                <span className="font-t-mono tabular text-[25px] whitespace-nowrap">$ {formatCop(Math.max(0, cart.total - (discount?.monto ?? 0)))}</span>
              </dd>
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
