'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo } from 'react'

import { tabId } from '@/components/templates/generic/menuParts'
import { formatCop, itemCount } from '@/lib/domain/cart'
import { getAccount } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Cart, Category, Dish, DishAttributes, PhotoCrop } from '@/lib/types'

// Piezas compartidas de la familia D (Café y panadería). Solo tokens --t-* y los fijos de Waiter (verde/rojo/ámbar, gris #F2EEE8
// del placeholder «Foto del plato»); nada de hex del marco en duro.

// Recorte de foto según spec.fotos.recorte. 'ninguno' deja la altura al contenedor.
export const CROP: Record<PhotoCrop, string> = { '4x3': 'aspect-[4/3]', '1x1': 'aspect-square', '3x4': 'aspect-[3/4]', '3x2': 'aspect-[3/2]', ninguno: '' }

// Foto con object-cover; sin foto, placeholder «Foto del plato». No atenúa nada: el agotado lo atenúa una sola vez la tarjeta o la
// fila que la contiene (55 % en D3, 50 % en D5), como piden los marcos; atenuar también aquí dejaba la foto casi invisible.
export function DishPhoto({ dish, className = '' }: { dish: Dish; className?: string }) {
  const t = useTranslations('diner.templates')
  return (
    <div className={`relative shrink-0 overflow-hidden bg-muted grid place-items-center text-[10px] tracking-[0.08em] uppercase text-center text-t-tinta-terciaria ${className}`}>
      {/* La foto viene de experience por URL; next.config la sirve sin optimizar (images.unoptimized). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {dish.foto ? <img src={dish.foto} alt="" className="w-full h-full object-cover" /> : <span className="px-1">{t('photo')}</span>}
    </div>
  )
}

export function SoldOutBadge({ className = '' }: { className?: string }) {
  const t = useTranslations('diner.common')
  return <span data-testid="sold-out-badge" className={`inline-flex items-center h-[22px] px-2 rounded-t-chip bg-busy-soft text-busy-ink text-[11px] font-medium whitespace-nowrap ${className}`}>{t('soldOut')}</span>
}

// ＋ con 44 px de toque sin agrandar el dibujo: `circle` es el aspecto del círculo (tamaño y colores) que cada marco decide.
export function AddButton({ dish, onAdd, circle, className = '' }: { dish: Dish; onAdd: (d: Dish) => void; circle: string; className?: string }) {
  const t = useTranslations('diner.common')
  return (
    <button type="button" aria-label={`${t('add')}: ${dish.nombre}`} onClick={() => onAdd(dish)} className={`w-11 h-11 shrink-0 grid place-items-center ${className}`}>
      <span aria-hidden="true" className={`grid place-items-center leading-none ${circle}`}>＋</span>
    </button>
  )
}

// Buscador de Waiter: cada layout le da su trazo con `className`.
export function SearchField({ query, setQuery, className }: { query: string; setQuery: (q: string) => void; className: string }) {
  const t = useTranslations('diner.menu')
  return <input type="search" aria-label={t('search')} placeholder={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" className={className} />
}

// Pestañas de categoría con el trazo del marco: `chip` dibuja cada pestaña y `className` el contenedor entero (D5 las quiere de ancho
// igual y pone una rejilla). Misma accesibilidad que CategoryTabs: tablist, ←/→, Home/End.
export function TabRow({ categories, category, setCategory, chip, className = 'flex gap-2 overflow-x-auto [scrollbar-width:none]' }: { categories: Category[]; category: number | null; setCategory: (c: number | null) => void; chip: (active: boolean) => string; className?: string }) {
  const t = useTranslations('diner.menu')
  const values: (number | null)[] = [null, ...categories.map((c) => c.id)]
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
    return <button key={tabId(value)} type="button" role="tab" id={tabId(value)} aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => setCategory(value)} className={chip(active)}>{label}</button>
  }
  return (
    <div role="tablist" aria-label={t('categories')} onKeyDown={onKeyDown} className={className}>
      {tab(null, t('all'))}
      {categories.map((c) => tab(c.id, c.nombre))}
    </div>
  )
}

// Estado vacío honesto (como el genérico): habla de búsqueda solo si el comensal buscó.
export function MenuEmpty({ query, category, setQuery, setCategory, button }: { query: string; category: number | null; setQuery: (q: string) => void; setCategory: (c: number | null) => void; button: string }) {
  const t = useTranslations('diner')
  const text = query ? t('menu.empty') : category === null ? t('menu.emptyMenu') : t('menu.emptyCategory')
  const filtered = query !== '' || category !== null
  return (
    <div className="py-10 flex flex-col items-center gap-4 text-center">
      <p role="status" className="text-base text-t-tinta-suave">{text}</p>
      {filtered && <button type="button" onClick={() => { setQuery(''); setCategory(null) }} className={button}>{t('home.seeAll')}</button>}
    </div>
  )
}

// Nota legal de las fotos generadas con IA: de la carta entera, antes de la lista.
export function ReferenceNote({ show, className = '' }: { show: boolean | undefined; className?: string }) {
  const t = useTranslations('diner.menu')
  return show ? <p className={`text-[13px] text-t-tinta-suave ${className}`}>{t('referenceImages')}</p> : null
}

// Atributos opcionales (contrato 2): solo los que existen; sin dato no hay chip ni hueco.
export function AttributeChips({ attrs, className = '', chip = 'inline-flex items-center h-[22px] px-2 rounded-t-chip bg-t-superficie border border-t-borde text-[11px] text-t-tinta-suave' }: { attrs: DishAttributes | undefined; className?: string; chip?: string }) {
  const t = useTranslations('diner.templates.familiaD.attrs')
  if (!attrs) return null
  const items: string[] = []
  if (attrs.soloHoy) items.push(t('today'))
  if (attrs.piezas) items.push(t('pieces', { n: attrs.piezas }))
  // Un 0 (picante 0, ABV 0, IBU 0) no es una escala que pintar: solo se muestra lo que dice algo.
  if (attrs.picante) items.push(t('spicy', { level: attrs.picante }))
  if (attrs.abv) items.push(t('abv', { abv: attrs.abv }))
  if (attrs.ibu) items.push(t('ibu', { ibu: attrs.ibu }))
  for (const e of attrs.etiquetas ?? []) items.push(e)
  if (items.length === 0) return null
  return <div className={`flex flex-wrap gap-1 ${className}`}>{items.map((i) => <span key={i} className={chip}>{i}</span>)}</div>
}

// Barra oscura «N ítems · total / Ver pedido →», pegada abajo del layout (la página no pinta su barra sobre los layouts fieles).
// Es la barra del marco de D5, que la muestra siempre; los marcos sin barra propia (D2, D3, D4) la piden con `hideWhenEmpty`
// y así cumplen la norma de Waiter (lo pedido nunca se pierde de vista) sin añadir nada al marco mientras no hay pedido.
// Oscura por norma de Waiter (bg-dark), enlace en el acento.
export function DarkOrderBar({ cart, href, hideWhenEmpty = false }: { cart: Cart | null; href: string; hideWhenEmpty?: boolean }) {
  const t = useTranslations('diner.orderBar')
  if (hideWhenEmpty && itemCount(cart) === 0) return null
  return (
    <Link href={href} aria-label={t('yourOrder')} className="sticky bottom-0 z-30 px-5 py-3 border-t border-t-borde bg-dark text-dark-ink flex items-center justify-between min-h-[52px]">
      <span className="text-[14px]">{t('items', { n: itemCount(cart) })} · <span className="font-t-mono tabular">{formatCop(cart?.total ?? 0)}</span></span>
      <span className="text-[14px] font-medium text-t-acento">{t('seeOrder')}</span>
    </Link>
  )
}

// Índice id → plato de la carta cargada (para miniaturas del carrito y para «Pedir igual»). Vacío si la carta aún no llegó.
export function useDishIndex(): Map<number, Dish> {
  const entry = useDinerStore((s) => s.entry)
  return useMemo(() => new Map((entry?.carta.categorias ?? []).flatMap((c) => c.productos).map((d) => [d.id, d])), [entry])
}

// Cuenta del comensal desde el store (la carta no la recibe por props). Un comensal anónimo no tiene cuenta, así que «account
// null» no significa «aún no se pidió»: se pregunta a experience UNA vez por carga de la app, fuera de `run` (nada de busy global
// parpadeando ni de un error de red pintado en la carta) y en silencio si falla: sin cuenta la carta se muestra anónima y ya.
let accountProbed = false
export const resetAccountProbe = () => { accountProbed = false }
export function useDinerAccount() {
  const account = useDinerStore((s) => s.account)
  const orders = useDinerStore((s) => s.accountOrders)
  useEffect(() => {
    if (account || accountProbed) return
    accountProbed = true
    getAccount().then((r) => useDinerStore.setState({ account: r.cuenta, accountOrders: r.pedidos ?? [] })).catch(() => { /* anónimo o sin red: la carta no lo necesita */ })
  }, [account])
  return { account, orders }
}
