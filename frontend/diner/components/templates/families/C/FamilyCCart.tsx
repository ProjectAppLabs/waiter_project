'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { extrasOf, familyCCode, isDarkC, money, price } from '@/components/templates/families/C/parts'
import type { FamilyCCode } from '@/components/templates/families/C/parts'
import type { CartLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount, mine, others } from '@/lib/domain/cart'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { CartLine, Discount } from '@/lib/types'

// Carrito de la familia C (docs/diseno/plantillas/C*/carrito.html). Esqueleto común: cabecera «Tu pedido · N ítems», filas, bloque
// de totales (Subtotal / Descuento primera compra / Total) y pie con las acciones. La fila y el descuento cambian por código:
//  C1 · número de posición en Bebas ámbar, nombre en Bebas 23, nota, precio mono; banner del 5 % bajo la cabecera (descuento5: banner).
//  C2 · miniatura 54 px (foto del producto por producto_id), nombre 16/500 + precio mono, nota, stepper y «Quitar» visibles; nota verde
//       «Incluye tu 5%» bajo el CTA (descuento5: linea).
//  C3 · nombre + precio, chips grises con la nota e «IVA incluido» (descuento5: linea).
//  C4 · nombre en Bebas 24 con guía de puntos y precio mono 15; cabecera centrada en columna; chip verde «−5% aplicado» junto al
//       Total (descuento5: chip); bordes con la tiza al 28 %.
//  C5 · número en mono verde, nombre 16/700; banner del 5 %; selector de propina (Sin propina / 10% / 15%) en su propio bloque bajo
//       los totales, informativo: la propina es estado local del carrito y no viaja al pago, así que no entra en el Total (el marco
//       la suma, pero el pago mostraría otra cifra) (descuento5: banner). El registro solo admite claves por familia: se ramifica aquí.
//  C3 · además, la fila de upsell «¿Algo para cerrar?» del marco: sale de la categoría de extras de la carta (extrasOf, como C2 y C5)
//       con la sugerencia a nombre del mesero de la marca; el ＋ agrega por el store (CartLayoutProps no trae onAdd).
// Donde el marco no dibuja stepper ni «Quitar» (C1, C3, C4, C5), un toque en la línea abre los controles. Se conserva lo del genérico:
// «Enviar a cocina» como acción principal, «Ir a pagar», «o pagar en la mesa con el mesero», lo de los demás en la mesa solo lectura,
// invitación al registro si el descuento aún no aplica, y los estados cargando / no se pudo leer / vacío.
// Datos no estándar omitidos: tiempoCocinaMinutos (C3), fotos del carrito solo si la carta las tiene (C2).
const TIPS = [0, 10, 15] as const

