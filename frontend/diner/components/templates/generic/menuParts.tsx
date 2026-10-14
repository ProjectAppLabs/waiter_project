'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { formatCop } from '@/lib/domain/cart'
import type { Category, Dish } from '@/lib/types'

// Piezas de menú compartidas por los layouts: filtro (búsqueda tolerante + categoría), pestañas accesibles y tarjeta con tokens --t-*.

// Búsqueda tolerante: "aji" encuentra "Ají" y "AJÍ" (NFD separa la tilde en una marca combinante, que se quita; luego minúsculas).
export const fold = (s: string) => s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().trim()
// Un plato puede vivir en varias categorías; en "Todo" se muestra una sola vez.
export const unique = (dishes: Dish[]) => Array.from(new Map(dishes.map((d) => [d.id, d])).values())
// null es "Todo"; el id enlaza cada pestaña con el panel (aria-labelledby).
export const tabId = (category: number | null) => (category === null ? 'cat-all' : `cat-${category}`)

export function useMenuDishes(categories: Category[], query: string, category: number | null): Dish[] {
  return useMemo(() => {
    const pool = category === null ? unique(categories.flatMap((c) => c.productos)) : categories.find((c) => c.id === category)?.productos ?? []
    const needle = fold(query)
    return needle ? pool.filter((d) => fold(d.nombre).includes(needle)) : pool
  }, [categories, category, query])
}

// Los chips son pestañas excluyentes (una sola activa): el lector de pantalla anuncia "pestaña, seleccionada, 2 de 3" y el foco rota con ←/→.
export function CategoryTabs({ categories, category, setCategory, className = '' }: { categories: Category[]; category: number | null; setCategory: (c: number | null) => void; className?: string }) {
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
  // El chip activo lleva el acento de la plantilla; el estado también va en aria-selected, no solo en el color.
  const chip = (active: boolean) => `shrink-0 h-tap-min px-4 rounded-t-chip text-[15px] font-medium whitespace-nowrap ${active ? 'bg-t-acento text-t-acento-tinta' : 'bg-t-superficie border border-t-borde text-t-tinta'}`
  const tab = (value: number | null, label: string) => {
    const active = category === value
    return <button key={tabId(value)} type="button" role="tab" id={tabId(value)} aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => setCategory(value)} className={chip(active)}>{label}</button>
  }
  return (
    <div role="tablist" aria-label={t('categories')} onKeyDown={onKeyDown} className={`flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] ${className}`}>
      {tab(null, t('all'))}
      {categories.map((c) => tab(c.id, c.nombre))}
    </div>
  )
}

// Tarjeta del genérico (B1): foto 3:2, nombre, precio mono y ＋ redondo en el acento de la plantilla.
export function TemplateDishCard({ dish, onOpen, onAdd }: { dish: Dish; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void }) {
  const t = useTranslations('diner')
  return (
    <article className="border border-t-borde rounded-t-tarjeta bg-t-superficie overflow-hidden flex flex-col">
      <button type="button" onClick={() => onOpen(dish)} className="text-left flex-1 flex flex-col">
        {/* Agotado (espec. de imágenes): la foto se queda al 55 % con la insignia encima; el plato no se oculta. */}
        <div className="relative h-[88px] bg-muted grid place-items-center text-[11px] tracking-[0.08em] uppercase text-t-tinta-terciaria overflow-hidden">
          {/* Como en DishCard: la foto viene de experience por URL y next.config ya la sirve sin optimizar (images.unoptimized). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {dish.foto ? <img src={dish.foto} alt="" className={dish.agotado ? 'w-full h-full object-cover opacity-55' : 'w-full h-full object-cover'} /> : t('templates.photo')}
          {dish.agotado && dish.foto && <span data-testid="sold-out-badge" className="absolute top-2 right-2 rounded-t-chip bg-t-superficie/90 px-2 py-0.5 text-[11px] font-medium tracking-[0.04em] normal-case text-busy-ink">{t('common.soldOut')}</span>}
        </div>
        <div className="px-3 pt-2.5 flex flex-col gap-0.5">
          <span className="text-[15px] font-medium leading-snug text-t-tinta">{dish.nombre}</span>
          {dish.descripcion && <span className="text-[13px] text-t-tinta-suave leading-snug line-clamp-2">{dish.descripcion}</span>}
        </div>
      </button>
      <div className="px-3 pb-3 pt-2 flex items-center justify-between">
        <span className="font-t-mono tabular text-[15px] text-t-tinta">{formatCop(dish.precio)}</span>
        {dish.agotado
          ? <span className="text-[12px] font-medium text-busy-ink">{t('common.soldOut')}</span>
          : (
            // Área de toque de 48px (§03) sin agrandar el dibujo de 34px del mock: el margen negativo la extiende 7px hacia fuera y el pie no crece.
            <button type="button" aria-label={`${t('common.add')}: ${dish.nombre}`} onClick={() => onAdd(dish)} className="w-tap-min h-tap-min -m-[7px] grid place-items-center">
              <span aria-hidden="true" className="w-[34px] h-[34px] rounded-full bg-t-acento text-t-acento-tinta grid place-items-center text-[17px] leading-none">＋</span>
            </button>
          )}
      </div>
    </article>
  )
}
