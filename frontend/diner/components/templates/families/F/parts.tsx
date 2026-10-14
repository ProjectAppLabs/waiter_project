'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { tabId } from '@/components/templates/generic/menuParts'
import { formatCop, itemCount } from '@/lib/domain/cart'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Cart, Category, Dish, Menu } from '@/lib/types'

// Piezas compartidas por la familia F (sushi y especializados): conteo de piezas del carrito, pestañas con la piel de cada
// marco, buscador plegable, foto con recorte/agotado y el ＋ de 44 px. Solo tokens --t-* y los semánticos fijos de Waiter.

// Piezas del carrito: Σ atributos.piezas × cantidad buscando cada línea en la carta. null si ninguna línea trae piezas
// (entonces las pantallas dicen «N ítems», nunca inventan un conteo).
export function piecesIn(cart: Cart | null, menu: Menu | null | undefined): number | null {
  if (!cart || !menu) return null
  const pieces = new Map<number, number>()
  for (const c of menu.categorias) for (const d of c.productos) if (d.atributos?.piezas) pieces.set(d.id, d.atributos.piezas)
  let total = 0
  let found = false
  for (const l of cart.lineas) {
    const p = pieces.get(l.producto_id)
    if (p) { total += p * l.cantidad; found = true }
  }
  return found ? total : null
}

// «18 piezas» o «3 ítems» según lo que traiga la carta; cadena vacía con el carrito vacío.
export function useCountLabel(): (cart: Cart | null, menu: Menu | null | undefined) => string {
  const t = useTranslations('diner.templates.familiaF')
  return (cart, menu) => {
    const count = itemCount(cart)
    if (count === 0) return ''
    const pieces = piecesIn(cart, menu)
    return pieces !== null ? t('pieces', { n: pieces }) : t('items', { n: count })
  }
}

// Carrito y pago no reciben la carta por props (contrato 4); la leen del store solo para contar piezas y poner miniaturas.
export const useCarta = (): Menu | null => useDinerStore((s) => s.entry?.carta ?? null)

// «para 3» como etiqueta del producto → 3 comensales (F5). No existe atributos.personas en el contrato 2: se lee de la etiqueta y nada más.
export function peopleOf(dish: Dish): number | null {
  for (const tag of dish.atributos?.etiquetas ?? []) {
    const m = /^para\s+(\d+)$/i.exec(tag.trim())
    if (m) return Number(m[1])
  }
  return null
}

// Pestañas de categoría (WAI-ARIA tabs, ←/→/Home/End) con la clase del chip que decide cada marco.
export function FTabs({ categories, category, setCategory, chip, className = '' }: { categories: Category[]; category: number | null; setCategory: (c: number | null) => void; chip: (active: boolean) => string; className?: string }) {
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
    return <button key={tabId(value)} type="button" role="tab" id={tabId(value)} aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => setCategory(value)} className={`shrink-0 whitespace-nowrap ${chip(active)}`}>{label}</button>
  }
  return (
    <div role="tablist" aria-label={t('categories')} onKeyDown={onKeyDown} className={`flex gap-1.5 overflow-x-auto [scrollbar-width:none] ${className}`}>
      {tab(null, t('all'))}
      {categories.map((c) => tab(c.id, c.nombre))}
    </div>
  )
}