export function FamilyCCart({ cart, template, busy, error, setQty, remove, confirm, goPay, goMenu, discount, retry, hrefs }: CartLayoutProps) {
  const t = useTranslations('diner')
  const tc = useTranslations('diner.templates.familiaC.cart')
  const code = familyCCode(template.codigo)
  const dark = isDarkC(code)
  const [sending, setSending] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [tip, setTip] = useState<(typeof TIPS)[number]>(10)
  // C2 pinta la miniatura del producto: la foto vive en la carta (entry), no en la línea; se busca por producto_id. C3 saca de la
  // misma carta el extra que sugiere para cerrar y lo agrega por el store.
  const entry = useDinerStore((s) => s.entry)
  const addToCart = useDinerStore((s) => s.add)
  const photoOf = (productId: number) => entry?.carta.categorias.flatMap((c) => c.productos).find((d) => d.id === productId)?.foto ?? null

  const step = (line: CartLine, delta: number) => { const qty = line.cantidad + delta; if (qty < 1) remove(line.id); else setQty(line.id, qty) }
  const onConfirm = async () => { setSending(true); try { await confirm() } finally { setSending(false) } }
  const border = code === 'C4' ? 'border-t-tinta/28' : 'border-t-borde'
  const shell = `flex flex-col text-t-tinta border-b ${border}`
  const titleClass = dark ? 't-title text-[26px] leading-none' : 't-title text-[19px] leading-[1.15]'
  const ctaRadius = code === 'C2' ? 'rounded-t-boton' : 'rounded-[8px]'
  const ctaText = dark ? 't-title text-[24px] leading-none' : 'text-[17px] font-bold tracking-[-0.02em]'
  // CTA del marco: 60 px radio 8 en C1/C3/C4/C5; C2 lo dibuja de 56 px con el radio de botón de la plantilla.
  const primary = `w-full ${code === 'C2' ? 'h-14' : 'h-[60px]'} ${ctaRadius} bg-t-acento text-t-acento-tinta ${ctaText} disabled:opacity-60`
  const secondary = `w-full h-14 ${ctaRadius} bg-t-superficie border ${border} ${dark ? 't-title text-[22px] leading-none' : 'text-[16px] font-bold tracking-[-0.02em]'} text-t-tinta disabled:opacity-60`
  const head = (
    <header className={`px-[18px] py-4 border-b ${border} flex ${code === 'C4' ? 'flex-col items-center gap-2' : 'items-baseline justify-between gap-2.5'}`}>
      <h1 className={titleClass}>{t('cart.title')}</h1>
      <span className="text-[14px] text-t-tinta-suave">{cart ? t('cart.items', { n: itemCount(cart) }) : <Link href={hrefs.home}>← {t('common.back')}</Link>}</span>
    </header>
  )
  if (!cart) {
    return (
      <div className={shell}>{head}
        <section className="px-[18px] py-8 flex flex-col items-center gap-4 text-center">
          <p className="text-base text-t-tinta-suave">{error ? t('cart.loadFailed') : t('common.loading')}</p>
          {error && <button type="button" onClick={retry} className={primary}>{t('common.retry')}</button>}
        </section>
      </div>
    )
  }
  if (cart.lineas.length === 0) {
    return (
      <div className={shell}>{head}
        <section className="px-[18px] py-8 flex flex-col items-center gap-4 text-center">
          <p className="text-base text-t-tinta-suave">{t('cart.empty')}</p>
          <button type="button" onClick={goMenu} className={primary}>{t('cart.goMenu')}</button>
        </section>
      </div>
    )
  }

  const own = mine(cart)
  const theirs = others(cart)
  const pct = discount?.porcentaje ?? 0
  const applied = Boolean(discount?.aplicado || discount?.aplicable)
  const pending = Boolean(discount && discount.porcentaje > 0 && !discount.registrado && !discount.aplicable && !discount.aplicado)
  const subtotal = cart.total
  // La propina de C5 es informativa: se confirma al pagar y no entra en el Total, que es el mismo que verá el pago.
  const tipAmount = Math.round((cart.total * tip) / 100)
  const closing = code === 'C3' && entry ? extrasOf(entry.carta.categorias, cart.lineas.map((l) => l.producto_id))[0] : undefined
  const waiter = entry?.contexto.marca.mesero ?? ''
  const controls = (l: CartLine) => (
    <div className="flex items-center gap-2 mt-2">
      <div role="group" aria-label={l.nombre} className={`inline-flex items-center rounded-[9px] border ${border} overflow-hidden`}>
        <button type="button" aria-label={t('dish.fewer')} disabled={busy} onClick={() => step(l, -1)} className="w-11 h-11 grid place-items-center text-[17px] text-t-tinta-suave disabled:opacity-50">−</button>
        <span className="w-8 text-center font-t-mono tabular text-[15px]">{l.cantidad}</span>
        <button type="button" aria-label={t('dish.more')} disabled={busy} onClick={() => step(l, 1)} className={`w-11 h-11 grid place-items-center text-[17px] text-t-tinta-suave border-l ${border} disabled:opacity-50`}>＋</button>
      </div>
      <button type="button" aria-label={`${t('cart.remove')}: ${l.nombre}`} disabled={busy} onClick={() => remove(l.id)} className="h-11 px-2 text-[14px] text-busy-ink disabled:opacity-50">{t('cart.remove')}</button>
    </div>
  )
  return (
    <div className={shell}>
      {head}
      <Banner code={code} discount={discount} href={hrefs.signup} />
      <ul className="flex flex-col">
        {own.map((l, i) => (
          <Row key={l.id} code={code} line={l} n={i + 1} border={border} photo={code === 'C2' ? photoOf(l.producto_id) : null}
            open={code === 'C2' || editing === l.id} toggle={code === 'C2' ? undefined : () => setEditing((e) => (e === l.id ? null : l.id))}>
            {controls(l)}
          </Row>
        ))}
      </ul>
      {theirs.length > 0 && (
        <section className="flex flex-col">
          <h2 className="px-[18px] pt-3 pb-1 text-[12px] tracking-[0.12em] uppercase text-t-tinta-terciaria">{t('cart.others')}</h2>
          <ul className="flex flex-col">{theirs.map((l, i) => <Row key={l.id} code={code} line={l} n={own.length + i + 1} border={border} photo={code === 'C2' ? photoOf(l.producto_id) : null} open={false} />)}</ul>
        </section>
      )}
      {closing && (
        <div className="px-[18px] py-3 bg-t-acento/12 flex items-center gap-[11px]">
          <button type="button" aria-label={`${t('common.add')}: ${closing.nombre}`} disabled={busy} onClick={() => void addToCart(closing.id, 1, '')} className="w-11 h-11 -m-1.5 shrink-0 grid place-items-center disabled:opacity-50">
            <span aria-hidden="true" className="w-8 h-8 rounded-full bg-t-acento text-t-acento-tinta grid place-items-center text-[16px] leading-none">＋</span>
          </button>
          <div className="flex-1 min-w-0 flex flex-col">
            <span className="text-[15px] font-medium">{tc('closingTitle')}</span>
            <span className="text-[13px] opacity-[0.72]">{waiter ? tc('closingBy', { waiter, name: closing.nombre, amount: price(closing.precio) }) : tc('closing', { name: closing.nombre, amount: price(closing.precio) })}</span>
          </div>
        </div>
      )}
      <Link href={hrefs.menu} className="self-start mx-[18px] inline-flex items-center h-11 text-[14px] font-medium text-t-acento">{t('cart.addMore')}</Link>
      <dl className={`px-[18px] py-4 border-t ${border} bg-t-superficie flex flex-col`}>
        <div className="flex justify-between py-[3px] text-[15px] text-t-tinta-suave"><dt>{t('cart.subtotal')}</dt><dd className="font-t-mono tabular">{price(subtotal)}</dd></div>
        {applied && discount && code !== 'C4' && <div className="flex justify-between py-[3px] text-[15px] text-free"><dt>{t('cart.discountLine', { pct })}</dt><dd className="font-t-mono tabular">−{formatCop(discount.monto)}</dd></div>}
        <div className={`flex justify-between items-baseline gap-2.5 pt-2.5 mt-2 border-t ${code === 'C4' ? 'border-dotted' : ''} ${border}`}>
          <dt className={dark ? 't-title text-[25px] leading-none' : 'text-[18px] font-bold tracking-[-0.02em]'}>{tc('total')}</dt>
          <dd className="flex items-center gap-2">
            {code === 'C4' && applied && <span className="h-[26px] px-[9px] rounded-[7px] bg-free/22 text-free-soft text-[13px] font-medium grid place-items-center">{tc('chipApplied', { pct })}</span>}
            <span className="font-t-mono tabular text-[25px] whitespace-nowrap">{money(Math.max(0, cart.total - (discount?.monto ?? 0)))}</span>
          </dd>
        </div>
      </dl>
      {code === 'C5' && (
        // Propina fuera de la caja de totales: es una intención que se confirma al pagar, no una cifra que entre en el Total.
        <section aria-label={tc('tipLabel')} className={`px-[18px] py-3.5 border-t ${border} bg-t-superficie flex flex-col gap-2.5`}>
          <div className="flex justify-between text-[15px] text-t-tinta-suave">
            <span>{tip > 0 ? tc('tip', { pct: tip }) : tc('tipLabel')}</span>
            {tip > 0 && <span className="font-t-mono tabular">{price(tipAmount)}</span>}
          </div>
          <div role="radiogroup" aria-label={tc('tipLabel')} className="flex gap-[7px]">
            {TIPS.map((p) => <button key={p} type="button" role="radio" aria-checked={tip === p} onClick={() => setTip(p)} className={`flex-1 h-11 rounded-[9px] text-[14px] ${tip === p ? 'bg-t-acento text-t-acento-tinta font-medium' : 'border border-t-borde text-t-tinta-suave'}`}>{p === 0 ? tc('noTip') : tc('tipPct', { pct: p })}</button>)}
          </div>
          <span className="text-[12px] text-t-tinta-terciaria">{tc('tipNote')}</span>
        </section>
      )}
      <div className={`sticky bottom-0 px-[18px] py-3.5 border-t ${border} bg-t-superficie flex flex-col gap-2.5`}>
        <button type="button" disabled={busy || sending} onClick={() => void onConfirm()} className={primary}>{sending ? t('cart.confirming') : tc('send')}</button>
        <button type="button" disabled={busy || sending} onClick={goPay} className={secondary}>{t('cart.goPay')}</button>
        {(code === 'C2' || code === 'C3') && applied && <span className="text-center text-[13px] text-free">{tc('includes', { pct })}</span>}
        {pending && (code === 'C2' || code === 'C3' || code === 'C4') && <Link href={hrefs.signup} className="text-center text-[13px] font-medium text-t-acento">{t('cart.discountHint', { pct })}</Link>}
        <Link href={hrefs.table} className="self-center inline-flex items-center h-11 text-[14px] text-t-tinta-suave">{t('cart.payAtTable')}</Link>
      </div>
    </div>
  )
}

