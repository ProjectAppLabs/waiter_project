'use client'

import { useTranslations } from 'next-intl'

import { fold } from '@/components/templates/generic/menuParts'
import { formatCop } from '@/lib/domain/cart'
import type { Brand, Category, Dish } from '@/lib/types'

// Piezas compartidas por la familia C (Rápida y food truck): pie pegado abajo, cabecera de marca, buscador compacto, foto con
// recorte y extras.

// Códigos de la familia: el carrito y el pago ramifican por código (el registro solo admite claves por familia).
export type FamilyCCode = 'C1' | 'C2' | 'C3' | 'C4' | 'C5'
export const familyCCode = (code: string): FamilyCCode => (['C1', 'C2', 'C3', 'C4', 'C5'].includes(code) ? (code as FamilyCCode) : 'C1')
// C1 y C4 son las pieles oscuras con Bebas Neue: sus títulos van más grandes que los de las claras (Ubuntu 700).
export const isDarkC = (code: FamilyCCode) => code === 'C1' || code === 'C4'

// El pie del marco va pegado abajo. En la carta de una plantilla registrada la página no pinta su barra de pedido (el layout es
// dueño de toda la pantalla), así que el pie es el único CTA y no tiene nada que esquivar.
export const FOOT_CLASS = 'sticky bottom-0 z-10'

// Precio de lista de la familia: sin símbolo y con separador de miles («41.900»); los totales llevan «$ ».
export const price = (n: number) => formatCop(n)
export const money = (n: number) => `$ ${formatCop(n)}`

// Categoría de extras (Adiciones / Extras / Complementos): el upsell «¿Le sumas…?» sale de ahí cuando la carta la tiene
// (spec C5: «dato no estándar complemento, o categoría de extras»); sin esa categoría no hay upsell, nunca se inventa.
export const extrasOf = (categories: Category[], except: number[] = []): Dish[] =>
  categories.find((c) => /adicion|extra|complemento/.test(fold(c.nombre)))?.productos.filter((d) => !d.agotado && !except.includes(d.id)) ?? []

// Marca en la cabecera del marco: el logo (Plan G) si la marca lo tiene, si no el nombre en la voz de la plantilla (t-title).
export function BrandName({ brand, className = '' }: { brand: Brand; className?: string }) {
  if (brand.logo) {
    // La imagen viene de experience por URL y next.config la sirve sin optimizar (images.unoptimized).
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brand.logo} alt={brand.nombre} className="h-8 w-auto max-w-full object-contain" />
  }
  return <h1 className={`t-title leading-none truncate ${className}`}>{brand.nombre}</h1>
}

// Chip de mesa de Waiter («Mesa 4» / «Domicilio») en la piel de la plantilla: superficie y borde por tokens, así se lee igual sobre
// las pieles oscuras (C1, C4) que sobre las claras.
export function TableChip({ table }: { table: number | null }) {
  const t = useTranslations('diner.common')
  return <span className="inline-flex items-center h-[34px] px-[11px] rounded-t-chip bg-t-superficie border border-t-borde text-t-tinta text-[13px] font-medium shrink-0 whitespace-nowrap">{table !== null ? t('table', { n: table }) : t('delivery')}</span>
}

// Buscador de Waiter en la piel de la plantilla (44 px de toque).
export function SearchField({ query, setQuery, className = '' }: { query: string; setQuery: (q: string) => void; className?: string }) {
  const t = useTranslations('diner.menu')
  return (
    <input type="search" aria-label={t('search')} placeholder={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" className={`h-11 w-full min-w-0 rounded-t-boton bg-t-superficie border border-t-borde px-3.5 text-[15px] text-t-tinta placeholder:text-t-tinta-terciaria focus:outline-none focus:border-t-acento ${className}`} />
  )
}

// Insignia de agotado legible sobre cualquier piel: lleva su propio fondo (rojo suave fijo de Waiter) y no hereda la atenuación.
export function SoldOutBadge({ className = '' }: { className?: string }) {
  const t = useTranslations('diner.common')
  return <span data-testid="sold-out-badge" className={`rounded-t-chip bg-busy-soft px-2 py-0.5 text-[11px] font-medium tracking-[0.04em] normal-case text-busy-ink ${className}`}>{t('soldOut')}</span>
}

// Foto con recorte por object-cover; placeholder «Foto del plato» (#F2EEE8 = bg-muted) si no hay; agotado al 55 % con insignia.
export function DishPhoto({ dish, className = '' }: { dish: Dish; className?: string }) {
  const t = useTranslations('diner')
  return (
    <div className={`relative bg-muted grid place-items-center text-[11px] tracking-[0.1em] uppercase text-ink-3 overflow-hidden ${className}`}>
      {/* La foto viene de experience por URL y next.config la sirve sin optimizar (images.unoptimized). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {dish.foto ? <img src={dish.foto} alt="" className={`w-full h-full object-cover ${dish.agotado ? 'opacity-55' : ''}`} /> : <span>{t('templates.photo')}</span>}
      {dish.agotado && <SoldOutBadge className="absolute top-2 right-2" />}
    </div>
  )
}

// Estado vacío honesto de una lista filtrada: habla de la búsqueda solo si se buscó.
export function EmptyList({ query, category, reset }: { query: string; category: number | null; reset: () => void }) {
  const t = useTranslations('diner')
  const text = query ? t('menu.empty') : category === null ? t('menu.emptyMenu') : t('menu.emptyCategory')
  return (
    <div className="py-8 flex flex-col items-center gap-3 text-center">
      <p role="status" className="text-[15px] text-t-tinta-suave">{text}</p>
      {(query !== '' || category !== null) && <button type="button" onClick={reset} className="h-11 px-4 rounded-t-boton bg-t-superficie border border-t-borde text-[14px] font-medium text-t-tinta">{t('home.seeAll')}</button>}
    </div>
  )
}