// Buscador de Waiter plegado en una lupa de 44 px: los marcos de la familia no dibujan campo de búsqueda y así no se rompe su cabecera.
export function SearchToggle({ open, setOpen, className = '' }: { open: boolean; setOpen: (open: boolean) => void; className?: string }) {
  const t = useTranslations('diner.menu')
  return (
    <button type="button" aria-label={t('search')} aria-pressed={open} aria-controls="f-search" onClick={() => setOpen(!open)} className={`shrink-0 w-11 h-11 grid place-items-center ${className}`}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
    </button>
  )
}
export function SearchField({ query, setQuery, className = '' }: { query: string; setQuery: (q: string) => void; className?: string }) {
  const t = useTranslations('diner.menu')
  return <input id="f-search" type="search" aria-label={t('search')} placeholder={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" autoFocus className={`h-11 w-full rounded-t-boton bg-t-superficie border border-t-borde px-3.5 text-base text-t-tinta placeholder:text-t-tinta-terciaria ${className}`} />
}

// Foto con el recorte del marco (el contenedor fija el tamaño); placeholder «Foto del plato» sobre #F2EEE8; agotado al 55 % con insignia.
export function DishPhoto({ dish, className = '', badge = true }: { dish: Dish; className?: string; badge?: boolean }) {
  const t = useTranslations('diner')
  return (
    <div className={`relative bg-muted grid place-items-center overflow-hidden text-[10px] tracking-[0.08em] uppercase text-t-tinta-terciaria text-center ${className}`}>
      {/* La foto viene de experience por URL y next.config la sirve sin optimizar (images.unoptimized). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {dish.foto ? <img src={dish.foto} alt="" className={`w-full h-full object-cover ${dish.agotado ? 'opacity-55' : ''}`} /> : <span className="px-1">{t('templates.photo')}</span>}
      {badge && dish.agotado && <span data-testid="sold-out-badge" className="absolute inset-x-1 bottom-1 rounded-t-chip bg-t-superficie/90 px-1 py-0.5 text-[10px] font-medium normal-case tracking-[0.02em] text-busy-ink">{t('common.soldOut')}</span>}
    </div>
  )
}

// ＋ con área de toque de 44 px; el círculo dibujado lo decide el marco. Agotado: no hay ＋ y se dice «Agotado» una sola vez:
// si la fila ya lleva la insignia sobre la foto (DishPhoto), soldOutLabel=false evita repetirlo.
export function AddButton({ dish, onAdd, circle = 'w-[34px] h-[34px] rounded-full bg-t-acento text-t-acento-tinta text-[17px]', soldOutLabel = true }: { dish: Dish; onAdd: (d: Dish) => void; circle?: string; soldOutLabel?: boolean }) {
  const t = useTranslations('diner.common')
  if (dish.agotado) return soldOutLabel ? <span className="text-[12px] font-medium text-busy-ink">{t('soldOut')}</span> : null
  return (
    <button type="button" aria-label={`${t('add')}: ${dish.nombre}`} onClick={() => onAdd(dish)} className="w-11 h-11 -m-[5px] shrink-0 grid place-items-center">
      <span aria-hidden="true" className={`grid place-items-center leading-none ${circle}`}>＋</span>
    </button>
  )
}

// Estado vacío honesto (como el genérico): habla de búsqueda solo si el comensal buscó.
export function MenuEmpty({ query, category, setQuery, setCategory }: { query: string; category: number | null; setQuery: (q: string) => void; setCategory: (c: number | null) => void }) {
  const t = useTranslations('diner')
  const text = query ? t('menu.empty') : category === null ? t('menu.emptyMenu') : t('menu.emptyCategory')
  const filtered = query !== '' || category !== null
  return (
    <div className="px-5 py-10 flex flex-col items-center gap-4 text-center">
      <p role="status" className="text-base text-t-tinta-suave">{text}</p>
      {filtered && <button type="button" onClick={() => { setQuery(''); setCategory(null) }} className="h-11 px-[18px] rounded-t-boton bg-t-superficie border border-t-borde text-[15px] font-medium text-t-tinta">{t('home.seeAll')}</button>}
    </div>
  )
}

// Nota legal de imágenes de referencia: una vez, de la carta entera.
export function ReferenceNote({ menu }: { menu: Menu }) {
  const t = useTranslations('diner.menu')
  return menu.imagenesDeReferencia ? <p className="px-5 py-2 text-[13px] text-t-tinta-suave">{t('referenceImages')}</p> : null
}

// Enlace dorado sobre la barra oscura (F1): el marco lo fija en #C1873A porque el acento de F1 es negro y no contrastaría sobre #1A1815.
export const BAR_LINK = 'text-[#C1873A]'

// Barra de pedido de la familia (la del marco de F1): «18 piezas · 62.000» + «Ver pedido →» sobre la barra oscura de Waiter.
// La página ya no pinta su OrderBar sobre los layouts registrados, así que esta barra es el único camino al pedido desde la carta
// y la comparten los cinco menús, pegada al pie junto al pie propio de cada marco (Foot). Con el carrito vacío no se pinta.
export function FOrderBar({ cart, menu, href }: { cart: Cart | null; menu: Menu | null | undefined; href: string }) {
  const t = useTranslations('diner.orderBar')
  const countLabel = useCountLabel()
  if (itemCount(cart) === 0) return null
  return (
    <Link href={href} aria-label={t('yourOrder')} data-testid="f-order-bar" className="px-5 py-3 min-h-11 border-t border-t-borde bg-dark text-dark-ink flex items-center justify-between">
      <span className="text-[14px]">{countLabel(cart, menu)} · <span className="font-t-mono tabular">{formatCop(cart?.total ?? 0)}</span></span>
      <span className={`text-[14px] font-medium ${BAR_LINK}`}>{t('seeOrder')}</span>
    </Link>
  )
}

// Pie pegado abajo: la barra de pedido y, debajo, el pie que dibuja el marco (CTA, nota o botón). Una sola pieza fija por pantalla.
export function Foot({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`sticky bottom-0 z-30 flex flex-col bg-t-fondo ${className}`}>{children}</div>
}
