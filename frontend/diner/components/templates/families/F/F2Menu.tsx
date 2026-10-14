'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { AddButton, FOrderBar, FTabs, Foot, MenuEmpty, ReferenceNote, SearchField, SearchToggle } from '@/components/templates/families/F/parts'
import { tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { Dish } from '@/lib/types'

// F2 · Bento en cuadrícula (docs/diseno/plantillas/F2). El marco muestra un solo producto (la caja) con cuatro compartimentos;
// el layout sigue pintando la carta completa: la categoría activa es la caja, el plato seleccionado da nombre y precio a la
// cabecera y al pie, y las celdas 2×2 son los platos de la categoría. atributos.compartimentos no existe en el contrato 2, así
// que el rótulo en versalitas sans (Ubuntu 12/0.1em, como «PRINCIPAL» / «ROLLO») de cada celda es la categoría del plato y el
// contenido su nombre «· N piezas» si hay dato; el precio va en el pie, como en el marco. Con más de cuatro platos, la cuarta
// celda es «Elige» (borde discontinuo) y despliega el resto como filas. Tocar una celda la selecciona (borde negro); tocarla de
// nuevo, o el título de la cabecera, abre el plato (onOpen). El CTA negro añade el seleccionado (onAdd). Agotado: el rótulo dice
// «Agotado» legible y solo el nombre se atenúa. Añadidos de Waiter: tabs y lupa arriba, ＋ en el desplegable y la barra de
// pedido de la familia sobre el pie (la página no pinta la suya sobre este layout).
export function F2Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const tf = useTranslations('diner.templates.familiaF')
  const [searching, setSearching] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  const selected = dishes.find((d) => d.id === selectedId) ?? dishes[0] ?? null
  const cells = dishes.length > 4 ? dishes.slice(0, 3) : dishes.slice(0, 4)
  const rest = dishes.length > 4 ? dishes.slice(3) : []
  const title = category === null ? t('menu.title') : categories.find((c) => c.id === category)?.nombre ?? t('menu.title')
  const chip = (active: boolean) => `h-[36px] px-3 rounded-t-chip text-[14px] ${active ? 'bg-t-acento text-t-acento-tinta font-medium' : 'bg-t-superficie border border-t-borde text-t-tinta'}`
  const tap = (d: Dish) => { if (selected?.id === d.id) onOpen(d); else setSelectedId(d.id) }
  const label = (d: Dish) => (d.atributos?.piezas ? `${d.nombre} · ${tf('pieces', { n: d.atributos.piezas })}` : d.nombre)
  // Rótulo del compartimento: la categoría del plato (la activa, o la primera suya en «Todo»).
  const compartment = (d: Dish) => categories.find((c) => c.id === (category ?? d.categorias[0]))?.nombre ?? ''
  const caps = 'text-[12px] tracking-[0.1em] uppercase font-medium'
  return (
    <div className="flex flex-col text-t-tinta">
      <div className="px-5 pt-3 flex items-center gap-1.5">
        <FTabs categories={categories} category={category} setCategory={setCategory} chip={chip} className="flex-1 min-w-0" />
        <SearchToggle open={searching} setOpen={setSearching} className="rounded-t-chip border border-t-borde text-t-tinta-suave" />
      </div>
      {searching && <div className="px-5 pt-3"><SearchField query={query} setQuery={setQuery} /></div>}
      <header className="px-5 pt-3.5 pb-[18px] border-b border-t-borde">
        {selected
          ? <button type="button" onClick={() => onOpen(selected)} className="text-left flex items-baseline gap-2 max-w-full"><span className="text-[20px] font-bold truncate">{selected.nombre}</span><span aria-hidden="true" className="text-t-tinta-terciaria">→</span></button>
          : <h1 className="text-[20px] font-bold">{title}</h1>}
        <p className="text-[14px] text-t-tinta-suave mt-0.5">{tf('bento.sub', { category: title, n: dishes.length })}</p>
      </header>
      <ReferenceNote menu={entry.carta} />
      <section role="tabpanel" aria-labelledby={tabId(category)}>
        {dishes.length === 0
          ? <MenuEmpty query={query} category={category} setQuery={setQuery} setCategory={setCategory} />
          : (
            <div className="px-5 py-[18px] grid grid-cols-2 gap-3">
              {cells.map((d) => {
                const active = selected?.id === d.id
                return (
                  <button key={d.id} type="button" aria-pressed={active} onClick={() => tap(d)} className={`min-h-[118px] rounded-t-tarjeta bg-t-superficie p-3.5 flex flex-col justify-between text-left ${active ? 'border-2 border-t-tinta' : 'border border-t-borde'}`}>
                    <span data-testid="cell-label" className={`${caps} ${d.agotado ? 'text-busy-ink' : 'text-t-tinta-terciaria'}`}>{d.agotado ? t('common.soldOut') : compartment(d)}</span>
                    <span className={`text-[16px] font-medium leading-[1.25] ${d.agotado ? 'opacity-55' : ''}`}>{label(d)}</span>
                  </button>
                )
              })}
              {rest.length > 0 && (
                <button type="button" aria-expanded={expanded} aria-controls="f2-rest" onClick={() => setExpanded((e) => !e)} className="min-h-[118px] rounded-t-tarjeta bg-t-superficie border border-dashed border-t-tinta-terciaria/60 p-3.5 flex flex-col justify-between text-left">
                  <span className={`${caps} text-t-tinta-terciaria`}>{tf('bento.choose')}</span>
                  <span className="text-[16px] text-soft leading-[1.25]">{tf('bento.more', { n: rest.length })}</span>
                </button>
              )}
            </div>
          )}
        {expanded && rest.length > 0 && (
          <ul id="f2-rest" className="px-5 pb-3 flex flex-col">
            {rest.map((d) => {
              const active = selected?.id === d.id
              return (
                <li key={d.id} className="border-b border-t-borde last:border-b-0 flex items-center gap-3">
                  <button type="button" aria-pressed={active} onClick={() => tap(d)} className="flex-1 min-w-0 min-h-12 py-2.5 flex items-center justify-between gap-3 text-left">
                    <span className={`text-[15px] truncate ${active ? 'font-medium' : ''} ${d.agotado ? 'opacity-55' : ''}`}>{label(d)}</span>
                    <span className="font-t-mono tabular text-[14px] shrink-0">{formatCop(d.precio)}</span>
                  </button>
                  <AddButton dish={d} onAdd={onAdd} circle="w-[30px] h-[30px] rounded-[8px] bg-t-acento text-t-acento-tinta text-[16px]" />
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <Foot>
        <FOrderBar cart={cart} menu={entry.carta} href={orderBarHref} />
        {selected && (
          <div className="px-5 py-3.5 border-t border-t-borde flex items-center gap-2.5">
            <span className="font-t-mono tabular text-[20px] shrink-0">{formatCop(selected.precio)}</span>
            {selected.agotado
              ? <span className="flex-1 h-14 rounded-t-boton bg-t-superficie border border-t-borde grid place-items-center text-[15px] font-medium text-busy-ink">{t('common.soldOut')}</span>
              : <button type="button" onClick={() => onAdd(selected)} className="flex-1 h-14 rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold truncate px-3">{tf('bento.add')}</button>}
          </div>
        )}
      </Foot>
    </div>
  )
}
