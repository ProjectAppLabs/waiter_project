'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { fold, tabId } from '@/components/templates/generic/menuParts'
import { formatCop, itemCount } from '@/lib/domain/cart'
import type { Cart, Category, Dish, Template } from '@/lib/types'

// Familia A · Alta cocina: piezas comunes de los cinco menús, el carrito y el pago. Todo con tokens --t-*; los marcos fijan las medidas.

// Piel por plantilla: qué cambia entre A1…A5 sin salirse de los tokens (docs/diseno/plantillas/A*/spec.json).
export interface FamilyASkin {
  code: string
  dark: boolean
  // CTA en serif (A1 y A5) o en Ubuntu 700 (A2, A3, A4).
  serifCta: boolean
  // Inputs blancos: sobre crema son la superficie (A1, A2, A5); sobre blanco son el fondo (A3, A4).
  input: string
  // Cajas de aviso: #F2EEE8 en claro (muted de Waiter), superficie en oscuro.
  note: string
  // Pies de totales y CTA: #FAF8F5 = superficie en A2/A3/A4; en A1/A5 es visualmente el fondo.
  foot: string
  // Tipografía del CTA principal y sus alturas: el carrito mide 56 px (60 en A5) y el pago 60 px (64 en A5), como fijan los bloques
  // cta de spec.pantallas.carrito / pago.
  cta: string
  payCta: string
  // Guía de totales: punteada (A1, A2, A5) o continua (A3, A4).
  rule: string
}
export function skinOf(t: Template): FamilyASkin {
  const code = t.codigo.toUpperCase()
  const dark = t.tokens.modo === 'oscuro'
  const serifCta = code === 'A1' || code === 'A5'
  const font = code === 'A5' ? 'font-t-display text-[20px] leading-[1.1]' : serifCta ? 'font-t-display text-[19px] leading-[1.1]' : 'text-[16px] font-bold'
  return {
    code, dark, serifCta,
    input: code === 'A3' || code === 'A4' ? 'bg-t-fondo' : 'bg-t-superficie',
    note: dark ? 'bg-t-superficie' : 'bg-muted',
    foot: serifCta ? 'bg-t-fondo' : 'bg-t-superficie',
    cta: `${code === 'A5' ? 'h-[60px]' : 'h-14'} ${font}`,
    payCta: `${code === 'A5' ? 'h-16' : 'h-[60px]'} ${font}`,
    rule: serifCta || dark ? 'border-dotted' : 'border-solid',
  }
}
export type CtaSize = 'cart' | 'pay'
const ctaOf = (s: FamilyASkin, size: CtaSize) => (size === 'pay' ? s.payCta : s.cta)
export const primaryCta = (s: FamilyASkin, size: CtaSize = 'cart') => `${ctaOf(s, size)} rounded-t-boton bg-t-acento text-t-acento-tinta disabled:opacity-60`
export const secondaryCta = (s: FamilyASkin, size: CtaSize = 'cart') => `${ctaOf(s, size)} rounded-t-boton bg-t-superficie border border-t-borde text-t-tinta disabled:opacity-60`

// Filtra una carta por texto conservando las secciones: cada categoría queda con los platos que coinciden; las vacías se van.
export function filterSections(categories: Category[], category: number | null, query: string): Category[] {
  const needle = fold(query)
  const pool = category === null ? categories : categories.filter((c) => c.id === category)
  return pool.map((c) => ({ ...c, productos: needle ? c.productos.filter((d) => fold(d.nombre).includes(needle)) : c.productos })).filter((c) => c.productos.length > 0)
}

// Atributos opcionales (contrato 2) como textos cortos. Sin dato, sin chip: nunca se inventa.
export function attributeChips(dish: Dish, t: (key: string, values?: Record<string, string | number>) => string): string[] {
  const a = dish.atributos
  if (!a) return []
  const out: string[] = []
  if (a.piezas) out.push(t('pieces', { n: a.piezas }))
  if (a.picante) out.push(`${t('spicy')} ${'●'.repeat(a.picante)}`)
  for (const tag of a.etiquetas ?? []) out.push(tag)
  if (a.abv !== undefined) out.push(t('abv', { abv: a.abv }))
  if (a.ibu !== undefined) out.push(t('ibu', { ibu: a.ibu }))
  if (a.soloHoy) out.push(t('onlyToday'))
  for (const size of a.tamanos ?? []) out.push(`${size.nombre} · ${formatCop(size.precio)}`)
  if (a.alergenos && a.alergenos.length > 0) out.push(t('contains', { list: a.alergenos.join(', ') }))
  return out
}

