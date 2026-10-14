'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Fragment, useMemo, useState } from 'react'

import { AddButton, EmptyMenu, MenuSearch, uniqueTags } from '@/components/templates/families/E/parts'
import { CategoryTabs, fold, tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount } from '@/lib/domain/cart'
import type { Dish } from '@/lib/types'

// E1 · Índice de grifos (docs/diseno/plantillas/E1): cabecera «N grifos» + rótulo mono «ABV · IBU» (solo si algún producto trae
// abv/ibu); lista de una columna sin fotos con barra vertical de 8×40, nombre 16/500, línea técnica mono «4.8% · 22 IBU» y precio mono;
// el agotado va al 45 % con «barril vacío» en vez de la línea técnica, tal cual el marco. La fila «Filtrar:» del marco es una línea de
// texto de 13 px sobre superficie (padding 14 × 20) pegada abajo, junto a los botones: ahí viven los filtros de Waiter como texto, sin
// chips: «Buscar» (despliega el buscador encima), las etiquetas únicas de la carta separadas por «·» (aria-pressed; solo si existen,
// como pide el spec) y, tras una barra, las categorías (pestañas); la fila se desplaza en horizontal si no cabe. Sin etiquetas ni
// categorías que elegir la fila se omite y el buscador va bajo la cabecera. «Armar flight» solo aparece si la carta tiene una
// categoría de flights (sin dato estándar); «Pedir ronda» lleva a orderBarHref con cart.total. Sin dato de color de barril, la barra
// usa el borde. El marco no dibuja ＋: va uno de 32 px con borde (44 px de toque) tras el precio; tocar la fila abre el plato.
export function E1Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const te = useTranslations('diner.templates.E1')
  const tf = useTranslations('diner.templates.familiaE')
  const [searching, setSearching] = useState(false)
  const [tag, setTag] = useState<string | null>(null)
  const categories = entry.carta.categorias
  const all = useMenuDishes(categories, query, category)
  const dishes = useMemo(() => (tag ? all.filter((d) => d.atributos?.etiquetas?.includes(tag)) : all), [all, tag])
  const tags = useMemo(() => uniqueTags(categories.flatMap((c) => c.productos)), [categories])
  const hasAbv = useMemo(() => categories.some((c) => c.productos.some((d) => d.atributos?.abv || d.atributos?.ibu)), [categories])
  const flights = useMemo(() => categories.find((c) => fold(c.nombre).includes('flight')), [categories])
  const active = category === null ? null : categories.find((c) => c.id === category)
  const count = itemCount(cart)
  const showAll = () => { setQuery(''); setCategory(null); setTag(null) }
  const amount = formatCop(cart?.total ?? 0)
  const [before, after] = te('roundTotal', { amount }).split(amount)
  // Hay fila «Filtrar:» si hay algo que elegir en ella: etiquetas o más de una categoría.
  const hasFilters = tags.length > 0 || categories.length > 1
  const text = (on: boolean) => `shrink-0 h-[44px] px-1 text-[13px] whitespace-nowrap ${on ? 'text-t-acento font-medium underline underline-offset-4' : 'text-t-tinta-terciaria'}`
  // Las pestañas de Waiter en la voz de la fila: texto de 13 px sin chip; la activa en el acento.
  const textTabs = 'pb-0 gap-0 shrink-0 [&>button]:h-[44px] [&>button]:px-1 [&>button]:rounded-none [&>button]:border-0 [&>button]:bg-transparent [&>button]:text-[13px] [&>button]:font-normal [&>button]:text-t-tinta-terciaria [&>button[aria-selected=true]]:text-t-acento [&>button[aria-selected=true]]:font-medium'
  return (
    <div className="flex flex-col min-h-[60vh] text-t-tinta">
      <header className="px-5 py-[18px] border-b border-t-borde flex items-baseline justify-between gap-3">
        <h1 className="t-title text-[20px] leading-tight">{active ? te('categoryCount', { name: active.nombre, n: dishes.length }) : te('taps', { n: dishes.length })}</h1>
        {hasAbv && <span className="font-t-mono text-[13px] text-t-tinta-suave">{te('abvIbu')}</span>}
      </header>
      {!hasFilters && <div className="px-5 pt-3"><MenuSearch query={query} setQuery={setQuery} /></div>}
      {entry.carta.imagenesDeReferencia && <p className="px-5 pt-3 text-[13px] text-t-tinta-suave">{t('menu.referenceImages')}</p>}
      <section role="tabpanel" aria-labelledby={tabId(category)} className="flex-1">
        {dishes.length === 0
          ? <EmptyMenu query={query} category={category} onShowAll={showAll} />
          : <ul className="flex flex-col">{dishes.map((d) => <TapRow key={d.id} dish={d} onOpen={onOpen} onAdd={onAdd} />)}</ul>}
      </section>
      <div className="sticky bottom-0 z-30 bg-t-fondo">
        {hasFilters && (searching || query) && <div className="px-5 pt-3 bg-t-superficie"><MenuSearch query={query} setQuery={setQuery} autoFocus /></div>}
        {hasFilters && (
          <div data-testid="filter-row" className="px-5 min-h-[47px] bg-t-superficie flex items-center gap-x-1.5 text-[13px] text-t-tinta-terciaria overflow-x-auto [scrollbar-width:none]">
            <span className="shrink-0">{tf('filters')}:</span>
            <button type="button" aria-pressed={searching} onClick={() => setSearching((s) => !s)} className={text(searching || query !== '')}>{tf('searchToggle')}</button>
            {tags.length > 0 && (
              <div role="group" aria-label={tf('tagFilters')} className="shrink-0 flex items-center gap-x-1">
                {tags.map((x) => (
                  <Fragment key={x}>
                    <span aria-hidden="true">·</span>
                    <button type="button" aria-pressed={tag === x} onClick={() => setTag((c) => (c === x ? null : x))} className={text(tag === x)}>{x}</button>
                  </Fragment>
                ))}
              </div>
            )}
            {categories.length > 1 && <><span aria-hidden="true" className="shrink-0 pl-1">|</span><CategoryTabs categories={categories} category={category} setCategory={setCategory} className={textTabs} /></>}
          </div>
        )}
        <div className="px-5 py-3.5 border-t border-t-borde flex gap-2.5">
          {flights && <button type="button" onClick={() => { setCategory(flights.id); setTag(null) }} className="flex-1 h-[52px] rounded-t-boton border border-t-borde text-[15px] text-t-tinta-terciaria">{te('flight')}</button>}
          {count > 0
            ? <Link href={orderBarHref} data-testid="frame-order-bar" className="flex-1 h-[52px] rounded-t-boton bg-t-acento text-t-acento-tinta text-[15px] font-bold flex items-center justify-center gap-1">{before}<span className="font-t-mono tabular">{amount}</span>{after}</Link>
            : <button type="button" disabled data-testid="frame-order-bar" className="flex-1 h-[52px] rounded-t-boton bg-t-acento text-t-acento-tinta text-[15px] font-bold disabled:opacity-60">{te('round')}</button>}
        </div>
      </div>
    </div>
  )
}

