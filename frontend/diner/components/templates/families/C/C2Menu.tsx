'use client'

import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { DishPhoto, EmptyList, FOOT_CLASS, SearchField, extrasOf, price } from '@/components/templates/families/C/parts'
import { CategoryTabs, tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import type { Dish } from '@/lib/types'

// C2 · Foto a sangre (docs/diseno/plantillas/C2). Un producto por pantalla: foto vertical a sangre (recorte 3x4 por object-cover)
// con chip rojo «Solo hoy» (atributos.soloHoy), nombre 24/700 y precio mono 20 en la misma línea, descripción, selector de tamaño
// segmentado (atributos.tamanos: el precio sigue al tamaño) y fila de upsell con ＋ (sale de la categoría de extras de la carta).
// Pie con stepper de cantidad y CTA «Añadir {precio × cantidad}». El marco muestra una sola ficha: aquí la carta completa es un
// carrusel con scroll-snap (se pasa deslizando, o con ‹ › de 44 px sobre la foto); el buscador y las categorías de Waiter van
// encima del marco. Tocar la foto o el nombre abre la ficha (onOpen). onAdd solo recibe el plato: con cantidad n se llama n veces
// y el tamaño elegido no viaja (el motor no lo admite todavía); se anota en el comentario y no se inventa nada.
export function C2Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const tc = useTranslations('diner.templates.C2')
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  const [rawIndex, setIndex] = useState(0)
  // Cantidad y tamaño son decisiones del plato en pantalla: van ligadas a su id y vuelven a su base al cambiar de plato (sin efectos).
  const [choice, setChoice] = useState<{ id: number; qty: number; size: number } | null>(null)
  const track = useRef<HTMLDivElement>(null)
  // Si el filtro acorta la lista, el índice se acota en el render (no se sincroniza con un efecto).
  const index = Math.min(rawIndex, Math.max(dishes.length - 1, 0))
  const current: Dish | undefined = dishes[index]
  const qty = current && choice?.id === current.id ? choice.qty : 1
  const size = current && choice?.id === current.id ? choice.size : 0
  const setQty = (next: number) => { if (current) setChoice({ id: current.id, qty: next, size }) }
  const setSize = (next: number) => { if (current) setChoice({ id: current.id, qty, size: next }) }
  const goTo = (i: number) => {
    const next = (i + dishes.length) % dishes.length
    setIndex(next)
    const el = track.current
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }
  const onScroll = () => { const el = track.current; if (el && el.clientWidth > 0) setIndex(Math.round(el.scrollLeft / el.clientWidth)) }
  const sizes = current?.atributos?.tamanos
  const unit = sizes && sizes.length > 0 ? sizes[Math.min(size, sizes.length - 1)].precio : current?.precio ?? 0
  const extra = current ? extrasOf(categories, [current.id])[0] : undefined
  const add = () => { if (!current || current.agotado) return; for (let i = 0; i < qty; i++) onAdd(current); setQty(1) }
  const isSelectedSize = (si: number, n: number) => si === Math.min(size, n - 1)
  const reset = () => { setQuery(''); setCategory(null) }
  const arrow = 'absolute top-[110px] -translate-y-1/2 w-11 h-11 rounded-full bg-t-fondo/80 text-t-tinta grid place-items-center text-[20px] leading-none'
  return (
    <div className="flex flex-col text-t-tinta">
      <div className="px-5 pt-3 pb-2.5 flex flex-col gap-2.5">
        <SearchField query={query} setQuery={setQuery} />
        <CategoryTabs categories={categories} category={category} setCategory={setCategory} />
        {entry.carta.imagenesDeReferencia && <p className="text-[13px] text-t-tinta-suave">{t('menu.referenceImages')}</p>}
      </div>
      <section role="tabpanel" aria-labelledby={tabId(category)} className="flex flex-col">
        {dishes.length === 0 && <div className="px-5"><EmptyList query={query} category={category} reset={reset} /></div>}
        {dishes.length > 0 && (
          <div className="relative">
            <div ref={track} onScroll={onScroll} className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none]" aria-roledescription="carousel" aria-label={t('menu.title')}>
              {dishes.map((dish, i) => {
                const active = i === index
                const own = active ? sizes : dish.atributos?.tamanos
                const shown = active ? unit : dish.precio
                return (
                  <article key={dish.id} aria-hidden={!active} className="w-full shrink-0 snap-center flex flex-col">
                    <button type="button" tabIndex={active ? 0 : -1} onClick={() => onOpen(dish)} className="text-left flex flex-col">
                      <div className="relative">
                        <DishPhoto dish={dish} className="h-[220px] w-full" />
                        {dish.atributos?.soloHoy && !dish.agotado && <span className="absolute left-[18px] bottom-[18px] h-8 px-3 rounded-t-chip bg-busy text-white text-[13px] font-medium grid place-items-center">{tc('onlyToday')}</span>}
                      </div>
                      <div className="px-5 pt-5 flex justify-between items-baseline gap-3">
                        <h2 className="t-title text-[24px] leading-[1.1]">{dish.nombre}</h2>
                        <span className="font-t-mono tabular text-[20px] whitespace-nowrap">{price(shown)}</span>
                      </div>
                      {dish.descripcion && <p className="px-5 pt-3 text-[15px] leading-normal text-t-tinta-suave">{dish.descripcion}</p>}
                    </button>
                    {own && own.length > 0 && (
                      <div role="radiogroup" aria-label={tc('sizes')} className="px-5 pt-3 flex gap-2">
                        {own.map((s, si) => {
                          const on = active && isSelectedSize(si, own.length)
                          return <button key={s.nombre} type="button" role="radio" aria-checked={on} tabIndex={active ? 0 : -1} onClick={() => setSize(si)} className={`flex-1 h-[52px] rounded-[10px] text-[15px] ${on ? 'bg-t-tinta text-t-fondo font-medium' : 'border border-t-borde text-t-tinta'}`}>{s.nombre}</button>
                        })}
                      </div>
                    )}
                    {active && extra && (
                      <div className="mx-5 mt-3 px-3.5 py-3 rounded-t-tarjeta bg-t-acento-suave border border-t-borde flex items-center justify-between gap-3">
                        <span className="text-[14px] text-pending-ink">{tc('upsell', { name: extra.nombre, amount: price(extra.precio) })}</span>
                        <button type="button" aria-label={tc('addUpsell', { name: extra.nombre })} onClick={() => onAdd(extra)} className="w-11 h-11 -m-[5px] grid place-items-center shrink-0">
                          <span aria-hidden="true" className="w-[34px] h-[34px] rounded-full bg-t-acento text-t-acento-tinta grid place-items-center text-[17px] leading-none">＋</span>
                        </button>
                      </div>
                    )}
                    <div className="pb-4" />
                  </article>
                )
              })}
            </div>
            {dishes.length > 1 && (
              <>
                <button type="button" aria-label={tc('prev')} onClick={() => goTo(index - 1)} className={`${arrow} left-2`}>‹</button>
                <button type="button" aria-label={tc('next')} onClick={() => goTo(index + 1)} className={`${arrow} right-2`}>›</button>
                <span aria-live="polite" className="absolute top-3 right-3 h-7 px-2.5 rounded-t-chip bg-t-fondo/85 text-[12px] font-medium font-t-mono tabular grid place-items-center">{tc('counter', { i: index + 1, n: dishes.length })}</span>
              </>
            )}
          </div>
        )}
      </section>
      {current && (
        <div className={`${FOOT_CLASS} px-5 py-3.5 border-t border-t-borde bg-t-fondo flex items-center gap-2.5`}>
          <div role="group" aria-label={t('dish.qty')} className="flex items-center border border-t-borde rounded-[10px] overflow-hidden shrink-0">
            <button type="button" aria-label={t('dish.fewer')} onClick={() => setQty(Math.max(1, qty - 1))} className="w-11 h-12 grid place-items-center text-[19px] text-t-tinta-suave">−</button>
            <span className="w-10 text-center font-t-mono tabular text-[17px]">{qty}</span>
            <button type="button" aria-label={t('dish.more')} onClick={() => setQty(Math.min(9, qty + 1))} className="w-11 h-12 grid place-items-center text-[19px] text-t-tinta-suave border-l border-t-borde">＋</button>
          </div>
          {current.agotado
            ? <span className="flex-1 h-14 rounded-t-boton bg-muted text-busy-ink text-[16px] font-bold grid place-items-center">{t('common.soldOut')}</span>
            : <button type="button" onClick={add} className="flex-1 h-14 rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold">{tc('addFor', { amount: price(unit * qty) })}</button>}
        </div>
      )}
    </div>
  )
}
