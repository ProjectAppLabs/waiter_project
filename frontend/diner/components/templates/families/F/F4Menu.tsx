'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { AddButton, FOrderBar, FTabs, Foot, MenuEmpty, ReferenceNote, SearchField, SearchToggle } from '@/components/templates/families/F/parts'
import { fold, tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { Dish, Menu } from '@/lib/types'

// F4 · Nivel de picante y alérgenos (docs/diseno/plantillas/F4). Bloques del marco: «Filtra la carta» con píldoras «Sin {alérgeno}»
// (de atributos.alergenos de toda la carta) y una por etiqueta («Vegano»…), la activa en verde semántico; lista sin fotos con nombre
// 16/500 y precio mono 15, la escala «Picante» de cuatro barras (llenas = atributos.picante), «Contiene: …» en 13; el plato que
// choca con un filtro no desaparece: se atenúa al 45 % y dice por qué; pie con la nota fija. La nota «ajustable / fijo» pide
// picanteAjustable, que no existe: se omite. picante 0 no pinta la escala vacía (0 = sin picante, como sin el atributo). Agotado:
// el cuerpo se atenúa al 55 % una sola vez y «Agotado» queda legible a la derecha, donde iría el ＋. Añadidos de Waiter: pestañas
// de categoría y lupa arriba, ＋ de 44 px por fila y la barra de pedido de la familia sobre la nota del pie (la página no pinta
// la suya sobre este layout).
type Filter = { kind: 'sin'; value: string } | { kind: 'tag'; value: string }
const key = (f: Filter) => `${f.kind}:${fold(f.value)}`

// Píldoras de la carta: «Sin X» por cada alérgeno y una por etiqueta dietética (vegano, vegetariano, «sin …»); las etiquetas de
// color o porción («rubia», «para 3») no filtran, y «sin gluten» como etiqueta no se repite si «gluten» ya es alérgeno.
const DIET = ['vegano', 'vegana', 'vegetariano', 'vegetariana', 'vegetal']
const dietary = (tag: string) => DIET.includes(fold(tag)) || fold(tag).startsWith('sin ')
function filtersOf(menu: Menu): Filter[] {
  const allergens = new Map<string, string>()
  const tags = new Map<string, string>()
  for (const c of menu.categorias) for (const d of c.productos) {
    for (const a of d.atributos?.alergenos ?? []) allergens.set(fold(a), a)
    for (const e of d.atributos?.etiquetas ?? []) if (dietary(e)) tags.set(fold(e), e)
  }
  for (const a of allergens.keys()) tags.delete(`sin ${a}`)
  return [...Array.from(allergens.values(), (value) => ({ kind: 'sin', value }) as Filter), ...Array.from(tags.values(), (value) => ({ kind: 'tag', value }) as Filter)]
}
// Motivo por el que un plato choca con los filtros activos (el primero que choque), o null si pasa.
function clash(dish: Dish, active: Filter[]): Filter | null {
  for (const f of active) {
    if (f.kind === 'sin' && (dish.atributos?.alergenos ?? []).some((a) => fold(a) === fold(f.value))) return f
    if (f.kind === 'tag' && !(dish.atributos?.etiquetas ?? []).some((e) => fold(e) === fold(f.value))) return f
  }
  return null
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function F4Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const tf = useTranslations('diner.templates.familiaF')
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState<Filter[]>([])
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  const filters = useMemo(() => filtersOf(entry.carta), [entry.carta])
  const isOn = (f: Filter) => active.some((a) => key(a) === key(f))
  const toggle = (f: Filter) => setActive((prev) => (prev.some((a) => key(a) === key(f)) ? prev.filter((a) => key(a) !== key(f)) : [...prev, f]))
  const chip = (on: boolean) => `h-[36px] px-3 rounded-t-chip text-[14px] ${on ? 'bg-t-acento text-t-acento-tinta font-medium' : 'border border-t-borde text-t-tinta'}`
  const pill = (on: boolean) => `h-[38px] px-3 rounded-t-chip text-[14px] ${on ? 'bg-free-soft text-free-ink font-medium' : 'border border-t-borde text-t-tinta'}`
  const filterLabel = (f: Filter) => (f.kind === 'sin' ? tf('filter.without', { allergen: f.value }) : cap(f.value))
  return (
    <div className="flex flex-col text-t-tinta">
      <div className="px-5 pt-3 pb-3 border-b border-t-borde flex items-center gap-1.5">
        <FTabs categories={categories} category={category} setCategory={setCategory} chip={chip} className="flex-1 min-w-0" />
        <SearchToggle open={searching} setOpen={setSearching} className="rounded-t-chip border border-t-borde text-t-tinta-suave" />
      </div>
      {searching && <div className="px-5 pt-3"><SearchField query={query} setQuery={setQuery} /></div>}
      {filters.length > 0 && (
        <section aria-label={tf('filter.title')} className="px-5 py-4 border-b border-t-borde">
          <h2 className="text-[13px] tracking-[0.1em] uppercase text-t-tinta-terciaria font-medium">{tf('filter.title')}</h2>
          <div className="flex flex-wrap gap-[7px] mt-2.5">
            {filters.map((f) => {
              const on = isOn(f)
              return <button key={key(f)} type="button" aria-pressed={on} onClick={() => toggle(f)} className={pill(on)}>{filterLabel(f)}{on ? ' ✓' : ''}</button>
            })}
          </div>
        </section>
      )}
      <ReferenceNote menu={entry.carta} />
      <section role="tabpanel" aria-labelledby={tabId(category)}>
        {dishes.length === 0
          ? <MenuEmpty query={query} category={category} setQuery={setQuery} setCategory={setCategory} />
          : <ul className="flex flex-col">{dishes.map((d) => <Row key={d.id} dish={d} reason={clash(d, active)} onOpen={onOpen} onAdd={onAdd} />)}</ul>}
      </section>
      <Foot>
        <FOrderBar cart={cart} menu={entry.carta} href={orderBarHref} />
        <p className="px-5 py-3 border-t border-t-borde text-[13px] leading-[1.45] text-soft">{tf('filter.note')}</p>
      </Foot>
    </div>
  )
}

function Row({ dish, reason, onOpen, onAdd }: { dish: Dish; reason: Filter | null; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void }) {
  const tf = useTranslations('diner.templates.familiaF')
  const a = dish.atributos
  const spicy = a?.picante ?? 0
  return (
    <li className={`px-5 py-3.5 border-b border-t-borde last:border-b-0 flex items-start gap-3 ${reason ? 'opacity-45' : ''}`} data-filtered={reason ? 'true' : undefined}>
      <button type="button" onClick={() => onOpen(dish)} className={`flex-1 min-w-0 flex flex-col text-left ${dish.agotado ? 'opacity-55' : ''}`}>
        <span className="flex justify-between gap-3">
          <span className="text-[16px] font-medium">{dish.nombre}</span>
          <span className="font-t-mono tabular text-[15px] shrink-0">{formatCop(dish.precio)}</span>
        </span>
        {spicy > 0 && !reason && (
          <span className="flex items-center gap-2 mt-[7px]" aria-label={`${tf('filter.spicy')} ${spicy}/3`}>
            <span className="text-[13px] text-t-tinta-suave">{tf('filter.spicy')}</span>
            <span aria-hidden="true" className="flex gap-[3px]">{[1, 2, 3, 4].map((i) => <span key={i} className={`w-[22px] h-1.5 rounded-[3px] ${i <= spicy ? 'bg-t-acento' : 'bg-t-borde'}`} />)}</span>
          </span>
        )}
        {a?.alergenos && a.alergenos.length > 0 && !reason && <span className="text-[13px] text-t-tinta-suave mt-1.5">{tf('filter.contains', { list: a.alergenos.join(', ') })}</span>}
        {reason && <span className="text-[13px] text-busy-ink mt-1.5">{reason.kind === 'sin' ? tf('filter.hiddenAllergen', { allergen: reason.value }) : tf('filter.hiddenTag', { tag: reason.value })}</span>}
      </button>
      {!reason && <AddButton dish={dish} onAdd={onAdd} circle="w-[30px] h-[30px] rounded-full bg-t-acento text-t-acento-tinta text-[16px]" />}
    </li>
  )
}
