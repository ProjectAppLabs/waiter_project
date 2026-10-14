'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { DishPhoto, FOrderBar, FTabs, Foot, MenuEmpty, ReferenceNote, SearchField, SearchToggle, peopleOf } from '@/components/templates/families/F/parts'
import { tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { Dish } from '@/lib/types'

// F5 · Sets para compartir (docs/diseno/plantillas/F5). Bloques del marco: cabecera con la categoría 20/700 y «Precio por persona
// calculado»; tarjetas con radio 16: franja de foto de 84 px (3x2) cuando el plato la tiene, nombre 17/700, precio mono 16,
// descripción 14 en el gris del marco y «{precio/personas} por persona · para N» en mono verde; la seleccionada con borde negro
// de 2 px (tinta, no acento); pie con «Comparar» de contorno y «Añadir · {set}» en el acento (texto acentoTinta). «para N» sale
// de la etiqueta «para N» del producto (atributos.personas no existe): sin ella no hay línea verde. Tocar una tarjeta la
// selecciona; la seleccionada ofrece «Ver el plato →» (onOpen). «Comparar» ordena por precio por persona y marca el mejor.
// El CTA dice «Añadir» en grande y el nombre del set en una segunda línea recortable (el marco escribe «Añadir set 40»; con
// nombres largos el verbo nunca se corta y el nombre completo va en el aria-label). Añadidos de Waiter: pestañas y lupa bajo la
// cabecera y la barra de pedido de la familia sobre el pie (la página no pinta la suya sobre este layout).
export function F5Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const tf = useTranslations('diner.templates.familiaF')
  const [searching, setSearching] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [comparing, setComparing] = useState(false)
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  const perPerson = (d: Dish) => { const n = peopleOf(d); return n ? d.precio / n : null }
  const list = comparing ? [...dishes].sort((a, b) => (perPerson(a) ?? Infinity) - (perPerson(b) ?? Infinity)) : dishes
  const best = comparing ? list.find((d) => perPerson(d) !== null && !d.agotado) ?? null : null
  const selected = dishes.find((d) => d.id === selectedId) ?? dishes[0] ?? null
  const title = category === null ? t('menu.title') : categories.find((c) => c.id === category)?.nombre ?? t('menu.title')
  const chip = (active: boolean) => `h-[36px] px-3 rounded-t-chip text-[14px] ${active ? 'bg-t-acento text-t-acento-tinta font-medium' : 'bg-t-superficie border border-t-borde text-t-tinta'}`
  return (
    <div className="flex flex-col text-t-tinta">
      <header className="px-5 pt-[18px] pb-3.5">
        <h1 className="text-[20px] font-bold">{title}</h1>
        <p className="text-[14px] text-t-tinta-suave mt-0.5">{tf('sets.sub')}</p>
      </header>
      <div className="px-5 pb-3 border-b border-t-borde flex items-center gap-1.5">
        <FTabs categories={categories} category={category} setCategory={setCategory} chip={chip} className="flex-1 min-w-0" />
        <SearchToggle open={searching} setOpen={setSearching} className="rounded-t-chip border border-t-borde text-t-tinta-suave" />
      </div>
      {searching && <div className="px-5 pt-3"><SearchField query={query} setQuery={setQuery} /></div>}
      <ReferenceNote menu={entry.carta} />
      <section role="tabpanel" aria-labelledby={tabId(category)} className="px-5 py-4 flex flex-col gap-3">
        {list.length === 0
          ? <MenuEmpty query={query} category={category} setQuery={setQuery} setCategory={setCategory} />
          : list.map((d) => {
            const active = selected?.id === d.id
            const people = peopleOf(d)
            const each = perPerson(d)
            return (
              <article key={d.id} aria-label={d.nombre} className={`rounded-t-tarjeta overflow-hidden flex flex-col ${active ? 'border-2 border-t-tinta' : 'border border-t-borde'}`}>
                <button type="button" aria-pressed={active} onClick={() => setSelectedId(d.id)} className="text-left flex flex-col">
                  {d.foto && <DishPhoto dish={d} className="h-[84px] w-full" />}
                  <span className="px-[15px] pt-[13px] pb-3 flex flex-col">
                    <span className="flex justify-between items-baseline gap-3">
                      <span className="text-[17px] font-bold">{d.nombre}</span>
                      <span className="font-t-mono tabular text-[16px] shrink-0">{formatCop(d.precio)}</span>
                    </span>
                    {d.descripcion && <span className="text-[14px] text-soft mt-[3px]">{d.descripcion}</span>}
                    {people && each !== null && <span className="font-t-mono tabular text-[13px] text-free-ink mt-[5px]">{tf('sets.perPerson', { amount: formatCop(each), n: people })}</span>}
                    {(best?.id === d.id || (d.agotado && !d.foto)) && (
                      <span className="flex gap-1.5 mt-2">
                        {best?.id === d.id && <span className="h-[26px] px-2 rounded-t-chip bg-free-soft text-free-ink text-[12px] font-medium grid place-items-center">{tf('sets.best')}</span>}
                        {d.agotado && !d.foto && <span className="h-[26px] px-2 rounded-t-chip bg-busy-soft text-busy-ink text-[12px] font-medium grid place-items-center">{t('common.soldOut')}</span>}
                      </span>
                    )}
                  </span>
                </button>
                {active && <button type="button" onClick={() => onOpen(d)} className="mx-[15px] mb-2 self-start h-11 text-[14px] font-medium text-t-tinta-suave">{tf('sets.open')}</button>}
              </article>
            )
          })}
      </section>
      <Foot>
        <FOrderBar cart={cart} menu={entry.carta} href={orderBarHref} />
        {selected && (
          <div className="px-5 py-3.5 border-t border-t-borde flex items-center gap-2.5">
            <button type="button" aria-pressed={comparing} onClick={() => setComparing((c) => !c)} className={`flex-1 h-14 rounded-t-boton border text-[15px] font-medium ${comparing ? 'border-t-tinta bg-t-superficie' : 'border-t-borde'}`}>{tf('sets.compare')}</button>
            {selected.agotado
              ? <span className="flex-[1.4] h-14 rounded-t-boton bg-t-superficie border border-t-borde grid place-items-center text-[15px] font-medium text-busy-ink">{t('common.soldOut')}</span>
              : (
                <button type="button" aria-label={tf('sets.add', { name: selected.nombre })} onClick={() => onAdd(selected)} className="flex-[1.4] min-w-0 h-14 rounded-t-boton bg-t-acento text-t-acento-tinta px-3 flex flex-col items-center justify-center leading-tight">
                  <span className="text-[16px] font-bold">{tf('sets.addVerb')}</span>
                  <span className="max-w-full truncate text-[12px] font-medium opacity-85">{selected.nombre}</span>
                </button>
              )}
          </div>
        )}
      </Foot>
    </div>
  )
}