// Banner del 5 % bajo la cabecera (C1, C5): aplicado → «Primera compra: descuento aplicado.»; disponible → invitación al registro.
// El ámbar del banner es fijo del diseño: sobre oscuro #E4B879, sobre claro #A06E2C / #6B4A05.
function Banner({ code, discount, href }: { code: FamilyCCode; discount: Discount | null; href: string }) {
  const t = useTranslations('diner')
  const tc = useTranslations('diner.templates.familiaC.cart')
  if ((code !== 'C1' && code !== 'C5') || !discount) return null
  const dark = isDarkC(code)
  const pct = discount.porcentaje
  const cls = `px-[18px] py-[13px] border-b border-t-borde flex items-center gap-2.5 ${dark ? 'bg-t-acento/16' : 'bg-t-acento-suave'}`
  const big = `text-[22px] font-bold tracking-[-0.02em] ${dark ? 'text-[#E4B879]' : 'text-[#A06E2C]'}`
  const text = `text-[14px] leading-[1.35] ${dark ? 'text-[#E4B879]' : 'text-[#6B4A05]'}`
  if (discount.aplicado || discount.aplicable) return <div className={cls}><span className={big}>{pct}%</span><span className={text}>{tc('firstPurchaseApplied')}</span></div>
  if (!discount.registrado && discount.porcentaje > 0) return <Link href={href} className={cls}><span className={big}>{pct}%</span><span className={text}>{t('cart.discountHint', { pct })}</span></Link>
  return null
}