// Fila de grifo: barra de color (borde: el color del barril no viene en los datos), nombre, técnica o «barril vacío», precio y ＋.
// El separador del marco (#221E1B) es el borde al 60 % sobre el fondo, más tenue que el de la cabecera.
function TapRow({ dish, onOpen, onAdd }: { dish: Dish; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void }) {
  const te = useTranslations('diner.templates.E1')
  const tf = useTranslations('diner.templates.familiaE')
  const a = dish.atributos
  const tech = [a?.abv ? tf('abvShort', { abv: a.abv }) : null, a?.ibu ? tf('ibu', { ibu: a.ibu }) : null].filter(Boolean).join(' · ')
  const fallback = a?.etiquetas && a.etiquetas.length > 0 ? a.etiquetas.join(' · ') : ''
  return (
    <li className={`px-5 border-b border-t-borde/60 flex items-center gap-3 ${dish.agotado ? 'opacity-45' : ''}`}>
      <button type="button" onClick={() => onOpen(dish)} className="flex-1 min-w-0 py-[13px] flex items-center gap-3 text-left min-h-[66px]">
        <span aria-hidden="true" className="w-2 h-10 shrink-0 rounded-[4px] bg-t-borde" />
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-[16px] font-medium leading-snug">{dish.nombre}</span>
          {dish.agotado
            ? <span className="text-[13px] text-[#F08A84]">{te('empty')}</span>
            : (tech || fallback) && <span className="font-t-mono text-[13px] text-t-tinta-suave truncate">{tech || fallback}</span>}
        </span>
        <span className="font-t-mono tabular text-[15px] whitespace-nowrap">{formatCop(dish.precio)}</span>
      </button>
      <AddButton dish={dish} onAdd={onAdd} className="-mr-1.5" />
    </li>
  )
}
