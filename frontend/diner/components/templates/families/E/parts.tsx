'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { formatCop } from '@/lib/domain/cart'
import { initials } from '@/lib/domain/template'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Account, Cart, CartLine, Dish, OrderState, PayResult, PayState } from '@/lib/types'

// Piezas compartidas por la familia E (Bar y cervecería): buscador y estado vacío de Waiter en piel oscura, ＋ de 44 px de toque,
// línea de atributos opcionales (ABV/IBU, piezas, picante, tamaños, etiquetas: solo si existen), avatares de comensal con iniciales,
// filas de totales y los estados del pago (autorizando / pagado / rechazado / nada que pagar) comunes a los cinco pagos. Todo con tokens --t-*.

// Colores de avatar del marco (E1/E4): el primero es el acento de la plantilla («Yo»); los otros dos son tokens fijos de Waiter
// (cocina #5B4BC4 y libre #2F7A4F), exactamente los hex que dibuja el marco.
export const AVATAR = ['bg-t-acento text-t-acento-tinta', 'bg-kitchen text-white', 'bg-free text-white']

// El pago no viene en las props del menú: se deriva del enlace al pedido (…/pedido → …/pago) para «Pagar lo mío» de E4.
export const payHrefFrom = (orderBarHref: string) => orderBarHref.replace(/\/pedido\/?$/, '/pago')