// Índice de categorías en versalitas (A1, A2, A4, A5): mismas semánticas que CategoryTabs (tablist, flechas, Home/End) con la voz editorial.
// `all` añade «Todo» (null); sin él, la primera pestaña es la primera categoría (A2 muestra un menú a la vez).
export function EditorialTabs({ categories, category, setCategory, all = true, className = '' }: { categories: Category[]; category: number | null; setCategory: (c: number | null) => void; all?: boolean; className?: string }) {
  const t = useTranslations('diner.menu')
  const values: (number | null)[] = [...(all ? [null] : []), ...categories.map((c) => c.id)]
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const index = values.indexOf(category)
    const target = e.key === 'ArrowRight' ? index + 1 : e.key === 'ArrowLeft' ? index - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? values.length - 1 : null
    if (target === null) return
    e.preventDefault()
    const next = values[(target + values.length) % values.length] ?? null
    setCategory(next)
    document.getElementById(tabId(next))?.focus()
  }
  const tab = (value: number | null, label: string) => {
    const active = category === value
    return (
      <button key={tabId(value)} type="button" role="tab" id={tabId(value)} aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => setCategory(value)}
        className={`shrink-0 h-tap-min px-2 text-[11px] tracking-[0.2em] uppercase whitespace-nowrap border-b-2 ${active ? 'text-t-tinta border-current' : 'text-t-tinta-terciaria border-transparent'}`}>{label}</button>
    )
  }
  return (
    <div role="tablist" aria-label={t('categories')} onKeyDown={onKeyDown} className={`flex gap-1 overflow-x-auto [scrollbar-width:none] ${className}`}>
      {all && tab(null, t('all'))}
      {categories.map((c) => tab(c.id, c.nombre))}
    </div>
  )
}

// Búsqueda de Waiter plegada: un botón «Buscar» en versalitas abre el campo; queda abierto mientras haya texto. Los marcos de la familia no
// dibujan buscador, así que ocupa lo mínimo y se cierra con «×».
export function SearchToggle({ query, setQuery, open: forcedOpen, className = '' }: { query: string; setQuery: (q: string) => void; open?: boolean; className?: string }) {
  const t = useTranslations('diner')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const visible = open || forcedOpen === true || query !== ''
  useEffect(() => { if (open) ref.current?.focus() }, [open])
  if (!visible) return <button type="button" onClick={() => setOpen(true)} className={`shrink-0 h-tap-min px-2 text-[11px] tracking-[0.2em] uppercase text-t-tinta-terciaria ${className}`}>{t('templates.familiaA.searchOpen')}</button>
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <input ref={ref} type="search" aria-label={t('menu.search')} placeholder={t('menu.search')} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off"
        className="h-tap-min w-full min-w-0 rounded-t-chip bg-t-superficie border border-t-borde px-4 text-[15px] text-t-tinta placeholder:text-t-tinta-terciaria" />
      <button type="button" aria-label={t('templates.familiaA.searchClose')} onClick={() => { setQuery(''); setOpen(false) }} className="shrink-0 w-tap-min h-tap-min grid place-items-center text-[20px] text-t-tinta-suave">×</button>
    </div>
  )
}

// Estado vacío honesto (como GenericMenu): habla de búsqueda solo si el comensal buscó.
export function EmptyMenu({ query, category, setQuery, setCategory }: { query: string; category: number | null; setQuery: (q: string) => void; setCategory: (c: number | null) => void }) {
  const t = useTranslations('diner')
  const text = query ? t('menu.empty') : category === null ? t('menu.emptyMenu') : t('menu.emptyCategory')
  const filtered = query !== '' || category !== null
  return (
    <div className="py-10 flex flex-col items-center gap-4 text-center">
      <p role="status" className="text-base text-t-tinta-suave">{text}</p>
      {filtered && <button type="button" onClick={() => { setQuery(''); setCategory(null) }} className="h-tap-min px-[18px] rounded-t-boton bg-t-superficie border border-t-borde text-[15px] font-medium text-t-tinta">{t('home.seeAll')}</button>}
    </div>
  )
}

// ＋ de 48 px de toque con dibujo de 32 px: hueco (borde) en las filas editoriales, relleno en el acento donde el marco lo pinta.
export function AddButton({ dish, onAdd, filled = false, disabled = false }: { dish: Dish; onAdd: (d: Dish) => void; filled?: boolean; disabled?: boolean }) {
  const t = useTranslations('diner.common')
  return (
    <button type="button" aria-label={`${t('add')}: ${dish.nombre}`} disabled={disabled} onClick={() => onAdd(dish)} className="shrink-0 w-tap-min h-tap-min -m-2 grid place-items-center disabled:opacity-50">
      <span aria-hidden="true" className={`w-8 h-8 rounded-full grid place-items-center text-[16px] leading-none ${filled ? 'bg-t-acento text-t-acento-tinta' : 'border border-t-borde text-t-tinta'}`}>＋</span>
    </button>
  )
}

