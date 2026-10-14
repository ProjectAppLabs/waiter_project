'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { tabId } from '@/components/templates/generic/menuParts'
import { formatCop, itemCount } from '@/lib/domain/cart'
import type { Cart, Category, Dish, Entry } from '@/lib/types'

// Piezas compartidas por la familia B (Casual de barrio): píldoras de categoría del marco, foto con recorte y agotado,
// atributos opcionales (solo si existen), ＋ de 44 px y la barra oscura de pedido de los marcos B1/B5. Todo con tokens --t-*.

// Dorado fijo de la familia (#C1873A): los specs de B3/B5 lo marcan como color del diseño, no como el token acento
// (en B5 el acento es la tinta y sobre la barra oscura sería invisible). Solo se usa donde el spec lo fija, y con la regla que
// la familia ya aplica en B1/B2: el blanco del marco sobre el dorado da 3,09:1, así que como fondo lleva tinta oscura (5,73:1) y
// como texto solo va sobre la barra oscura (5,73:1). Para texto pequeño sobre claro (B5 «N · cerrar», antetítulo B2) se usa la
// tinta ámbar de Waiter (pending-ink, 5,9:1 sobre blanco), del mismo tono que el dorado y AA.
export const GOLD_TEXT = 'text-[#C1873A]'
export const GOLD_BG = 'bg-[#C1873A] text-dark'
export const GOLD_INK = 'text-pending-ink'
// Tintas fijas de la banda «5% · Primera compra» (marco B2 sobre la crema acentoSuave, que no es personalizable): la cifra de 22 px
// en negrita es texto grande (4,1:1 ≥ 3:1) y el texto pequeño va en el marrón del marco (7,5:1).
export const BAND_FIGURE = 'text-[#A06E2C]'
export const BAND_TEXT = 'text-[#6B4A05]'

// Recortes del spec (fotos.recorte) → proporción CSS. 'ninguno' no pinta foto.
export const CROP: Record<string, string> = { '4x3': 'aspect-[4/3]', '1x1': 'aspect-square', '3x4': 'aspect-[3/4]', '3x2': 'aspect-[3/2]' }

// Píldoras de categoría del marco (B1): 44 px de alto (el marco dibuja 42; el toque manda), activa rellena en acento.
// Pestañas excluyentes (tablist) con ←/→, como CategoryTabs del genérico, pero con las medidas del marco.
export function Pills({ categories, category, setCategory, className = '' }: { categories: Category[]; category: number | null; setCategory: (c: number | null) => void; className?: string }) {
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
  const pill = (active: boolean) => `shrink-0 h-[44px] px-[15px] rounded-t-chip text-[15px] whitespace-nowrap grid place-items-center ${active ? 'bg-t-acento text-t-acento-tinta font-medium' : 'border border-t-borde text-t-tinta'}`
  const tab = (value: number | null, label: string) => {
    const active = category === value
    return <button key={tabId(value)} type="button" role="tab" id={tabId(value)} aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => setCategory(value)} className={pill(active)}>{label}</button>
  }
  return (
    <div role="tablist" aria-label={t('categories')} onKeyDown={onKeyDown} className={`flex gap-1.5 overflow-x-auto [scrollbar-width:none] ${className}`}>
      {tab(null, t('all'))}
      {categories.map((c) => tab(c.id, c.nombre))}
    </div>
  )
}