// Buscador de Waiter con las medidas de la familia: 44 px sobre superficie, radio 10, sin cromo propio.
export function MenuSearch({ query, setQuery, className = '', autoFocus = false }: { query: string; setQuery: (q: string) => void; className?: string; autoFocus?: boolean }) {
  const t = useTranslations('diner.templates.familiaE')
  return <input type="search" autoFocus={autoFocus} aria-label={t('search')} placeholder={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" className={`h-[44px] w-full rounded-[10px] bg-t-superficie border border-t-borde px-3.5 text-[15px] text-t-tinta placeholder:text-t-tinta-terciaria focus:outline-none focus:border-t-acento ${className}`} />
}

// Estado vacío honesto: habla de búsqueda solo si el comensal buscó; «Ver todos» limpia búsqueda y categoría.
export function EmptyMenu({ query, category, onShowAll }: { query: string; category: number | null; onShowAll: () => void }) {
  const t = useTranslations('diner')
  const text = query ? t('menu.empty') : category === null ? t('menu.emptyMenu') : t('menu.emptyCategory')
  return (
    <div className="py-10 flex flex-col items-center gap-4 text-center">
      <p role="status" className="text-base text-t-tinta-suave">{text}</p>
      {(query !== '' || category !== null) && <button type="button" onClick={onShowAll} className="h-[44px] px-[18px] rounded-t-boton bg-t-superficie border border-t-borde text-[15px] font-medium text-t-tinta">{t('home.seeAll')}</button>}
    </div>
  )
}

// ＋ redondo de 32 px con borde (el de las filas de E5) y 44 px de toque; agotado → nada (cada layout pinta su propia nota de agotado).
export function AddButton({ dish, onAdd, filled = false, className = '' }: { dish: Dish; onAdd: (d: Dish) => void; filled?: boolean; className?: string }) {
  const t = useTranslations('diner.common')
  if (dish.agotado) return null
  return (
    <button type="button" aria-label={`${t('add')}: ${dish.nombre}`} onClick={() => onAdd(dish)} className={`shrink-0 w-[44px] h-[44px] grid place-items-center ${className}`}>
      <span aria-hidden="true" className={`w-[32px] h-[32px] rounded-full grid place-items-center text-[16px] leading-none ${filled ? 'bg-t-acento text-t-acento-tinta' : 'border border-t-borde text-t-tinta-terciaria'}`}>＋</span>
    </button>
  )
}

// Partes de la línea técnica (contrato 2): solo lo que el producto trae. Sin atributos devuelve [] y el layout no deja hueco.
export function useAttrParts(dish: Dish, opts: { abv?: boolean; sizes?: boolean; tags?: boolean } = {}): string[] {
  const t = useTranslations('diner.templates.familiaE')
  const a = dish.atributos
  const { abv = true, sizes = true, tags = true } = opts
  return useMemo(() => {
    if (!a) return []
    const parts: string[] = []
    if (abv && a.abv) parts.push(t('abvShort', { abv: a.abv }))
    if (abv && a.ibu) parts.push(t('ibu', { ibu: a.ibu }))
    if (a.piezas) parts.push(t('pieces', { n: a.piezas }))
    if (a.picante) parts.push(`${'●'.repeat(a.picante)}${'○'.repeat(3 - a.picante)}`)
    if (sizes && a.tamanos && a.tamanos.length > 0) parts.push(t('sizesFrom', { n: a.tamanos.length, amount: formatCop(Math.min(...a.tamanos.map((s) => s.precio))) }))
    if (tags && a.etiquetas && a.etiquetas.length > 0) parts.push(a.etiquetas.join(' · '))
    return parts
  }, [a, abv, sizes, tags, t])
}

// Etiquetas únicas de la carta (atributos.etiquetas) en orden de aparición: alimentan la fila «Filtrar:» de E1.
export function uniqueTags(dishes: Dish[]): string[] {
  return Array.from(new Set(dishes.flatMap((d) => d.atributos?.etiquetas ?? [])))
}

// Avatar redondo de 34 px con iniciales (marco E1/E4). `name` va en aria-label para que el lector diga quién es, no «CM».
export function Avatar({ label, name, color, className = '' }: { label: string; name?: string; color: string; className?: string }) {
  return <span aria-label={name} aria-hidden={name ? undefined : true} className={`w-[34px] h-[34px] shrink-0 rounded-full grid place-items-center text-[13px] font-bold ${color} ${className}`}>{label}</span>
}

// Quién pidió cada línea: «Yo» (o las iniciales de la cuenta) para lo mío; «C1», «C2»… para los demás comensales de la mesa (id real
// `comensal` del carrito; su nombre no viene en los datos). El acento es solo de «Yo»: los demás alternan cocina / libre, así el
// tercer, sexto… comensal nunca se confunde conmigo.
export function useDinerLabels(cart: Cart | null, account: Account | null) {
  const t = useTranslations('diner.templates.familiaE')
  return useMemo(() => {
    const others = Array.from(new Set((cart?.lineas ?? []).filter((l) => !l.mio).map((l) => l.comensal)))
    const mineLabel = account?.nombre ? initials(account.nombre) : t('you')
    const of = (line: Pick<CartLine, 'mio' | 'comensal'>) => {
      if (line.mio) return { label: mineLabel, name: t('you'), color: AVATAR[0] }
      const i = others.indexOf(line.comensal)
      return { label: `C${i + 1}`, name: t('diner', { n: i + 1 }), color: AVATAR[1 + (i % (AVATAR.length - 1))] }
    }
    return { of, others }
  }, [cart, account, t])
}

// Fila de totales: rótulo 15 en gris y cifra en mono; la de descuento va en verde.
export function TotalRow({ label, value, className = 'text-t-tinta-suave' }: { label: string; value: string; className?: string }) {
  return <div className={`flex justify-between text-[15px] py-[3px] ${className}`}><dt>{label}</dt><dd className="font-t-mono tabular whitespace-nowrap">{value}</dd></div>
}

// Chip de 26 px sobre superficie (E5 carrito, historial de la familia).
export function Chip({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center h-[26px] px-[9px] rounded-t-chip bg-t-superficie text-t-tinta-suave text-[12px] ${className}`}>{children}</span>
}

// Insignia «Demo · sin cobro real» del pago maquetado.
export function DemoBadge() {
  const t = useTranslations('diner.pay')
  return <span className="self-start inline-flex items-center h-7 px-2.5 rounded-t-chip bg-pending-soft text-pending-ink text-[12px] font-medium tracking-[0.04em]">{t('demo')}</span>
}

// Barras del pedido en «Pagado»: recibido · en preparación · servido.
const STEP_BARS: Record<OrderState, number> = { pendiente_pago: 0, enviado: 1, en_cocina: 2, listo: 2, servido: 3, pagado: 3, fallido: 0 }

export interface PayStatesProps {
  state: PayState
  total: number
  discount?: { porcentaje: number; monto: number; aplicado: boolean } | null
  result: PayResult | null
  order: { estado: OrderState } | null
  merchant: string
  table: number | null
  account: Account | null
  method: string
  onRetry: (method: 'tarjeta' | 'pse') => void
  onPayAtTable: () => void
  goMenu: () => void
  goBack: () => void
}

// Estados del flujo base (3a/3b) en piel de la familia: nunca un spinner solo; «Pagado» con cabecera verde, ahorro, demo y estado del
// pedido; «Rechazada» con las tres salidas; «nada que pagar». Devuelve null en 'idle' con monto: el layout pinta su pantalla propia.
export function PayStates({ state, total, discount, result, order, merchant, table, account, method, onRetry, onPayAtTable, goMenu, goBack }: PayStatesProps) {
  const t = useTranslations('diner.pay')
  const ts = useTranslations('diner.status')
  const amount = formatCop(total)
  const shell = 'px-[18px] pt-[22px] pb-[18px] flex flex-col gap-4 text-t-tinta'
  const secondary = 'h-[52px] rounded-t-boton bg-t-superficie border border-t-borde text-base font-medium text-t-tinta'
  if (state === 'authorizing') {
    return (
      <div className={`${shell} items-center text-center`} aria-busy="true">
        <div role="status" aria-label={t('authorizing')} className="w-[92px] h-[92px] rounded-full border-[5px] border-t-borde border-t-t-acento animate-spin" />
        <h1 className="t-title text-[22px] leading-tight">{t('authorizing')}</h1>
        <p className="text-base text-t-tinta-suave">{t('authorizingHint')}</p>
        <dl className="w-full rounded-t-tarjeta bg-t-superficie border border-t-borde p-4 flex flex-col gap-2 text-left text-[15px]">
          <div className="flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('merchant')}</dt><dd className="font-medium">{merchant}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('reference')}</dt><dd className="font-t-mono tabular">{table !== null ? `#${table}` : '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('amount')}</dt><dd className="font-t-mono tabular">$ {amount}</dd></div>
        </dl>
        <DemoBadge />
        <p className="text-[14px] text-t-tinta-suave">{t('authorizingFoot')}</p>
      </div>
    )
  }
  if (state === 'paid') {
    const bars = order ? STEP_BARS[order.estado] : 1
    return (
      <div className="flex flex-col gap-4 pb-[18px] text-t-tinta">
        <header className="bg-free text-white px-[18px] pt-[22px] pb-6 flex flex-col items-center gap-3 text-center">
          <span aria-hidden="true" className="w-[62px] h-[62px] rounded-full bg-white/20 grid place-items-center text-[28px] font-bold">✓</span>
          <h1 className="t-title text-[24px] leading-tight">{t('paid')}</h1>
          <span className="font-t-mono tabular text-[26px]">$ {amount}</span>
          <span className="inline-flex items-center h-7 px-2.5 rounded-t-chip bg-white/20 text-white text-[12px] font-medium tracking-[0.04em]">{t('demo')}</span>
        </header>
        <div className="px-[18px] flex flex-col gap-4">
          <dl className="flex flex-col divide-y divide-t-borde text-[15px]">
            {discount && discount.aplicado && <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('saved')}</dt><dd className="font-t-mono tabular text-free">$ {formatCop(discount.monto)}</dd></div>}
            <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('paidWith')}</dt><dd className="font-medium">{t(`method.${result?.metodo ?? method}`)}{result?.referencia ? <span className="font-t-mono tabular text-t-tinta-suave"> · {result.referencia}</span> : null}</dd></div>
            <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('invoice')}</dt><dd className="text-free font-medium">{t('invoiceSent')}</dd></div>
          </dl>
          <section className="rounded-t-tarjeta bg-t-superficie border border-t-borde p-4 flex flex-col gap-3">
            <span className="text-[15px] font-medium">{order ? ts(order.estado) : t('orderCard')}</span>
            <div aria-hidden="true" className="grid grid-cols-3 gap-1.5">{[1, 2, 3].map((i) => <span key={i} className={`h-1.5 rounded-full ${i <= bars ? 'bg-free' : 'bg-t-borde'}`} />)}</div>
            <span className="text-[13px] text-t-tinta-suave">{t('orderSteps')}</span>
          </section>
          {account && <p className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-[14px] text-t-tinta">{t('keepData')}</p>}
          <div className="flex gap-2.5">
            <button type="button" onClick={goMenu} className={`${secondary} flex-1`}>{t('backToMenu')}</button>
            <button type="button" disabled className="h-[52px] flex-1 rounded-t-boton bg-t-acento text-t-acento-tinta text-base font-medium disabled:opacity-50">{t('rate')}</button>
          </div>
        </div>
      </div>
    )
  }
  if (state === 'declined') {
    const option = 'h-[56px] px-4 rounded-t-boton border border-t-borde bg-t-superficie text-left text-base font-medium text-t-tinta flex items-center justify-between'
    return (
      <div className={shell}>
        <div role="alert" className="rounded-t-tarjeta bg-busy-soft border border-[#EBC7C4] p-4 flex gap-3">
          <span aria-hidden="true" className="w-7 h-7 shrink-0 rounded-full bg-busy text-white grid place-items-center font-bold">!</span>
          <div className="flex flex-col gap-1">
            <h1 className="text-[18px] font-bold text-[#7E1C18] leading-tight">{t('declined')}</h1>
            <p className="text-[15px] text-busy-ink">{t('declinedHint')}</p>
          </div>
        </div>
        <span className="text-[13px] tracking-[0.1em] uppercase text-t-tinta-terciaria">{t('whatNow')}</span>
        <button type="button" onClick={() => onRetry('tarjeta')} className={option}><span>{t('retryCard')}</span><span aria-hidden="true">→</span></button>
        <button type="button" onClick={() => onRetry('pse')} className={option}><span>{t('retryOther')}</span><span aria-hidden="true">→</span></button>
        <button type="button" onClick={onPayAtTable} className={option}><span>{t('payAtTable')}</span><span aria-hidden="true">→</span></button>
        <DemoBadge />
        <p className="text-[13px] text-t-tinta-suave">{t('declinedFoot')}</p>
      </div>
    )
  }
  if (total <= 0) {
    return (
      <div className={shell}>
        <h1 className="t-title text-[19px] leading-tight">{t('title')}</h1>
        <p className="text-base text-t-tinta-suave">{t('nothing')}</p>
        <button type="button" onClick={goMenu} className={secondary}>{t('seeMenu')}</button>
        <button type="button" onClick={goBack} className="h-[44px] text-[15px] font-medium text-t-acento">{t('back')}</button>
      </div>
    )
  }
  return null
}

