'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { DishPhoto, useCarta, useCountLabel } from '@/components/templates/families/F/parts'
import type { CartLayoutProps } from '@/components/templates/types'
import { formatCop, mine, others } from '@/lib/domain/cart'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { CartLine, Dish, Menu } from '@/lib/types'

// Carrito de la familia F (docs/diseno/plantillas/F*/carrito.html). El registro admite una entrada por familia, así que las
// cuatro pieles viven aquí y se ramifican por template.codigo:
//  · F1 y F4 (base): cabecera «Tu pedido» + «44 piezas»; líneas nombre 16/500 + precio mono con chips «N piezas» / «IVA incluido»;
//    totales sobre la superficie con el descuento como línea verde; CTA en el acento (negro en F1, rojo en F4). Sin stepper
//    dibujado: tocar la línea abre los controles.
//  · F2: miniatura 54 px, stepper − 1 ＋ (38×42, radio 9) y «Quitar» siempre visibles; chip «−5% aplicado» junto al total; CTA de
//    60 px con radio 8.
//  · F3: piel oscura de la familia A: cabecera centrada en serif, nombre en serif 20 con guía de puntos, «5% ya usado en tu 1ª
//    visita —» cuando el descuento ya se consumió, CTA de contorno dorado.
//  · F5: cuenta compartida: avatar de 34 px por comensal («Yo» en el acento; los demás numerados por orden de aparición, con los
//    tres colores del marco rotando: la sesión no trae nombres, así que no hay iniciales). La fila «Para la mesa» del marco es
//    para lo compartido sin dueño, que el carrito de Waiter no tiene (toda línea es de alguien): no se pinta, para no sumar dos
//    veces lo ajeno. Selector de propina (0 / 10 / 15 %) en su propia sección, fuera de la caja de totales: es informativo, se
//    entrega en la mesa y no entra en el Total ni en el CTA. Chip «−5% aplicado» y CTA «Pagar lo mío» (o «Ir a pagar» si nadie
//    más pidió).
// Se conserva la funcionalidad del genérico: «Enviar a cocina» como acción principal, «Ir a pagar», «o pagar en la mesa con el
// mesero», cantidad / quitar en lo mío, y lo de los demás solo se mira. Las piezas se cuentan con la carta del store.
export function FamilyFCart(props: CartLayoutProps) {
  const { cart, template, busy, error, confirm, goPay, goMenu, discount, retry, hrefs } = props
  const t = useTranslations('diner')
  const tf = useTranslations('diner.templates.familiaF')
  const menu = useCarta()
  const account = useDinerStore((s) => s.account)
  const countLabel = useCountLabel()
  const code = template.codigo.toUpperCase()
  const [sending, setSending] = useState(false)
  const [tip, setTip] = useState<0 | 10 | 15>(10)
  const onConfirm = async () => { setSending(true); try { await confirm() } finally { setSending(false) } }

  const dark = code === 'F3'
  const cta = code === 'F3'
    ? 'h-14 rounded-t-boton border border-t-acento text-t-acento text-[16px] font-bold disabled:opacity-60'
    : code === 'F2'
      ? 'h-[60px] rounded-[8px] bg-t-acento text-t-acento-tinta text-[17px] font-bold tracking-[-0.02em] disabled:opacity-60'
      : 'h-14 rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold disabled:opacity-60'
  const secondary = 'h-12 rounded-t-boton border border-t-borde bg-t-fondo text-[15px] font-medium text-t-tinta disabled:opacity-60'
  const head = (
    <header className={`px-[18px] py-4 border-b border-t-borde flex gap-2.5 ${dark ? 'flex-col items-center text-center' : 'items-baseline justify-between'}`}>
      <h1 className={dark ? 't-title text-[22px] leading-[1.1]' : 'text-[19px] font-bold tracking-[-0.02em] leading-[1.15]'}>{t('cart.title')}</h1>
      {cart && cart.lineas.length > 0 && <span className="text-[14px] text-t-tinta-suave">{countLabel(cart, menu)}</span>}
    </header>
  )
  const centered = 'px-[18px] py-8 flex flex-col items-center gap-4 text-center'
  if (!cart) {
    return (
      <div className="flex flex-col text-t-tinta">{head}
        <section className={centered}>
          <p className="text-base text-t-tinta-suave">{error ? t('cart.loadFailed') : t('common.loading')}</p>
          {error && <button type="button" onClick={retry} className={`${cta} px-6`}>{t('common.retry')}</button>}
        </section>
      </div>
    )
  }
  if (cart.lineas.length === 0) {
    return (
      <div className="flex flex-col text-t-tinta">{head}
        <section className={centered}>
          <p className="text-base text-t-tinta-suave">{t('cart.empty')}</p>
          <button type="button" onClick={goMenu} className={`${cta} px-6`}>{t('cart.goMenu')}</button>
        </section>
      </div>
    )
  }

  const own = mine(cart)
  const theirs = others(cart)
  const amount = formatCop(Math.max(0, cart.total - (discount?.monto ?? 0)))
  const [before, after] = t('cart.confirm', { amount }).split(amount)
  const pct = discount?.porcentaje ?? 0
  // «5% ya usado» (modo «usado» de F3) solo con cuenta verificada: sin cuenta, «no aplicable» significa que aún no se identificó.
  const used = code === 'F3' && !!account?.verificada && discount !== null && !discount.aplicable && !discount.aplicado
  const chipMode = code === 'F2' || code === 'F5'
  const row = 'flex justify-between gap-2.5 text-[15px] text-t-tinta-suave py-[3px]'
  const money = 'font-t-mono tabular whitespace-nowrap'
  const lineProps = { code, menu, busy, setQty: props.setQty, remove: props.remove }
  return (
    <div className="flex flex-col text-t-tinta">
      {head}
      {code === 'F5'
        ? (
          <ul className="flex flex-col">
            {own.map((l) => <Line key={l.id} line={l} editable {...lineProps} avatar={<span aria-hidden="true" className="w-[34px] h-[34px] rounded-full bg-t-acento text-t-acento-tinta grid place-items-center text-[13px] font-bold shrink-0">{tf('cart.me')}</span>} />)}
            {theirs.map((l) => {
              const i = dinerIndex(cart.lineas, l)
              return <Line key={l.id} line={l} editable={false} {...lineProps} avatar={<span role="img" aria-label={tf('cart.diner', { n: i + 1 })} className={`w-[34px] h-[34px] rounded-full text-white grid place-items-center text-[13px] font-bold shrink-0 ${DINER_COLORS[i % DINER_COLORS.length]}`}>{i + 1}</span>} />
            })}
          </ul>
        )
        : (
          <>
            <ul className="flex flex-col">{own.map((l) => <Line key={l.id} line={l} editable {...lineProps} />)}</ul>
            {theirs.length > 0 && (
              <section className="flex flex-col">
                <h2 className="px-[18px] pt-4 pb-1 text-[13px] tracking-[0.1em] uppercase font-medium text-t-tinta-terciaria">{t('cart.others')}</h2>
                <ul className="flex flex-col">{theirs.map((l) => <Line key={l.id} line={l} editable={false} {...lineProps} />)}</ul>
              </section>
            )}
          </>
        )}
      <div className="px-[18px] py-3 flex flex-col gap-3">
        <Link href={hrefs.menu} className="self-start inline-flex items-center h-11 text-[15px] font-medium text-t-acento">{t('cart.addMore')}</Link>
        {discount && discount.porcentaje > 0 && !discount.registrado && !discount.aplicable && !discount.aplicado && (
          <Link href={hrefs.signup} className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave border border-t-borde text-[14px] font-medium text-t-tinta">{t('cart.discountHint', { pct })}</Link>
        )}
      </div>
      {code === 'F5' && (
        <section aria-label={tf('cart.tip')} className="px-[18px] py-3 border-t border-t-borde flex flex-col gap-2">
          <div className="flex justify-between items-baseline gap-2.5 text-[14px] text-t-tinta-suave">
            <span>{tf('cart.tip')}</span>
            {tip > 0 && <span data-testid="tip-info">{tf('cart.tipAtTable', { pct: tip })} · <span className={money}>{formatCop((cart.total * tip) / 100)}</span></span>}
          </div>
          <div role="radiogroup" aria-label={tf('cart.tip')} className="flex gap-[7px]">
            {([0, 10, 15] as const).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={tip === p} onClick={() => setTip(p)} className={`flex-1 h-11 rounded-[9px] text-[14px] ${tip === p ? 'bg-t-acento text-t-acento-tinta font-medium' : 'border border-t-borde text-t-tinta-suave'}`}>{p === 0 ? tf('cart.tipNone') : `${p}%`}</button>
            ))}
          </div>
          <p className="text-[12px] text-t-tinta-terciaria">{tf('cart.tipNote')}</p>
        </section>
      )}
      <dl className="px-[18px] py-4 border-t border-t-borde bg-t-superficie">
        <div className={row}><dt>{t('cart.subtotal')}</dt><dd className={money}>{formatCop(cart.total)}</dd></div>
        {(discount?.aplicado || discount?.aplicable) && <div className={`${row} text-free`}><dt>{t('cart.discountLine', { pct })}</dt><dd className={money}>−{formatCop(discount.monto)}</dd></div>}
        {used && <div className={row}><dt>{tf('cart.discountUsed', { pct })}</dt><dd className={money}>—</dd></div>}
        <div className={`flex justify-between items-baseline gap-2.5 pt-2.5 mt-2 border-t border-t-borde ${dark ? 'border-dotted' : ''}`}>
          <dt className={dark ? 't-title text-[21px] leading-[1.1]' : 'text-[18px] font-bold tracking-[-0.02em] leading-[1.15]'}>{tf('cart.total')}</dt>
          <dd className="flex items-center gap-2">
            {chipMode && (discount?.aplicado || discount?.aplicable) && <span className="h-[26px] px-[9px] rounded-t-chip bg-free-soft text-free-ink text-[13px] font-medium grid place-items-center">{tf('cart.discountApplied', { pct })}</span>}
            <span className={`${money} text-[25px]`}>$ {amount}</span>
          </dd>
        </div>
      </dl>
      <div className="px-[18px] py-3.5 border-t border-t-borde bg-t-superficie flex flex-col gap-2.5">
        <button type="button" disabled={busy || sending} onClick={() => void onConfirm()} className={cta}>
          {sending ? t('cart.confirming') : <>{before}<span className="font-t-mono tabular">{amount}</span>{after}</>}
        </button>
        <button type="button" disabled={busy || sending} onClick={goPay} className={secondary}>{code === 'F5' && theirs.length > 0 ? tf('cart.payMine') : t('cart.goPay')}</button>
        <Link href={hrefs.table} className="self-center inline-flex items-center h-11 text-[14px] text-t-tinta-suave">{t('cart.payAtTable')}</Link>
      </div>
    </div>
  )
}

