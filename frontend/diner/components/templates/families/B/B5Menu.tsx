'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { DishMeta, FrameOrderBar, GOLD_INK, Pills, SEARCH_FIELD } from '@/components/templates/families/B/parts'
import { fold } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { Category, Dish } from '@/lib/types'

// B5 · Carta con secciones plegables (docs/diseno/plantillas/B5): buscador «Buscar en la carta» con botón de filtro ≡ (despliega las
// píldoras de categoría de Waiter), acordeón de categorías (cerradas sobre superficie con «8 · abrir» en terciario; la abierta con
// «21 · cerrar» en la tinta ámbar: el dorado del marco sobre blanco da 3,1:1 a 14 px), filas de plato con nombre, descripción corta
// y precio en mono, sin ＋ (tocar abre el plato y desde ahí se añade, como manda el spec); barra oscura de pedido abajo, la única de
// la pantalla (la página no superpone la suya). Con búsqueda, se abren solo las secciones con coincidencias.
export function B5Menu({ entry, query, setQuery, category, setCategory, onOpen, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const tf = useTranslations('diner.templates.familiaB')
  const tb = useTranslations('diner.templates.B5')
  const categories = entry.carta.categorias
  const [filters, setFilters] = useState(false)
  const [open, setOpen] = useState<Set<number>>(() => new Set(categories[0] ? [categories[0].id] : []))
  const needle = fold(query)
  const sections = useMemo(() => {
    const pool = category === null ? categories : categories.filter((c) => c.id === category)
    return pool.map((c) => ({ ...c, productos: needle ? c.productos.filter((d) => fold(d.nombre).includes(needle)) : c.productos })).filter((c) => !needle || c.productos.length > 0)
  }, [categories, category, needle])
  const isOpen = (c: Category) => needle !== '' || category === c.id || open.has(c.id)
  const toggle = (c: Category) => setOpen((prev) => { const next = new Set(prev); if (next.has(c.id)) next.delete(c.id); else next.add(c.id); return next })
  const emptyText = query ? t('menu.empty') : category === null ? t('menu.emptyMenu') : t('menu.emptyCategory')
  return (
    <div className="flex flex-col min-h-[60vh]">
      <div className="px-[18px] py-4 border-b border-t-borde flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <input type="search" aria-label={tf('search')} placeholder={tf('search')} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" className={`flex-1 ${SEARCH_FIELD} bg-t-acento-suave`} />
          <button type="button" aria-label={tf('filters')} aria-pressed={filters || category !== null} onClick={() => setFilters((f) => !f)} className={`shrink-0 w-[44px] h-[44px] rounded-[10px] grid place-items-center text-[15px] ${filters || category !== null ? 'bg-t-acento text-t-acento-tinta' : 'border border-t-borde text-t-tinta-suave'}`}>≡</button>
        </div>
        {(filters || category !== null) && <Pills categories={categories} category={category} setCategory={setCategory} />}
      </div>
      {entry.carta.imagenesDeReferencia && <p className="px-[18px] pt-3 text-[13px] text-t-tinta-suave">{t('menu.referenceImages')}</p>}
      <div className="flex-1">
        {sections.length === 0 && <p role="status" className="px-[18px] py-10 text-center text-base text-t-tinta-suave">{emptyText}</p>}
        {sections.map((c) => {
          const opened = isOpen(c)
          const panel = `b5-panel-${c.id}`
          return (
            <section key={c.id}>
              <h2>
                <button type="button" aria-expanded={opened} aria-controls={panel} onClick={() => toggle(c)} className={`w-full px-[18px] py-[15px] min-h-[52px] flex justify-between items-center border-b border-t-borde/60 ${opened ? 'bg-t-fondo' : 'bg-t-superficie'}`}>
                  <span className="t-title text-[17px] leading-tight text-t-tinta">{c.nombre}</span>
                  <span className={`text-[14px] ${opened ? `${GOLD_INK} font-medium` : 'text-t-tinta-terciaria'}`}>{tb('sectionState', { n: c.productos.length, state: opened ? tf('close') : tf('open') })}</span>
                </button>
              </h2>
              {opened && (
                <ul id={panel}>
                  {c.productos.length === 0 && <li className="px-[18px] py-3 text-[14px] text-t-tinta-suave">{t('menu.emptyCategory')}</li>}
                  {c.productos.map((d, i) => <Row key={d.id} dish={d} last={i === c.productos.length - 1} onOpen={onOpen} />)}
                </ul>
              )}
            </section>
          )
        })}
      </div>
      <FrameOrderBar cart={cart} href={orderBarHref} />
    </div>
  )
}

// Fila del marco: nombre 16/400, descripción corta 13 (o los atributos si no hay descripción), precio mono 15. Tocar abre el plato.
function Row({ dish, last, onOpen }: { dish: Dish; last: boolean; onOpen: (d: Dish) => void }) {
  const tc = useTranslations('diner.common')
  return (
    <li className={`border-b ${last ? 'border-t-borde/60' : 'border-t-borde/40'}`}>
      <button type="button" onClick={() => onOpen(dish)} className="w-full text-left px-[18px] py-3 min-h-[52px] flex justify-between gap-3">
        <span className={`flex flex-col min-w-0 ${dish.agotado ? 'opacity-55' : ''}`}>
          <span className="text-[16px] leading-snug text-t-tinta">{dish.nombre}</span>
          {dish.descripcion ? <span className="text-[13px] text-t-tinta-suave line-clamp-1">{dish.descripcion}</span> : <DishMeta dish={dish} allergens />}
        </span>
        <span className="flex flex-col items-end shrink-0">
          <span className="font-t-mono tabular text-[15px] text-t-tinta whitespace-nowrap">{formatCop(dish.precio)}</span>
          {dish.agotado && <span className="text-[12px] font-medium text-busy-ink">{tc('soldOut')}</span>}
        </span>
      </button>
    </li>
  )
}