// Cuenta ligada al comensal (para las iniciales del avatar): el layout no la recibe en sus props de menú/carrito.
export const useAccount = () => useDinerStore().account
// Cuenta de la mesa pedida al salón (partes y cifra por parte): la misma que usa el pago, para que el menú de E4 no ofrezca una
// división que el pago luego no tenga. Es null hasta que el comensal pide la cuenta; el menú no la pide (avisaría al salón).
export const useBill = () => useDinerStore().bill

// Rótulo «Agotado» fuera de la zona atenuada, para que siga legible: rojo claro del diseño (#F08A84, el de «barril vacío» de E1)
// sobre las pieles oscuras y la tinta de ocupado sobre la clara. `chip` lo pinta como chip de 28 px (fichas de E2).
export function SoldOut({ dark, chip = false, className = '' }: { dark: boolean; chip?: boolean; className?: string }) {
  const t = useTranslations('diner.common')
  const tone = dark ? 'text-[#F08A84]' : 'text-busy-ink'
  return <span data-testid="sold-out-badge" className={`shrink-0 whitespace-nowrap font-medium ${tone} ${chip ? 'inline-flex items-center h-[28px] px-2.5 rounded-t-chip bg-t-borde text-[12px]' : 'text-[12px]'} ${className}`}>{t('soldOut')}</span>
}