// Los tres colores del marco de F5 para los demás comensales (violeta, verde, ámbar de Waiter; el dorado/acento es del «Yo»).
const DINER_COLORS = ['bg-kitchen', 'bg-free', 'bg-pending']
// Orden de aparición de cada comensal ajeno (para numerar y colorear su avatar en F5): el mismo comensal, el mismo número.
function dinerIndex(lines: CartLine[], line: CartLine): number {
  const ids = Array.from(new Set(lines.filter((l) => !l.mio).map((l) => l.comensal)))
  return ids.indexOf(line.comensal)
}

function findDish(menu: Menu | null, id: number): Dish | null {
  for (const c of menu?.categorias ?? []) for (const d of c.productos) if (d.id === id) return d
  return null
}

// Una línea: nombre, precio; piezas si el producto las trae. En F2 la miniatura y el stepper van siempre; en el resto, tocar la línea
// (aria-expanded) muestra − cantidad ＋ y «Quitar». Lo ajeno no se edita. Bajar de 1 quita la línea.
function Line({ line, code, menu, busy, editable, setQty, remove, avatar }: { line: CartLine; code: string; menu: Menu | null; busy: boolean; editable: boolean; setQty: (id: number, qty: number) => void; remove: (id: number) => void; avatar?: React.ReactNode }) {
  const t = useTranslations('diner')
  const tf = useTranslations('diner.templates.familiaF')
  const [open, setOpen] = useState(false)
  const dish = findDish(menu, line.producto_id)
  const pieces = dish?.atributos?.piezas ? dish.atributos.piezas * line.cantidad : null
  const always = code === 'F2'
  const showControls = editable && (always || open)
  const step = (delta: number) => { const qty = line.cantidad + delta; if (qty < 1) remove(line.id); else setQty(line.id, qty) }
  const dark = code === 'F3'
  const controls = showControls && (
    <div className="flex items-center gap-2 mt-2">
      <div role="group" aria-label={line.nombre} className="inline-flex items-center rounded-[9px] border border-t-borde overflow-hidden">
        <button type="button" aria-label={t('dish.fewer')} disabled={busy} onClick={() => step(-1)} className="w-11 h-11 grid place-items-center text-[17px] text-t-tinta-suave disabled:opacity-50">−</button>
        <span className="w-8 text-center font-t-mono tabular text-[15px]">{line.cantidad}</span>
        <button type="button" aria-label={t('dish.more')} disabled={busy} onClick={() => step(1)} className="w-11 h-11 grid place-items-center text-[17px] text-t-tinta-suave border-l border-t-borde disabled:opacity-50">＋</button>
      </div>
      <button type="button" aria-label={`${t('cart.remove')}: ${line.nombre}`} disabled={busy} onClick={() => remove(line.id)} className="h-11 px-2 text-[14px] text-busy-ink disabled:opacity-50">{t('cart.remove')}</button>
    </div>
  )
  const qtyText = line.cantidad > 1 ? ` ×${line.cantidad}` : ''
  const body = dark
    ? (
      <>
        <span className="flex items-baseline gap-2">
          <span className="t-title text-[20px] leading-[1.1] truncate">{line.nombre}{qtyText}</span>
          <span aria-hidden="true" className="flex-1 border-b border-dotted border-t-borde" />
          <span className="font-t-mono tabular text-[15px] whitespace-nowrap">{formatCop(line.subtotal)}</span>
        </span>
        {(pieces || line.nota) && <span className="text-[13px] text-t-tinta-suave mt-1">{[pieces ? tf('pieces', { n: pieces }) : null, line.nota ? `${t('cart.note')}: ${line.nota}` : null].filter(Boolean).join(' · ')}</span>}
      </>
    )
    : code === 'F5'
      ? (
        <span className="flex items-center gap-2.5">
          <span className="flex-1 min-w-0 text-[15px] truncate">{line.nombre}{qtyText}</span>
          <span className="font-t-mono tabular text-[15px] whitespace-nowrap">{formatCop(line.subtotal)}</span>
        </span>
      )
      : (
        <>
          <span className="flex justify-between gap-2.5">
            <span className="text-[16px] font-medium">{line.nombre}{qtyText}</span>
            <span className="font-t-mono tabular text-[15px] whitespace-nowrap">{formatCop(line.subtotal)}</span>
          </span>
          {line.nota && <span className="text-[13px] text-t-tinta-suave mt-0.5">{t('cart.note')}: {line.nota}</span>}
          {code === 'F2'
            ? pieces ? <span className="text-[13px] text-t-tinta-suave mt-0.5">{tf('pieces', { n: pieces })}</span> : null
            : (
              <span className="flex gap-1.5 mt-[7px]">
                {pieces ? <span className="h-[26px] px-[9px] rounded-t-chip bg-muted text-t-tinta-suave text-[12px] grid place-items-center">{tf('pieces', { n: pieces })}</span> : null}
                <span className="h-[26px] px-[9px] rounded-t-chip bg-muted text-t-tinta-suave text-[12px] grid place-items-center">{tf('cart.taxIncluded')}</span>
              </span>
            )}
        </>
      )
  const inner = editable && !always
    ? <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="w-full min-h-11 flex flex-col text-left">{body}</button>
    : <div className="flex flex-col">{body}</div>
  return (
    <li className={`px-[18px] border-b border-t-borde flex gap-3 ${code === 'F5' ? 'py-2.5 items-center' : dark ? 'py-[15px]' : 'py-3'}`}>
      {avatar}
      {code === 'F2' && dish && <DishPhoto dish={dish} className="w-[54px] h-[54px] rounded-[10px] shrink-0" badge={false} />}
      <div className="flex-1 min-w-0 flex flex-col">
        {inner}
        {controls}
      </div>
    </li>
  )
}