export function SoldOutBadge({ className = '' }: { className?: string }) {
  const t = useTranslations('diner.common')
  return <span data-testid="sold-out-badge" className={`inline-flex items-center h-6 px-2 rounded-t-chip bg-t-superficie/90 border border-t-borde text-[11px] font-medium tracking-[0.04em] text-busy-ink ${className}`}>{t('soldOut')}</span>
}

// Foto con recorte fijo; sin foto, el placeholder «Foto del plato» (#F2EEE8 = muted). Agotado: foto al 55 % con la insignia encima.
export function DishPhoto({ dish, className = '', placeholderClass = 'bg-muted', badge = true }: { dish: Dish; className?: string; placeholderClass?: string; badge?: boolean }) {
  const t = useTranslations('diner.templates')
  return (
    <div className={`relative grid place-items-center overflow-hidden text-[11px] tracking-[0.1em] uppercase text-t-tinta-terciaria ${placeholderClass} ${className}`}>
      {/* La foto viene de experience por URL; next.config la sirve sin optimizar (images.unoptimized). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {dish.foto ? <img src={dish.foto} alt="" className={`w-full h-full object-cover ${dish.agotado ? 'opacity-55' : ''}`} /> : <span>{t('photo')}</span>}
      {badge && dish.agotado && dish.foto && <SoldOutBadge className="absolute top-2 right-2" />}
    </div>
  )
}

// Atenuación de agotado: una sola vez (55 %) y solo sobre el contenido; la insignia queda fuera para seguir legible.
export const dimIf = (dish: Dish) => (dish.agotado ? 'opacity-55' : '')

// Plato editorial (A1; A5 lo reutiliza dentro de la sección): nombre en serif 21, descripción larga, precio discreto en mono.
// La fila entera abre el plato; el ＋ hueco junto al precio lo agrega. Agotado: nombre, descripción y precio al 55 %, insignia entera.
export function EditorialDish({ dish, onOpen, onAdd }: { dish: Dish; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void }) {
  return (
    <article className="flex flex-col gap-1">
      <button type="button" onClick={() => onOpen(dish)} className={`w-full text-left flex flex-col gap-1 ${dimIf(dish)}`}>
        <span className="font-t-display text-[21px] leading-[1.15] text-t-tinta">{dish.nombre}</span>
        {dish.descripcion && <span className="text-[14px] leading-[1.45] text-t-tinta-suave">{dish.descripcion}</span>}
      </button>
      <div className="flex items-center justify-between gap-3">
        <span className={`font-t-mono tabular text-[15px] text-t-tinta ${dimIf(dish)}`}>{formatCop(dish.precio)}</span>
        {dish.agotado ? <SoldOutBadge /> : <AddButton dish={dish} onAdd={onAdd} />}
      </div>
    </article>
  )
}

// Barra de pedido de la familia: la única en pantalla (la página no pinta su OrderBar sobre los layouts registrados). `pill` es la de A1
// («Tu pedido» + píldora «Ver · N», siempre visible como en el marco); `line` es la línea discreta que añaden los marcos que no la dibujan
// (A2, A3, A4, A5), solo cuando hay algo pedido. Pegada abajo (sticky) mientras se recorre la carta; `sticky={false}` cuando el layout ya la
// mete en su propio pie pegado (A3), para que no haya dos bloques pegados encimados.
export function OrderStrip({ cart, href, variant, sticky = true }: { cart: Cart | null; href: string; variant: 'pill' | 'line'; sticky?: boolean }) {
  const t = useTranslations('diner.templates.familiaA')
  const count = itemCount(cart)
  const amount = formatCop(cart?.total ?? 0)
  const stick = sticky ? 'sticky bottom-0' : ''
  if (variant === 'line') {
    if (count === 0) return null
    return (
      <Link href={href} className={`${stick} flex items-center justify-between gap-3 px-6 h-tap-min border-t border-t-borde bg-t-fondo text-[13px] text-t-tinta-suave`}>
        <span>{t('orderLine', { n: count, amount })}</span>
        <span className="font-medium text-t-tinta">{t('seeOrder')} →</span>
      </Link>
    )
  }
  return (
    <div className={`${stick} flex items-center justify-between gap-3 px-6 py-3.5 border-t border-t-borde bg-t-fondo`}>
      <span className="text-[14px] text-t-tinta-suave">{t('yourOrder')}{count > 0 && <span className="font-t-mono tabular"> · $ {amount}</span>}</span>
      <Link href={href} className="inline-flex items-center h-11 px-4 rounded-t-chip bg-t-acento text-t-acento-tinta text-[14px] font-medium">{t('see', { n: count })}</Link>
    </div>
  )
}