// Una línea en la variante de su plantilla. `toggle` (donde el marco no dibuja controles) abre y cierra los controles con un toque.
function Row({ code, line, n, border, photo, open, toggle, children }: { code: FamilyCCode; line: CartLine; n: number; border: string; photo: string | null; open: boolean; toggle?: () => void; children?: React.ReactNode }) {
  const t = useTranslations('diner')
  const tc = useTranslations('diner.templates.familiaC.cart')
  const amount = price(line.subtotal)
  const body = (() => {
    switch (code) {
      case 'C1':
        return (
          <div className="flex items-center gap-3.5">
            <span aria-hidden="true" className="t-title text-[32px] leading-none text-t-acento w-[34px] shrink-0">{n}</span>
            <div className="flex-1 min-w-0"><div className="t-title text-[23px] leading-none">{line.nombre}</div>{line.nota && <div className="text-[13px] text-t-tinta-suave mt-[3px]">{line.nota}</div>}</div>
            <span className="font-t-mono tabular text-[17px] whitespace-nowrap">{amount}</span>
          </div>
        )
      case 'C2':
        return (
          <div className="flex gap-3">
            <div className="w-[54px] h-[54px] rounded-[10px] bg-muted overflow-hidden shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {photo && <img src={photo} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between gap-2.5"><span className="text-[16px] font-medium">{line.nombre}</span><span className="font-t-mono tabular text-[15px] whitespace-nowrap">{amount}</span></div>
              {line.nota && <div className="text-[13px] text-t-tinta-suave mt-0.5">{line.nota}</div>}
            </div>
          </div>
        )
      case 'C3':
        return (
          <div className="flex flex-col">
            <div className="flex justify-between gap-2.5"><span className="text-[16px] font-medium">{line.nombre}</span><span className="font-t-mono tabular text-[15px] whitespace-nowrap">{amount}</span></div>
            <div className="flex flex-wrap gap-1.5 mt-[7px]">
              {line.nota && <span className="h-[26px] px-[9px] rounded-[6px] bg-muted text-t-tinta-suave text-[12px] grid place-items-center">{line.nota}</span>}
              <span className="h-[26px] px-[9px] rounded-[6px] bg-muted text-t-tinta-suave text-[12px] grid place-items-center">{tc('vat')}</span>
            </div>
          </div>
        )
      case 'C4':
        return (
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2"><span className="t-title text-[24px] leading-none">{line.nombre}</span><span aria-hidden="true" className="flex-1 border-b border-dotted border-t-tinta/28" /><span className="font-t-mono tabular text-[15px] whitespace-nowrap">{amount}</span></div>
            {line.nota && <div className="text-[13px] text-t-tinta-suave mt-1">{line.nota}</div>}
          </div>
        )
      case 'C5':
        return (
          <div className="flex items-center gap-3.5">
            <span aria-hidden="true" className="font-t-mono tabular text-[19px] leading-none text-t-acento w-[34px] shrink-0">{n}</span>
            <div className="flex-1 min-w-0"><div className="text-[16px] font-bold tracking-[-0.02em] leading-[1.15]">{line.nombre}</div>{line.nota && <div className="text-[13px] text-t-tinta-suave mt-[3px]">{line.nota}</div>}</div>
            <span className="font-t-mono tabular text-[17px] whitespace-nowrap">{amount}</span>
          </div>
        )
    }
  })()
  const pad = code === 'C2' || code === 'C3' ? 'py-3' : 'py-[15px]'
  return (
    <li className={`px-[18px] ${pad} border-b ${border} flex flex-col`}>
      {toggle
        ? <button type="button" aria-expanded={open} aria-label={`${tc('edit', { name: line.nombre })} · ${t('cart.note')}: ${line.nota || '—'}`} onClick={toggle} className="text-left w-full min-h-11">{body}</button>
        : body}
      {open && children}
    </li>
  )
}