// Foto del plato con el recorte del spec: sin foto, placeholder «Foto del plato» sobre el borde de la plantilla (el marco dibuja
// #E8E1D5 en claro; en B4 el token oscuro evita un gris ajeno a la pizarra); agotado al 55 % (solo la foto) con insignia legible.
export function Photo({ dish, className = '', placeholder }: { dish: Dish; className?: string; placeholder?: string }) {
  const t = useTranslations('diner')
  return (
    <div className={`relative bg-t-borde grid place-items-center text-[10px] tracking-[0.08em] uppercase text-t-tinta-terciaria overflow-hidden ${className}`}>
      {/* La foto viene de experience por URL; next.config la sirve sin optimizar (images.unoptimized). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {dish.foto ? <img src={dish.foto} alt="" className={`w-full h-full object-cover ${dish.agotado ? 'opacity-55' : ''}`} /> : <span>{placeholder ?? t('templates.photo')}</span>}
      {dish.agotado && <span data-testid="sold-out-badge" className="absolute top-1.5 right-1.5 rounded-t-chip bg-t-superficie/90 px-2 py-0.5 text-[11px] font-medium tracking-[0.04em] normal-case text-busy-ink">{t('common.soldOut')}</span>}
    </div>
  )
}

// Atributos opcionales del contrato 2 en una línea corta: piezas, picante, etiquetas, abv/ibu, tamaños. Sin dato, sin hueco: devuelve null.
export function DishMeta({ dish, className = '', allergens = false }: { dish: Dish; className?: string; allergens?: boolean }) {
  const t = useTranslations('diner.templates.familiaB')
  const a = dish.atributos
  if (!a) return null
  const parts: string[] = []
  if (a.piezas) parts.push(t('pieces', { n: a.piezas }))
  if (a.picante) parts.push(`${'●'.repeat(a.picante)}${'○'.repeat(3 - a.picante)}`)
  if (a.abv) parts.push(t('abv', { abv: a.abv }))
  if (a.ibu) parts.push(t('ibu', { ibu: a.ibu }))
  if (a.tamanos && a.tamanos.length > 0) parts.push(`${t('sizes', { n: a.tamanos.length })} · ${t('sizesFrom', { amount: formatCop(Math.min(...a.tamanos.map((s) => s.precio))) })}`)
  if (a.etiquetas && a.etiquetas.length > 0) parts.push(a.etiquetas.join(' · '))
  if (allergens && a.alergenos && a.alergenos.length > 0) parts.push(t('allergens', { list: a.alergenos.join(', ') }))
  if (parts.length === 0 && !a.soloHoy) return null
  return (
    <span className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-snug text-t-tinta-suave ${className}`}>
      {a.soloHoy && <span className="inline-flex items-center h-[20px] px-1.5 rounded-t-chip bg-t-acento-suave text-t-tinta text-[11px] font-medium">{t('todayOnly')}</span>}
      {parts.length > 0 && <span aria-label={a.picante ? `${parts.join(' · ')} (${t('spicy', { n: a.picante })})` : undefined}>{parts.join(' · ')}</span>}
    </span>
  )
}

// ＋ redondo del marco (32 px dibujado) con área de toque de 44 px; agotado → texto «Agotado» en vez del botón.
export function AddButton({ dish, onAdd, size = 32, className = '' }: { dish: Dish; onAdd: (d: Dish) => void; size?: number; className?: string }) {
  const t = useTranslations('diner.common')
  if (dish.agotado) return <span className="text-[12px] font-medium text-busy-ink">{t('soldOut')}</span>
  return (
    <button type="button" aria-label={`${t('add')}: ${dish.nombre}`} onClick={() => onAdd(dish)} className={`w-[44px] h-[44px] grid place-items-center ${className}`}>
      <span aria-hidden="true" style={{ width: size, height: size }} className="rounded-full bg-t-acento text-t-acento-tinta grid place-items-center text-[16px] leading-none">＋</span>
    </button>
  )
}

// Barra oscura de pedido de los marcos B1/B5: «N ítems · total» y «Ver pedido →» en dorado. Pegada abajo del layout; siempre visible,
// con el carrito vacío dice la verdad en vez de «0 ítems». Es la única barra de pedido de la carta: la página no pinta la suya
// sobre un layout registrado (ownsChrome en el registro).
export function FrameOrderBar({ cart, href }: { cart: Cart | null; href: string }) {
  const t = useTranslations('diner.templates.familiaB')
  const count = itemCount(cart)
  return (
    <div data-testid="frame-order-bar" className="sticky bottom-0 z-30 px-[18px] py-3 bg-dark text-[#EDE7DD] border-t border-t-borde flex items-center justify-between min-h-[52px]">
      {count > 0
        ? <span className="text-[14px]">{t('orderBarItems', { n: count })} · <span className="font-t-mono tabular">{formatCop(cart?.total ?? 0)}</span></span>
        : <span className="text-[14px] opacity-80">{t('orderBarEmpty')}</span>}
      {count > 0 && <Link href={href} className={`inline-flex items-center h-[44px] text-[14px] font-medium ${GOLD_TEXT}`}>{t('seeOrder')}</Link>}
    </div>
  )
}

// Campo de búsqueda de Waiter en la familia: 44 px, radio 10, sobre superficie con borde (B1/B2, sin marco) o sobre acentoSuave
// (B5: el marco dibuja #F2EEE8, que es exactamente su acentoSuave).
export const SEARCH_FIELD = 'h-[44px] w-full rounded-[10px] px-3.5 text-[15px] text-t-tinta placeholder:text-t-tinta-terciaria'
export const SEARCH_SURFACE = 'bg-t-superficie border border-t-borde'

// Foto por producto para el carrito (las líneas no traen foto): mapa id → foto a partir de la carta.
export function usePhotoIndex(entry: Entry | null | undefined): Map<number, string> {
  return useMemo(() => {
    const map = new Map<number, string>()
    for (const c of entry?.carta.categorias ?? []) for (const d of c.productos) if (d.foto && !map.has(d.id)) map.set(d.id, d.foto)
    return map
  }, [entry])
}
