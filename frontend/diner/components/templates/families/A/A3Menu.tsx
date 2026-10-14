'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { AddButton, EmptyMenu, OrderStrip, SearchToggle, SoldOutBadge, attributeChips, dimIf, filterSections } from '@/components/templates/families/A/shared'
import { useCallWaiter } from '@/components/templates/families/A/storeExtras'
import { tabId } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { Dish } from '@/lib/types'

// A3 · Carta de vinos indexada (docs/diseno/plantillas/A3). Bloques del spec: píldoras de categoría con conteo (la activa rellena en el acento;
// «Todo» se añade al frente para conservar el filtro de Waiter), rótulos de grupo en versalitas sobre la superficie, filas de dos líneas
// (nombre en Ubuntu 500, línea secundaria, precio mono a la derecha) y pie con «Filtrar» + «Pedir sumiller». Mapeo: atributos.origen, anada y
// uva no existen en el contrato 2, así que el grupo es la categoría y la segunda línea es la descripción (o los atributos que sí existan).
// «Filtrar» abre la búsqueda de Waiter; «Pedir sumiller» llama al mesero (store.call). Tocar la fila abre el plato; el ＋ hueco lo agrega.
// La barra «Tu pedido» no está en el marco: se añade como línea discreta sobre el pie cuando hay algo pedido.
export function A3Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const ta = useTranslations('diner.templates.familiaA.attr')
  const call = useCallWaiter()
  const [filterOpen, setFilterOpen] = useState(false)
  const [called, setCalled] = useState<'idle' | 'ok' | 'fail'>('idle')
  const categories = entry.carta.categorias
  const sections = filterSections(categories, category, query)
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
  const pill = (value: number | null, label: string) => {
    const active = category === value
    return (
      <button key={tabId(value)} type="button" role="tab" id={tabId(value)} aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => setCategory(value)} className="shrink-0 h-11 flex items-center">
        <span className={`inline-flex items-center h-10 px-3.5 rounded-t-chip text-[14px] whitespace-nowrap ${active ? 'bg-t-acento text-t-acento-tinta font-medium' : 'border border-t-borde text-t-tinta'}`}>{label}</span>
      </button>
    )
  }
  const secondary = (d: Dish) => d.descripcion || attributeChips(d, ta).join(' · ') || null
  const sommelier = async () => { setCalled((await call()) ? 'ok' : 'fail') }
  return (
    <div className="flex flex-col">
      <div role="tablist" aria-label={t('menu.categories')} onKeyDown={onKeyDown} className="px-5 py-[18px] border-b border-t-borde flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {pill(null, t('menu.all'))}
        {categories.map((c) => pill(c.id, `${c.nombre} ${c.productos.length}`))}
      </div>
      {(filterOpen || query) && <div className="px-5 py-2 border-b border-t-borde"><SearchToggle query={query} setQuery={setQuery} open /></div>}
      <section role="tabpanel" aria-labelledby={tabId(category)} className="flex flex-col">
        {sections.length === 0
          ? <div className="px-5"><EmptyMenu query={query} category={category} setQuery={setQuery} setCategory={setCategory} /></div>
          : sections.map((c) => (
            <div key={c.id}>
              <h2 className="px-5 py-3 bg-t-superficie text-[11px] tracking-[0.16em] uppercase text-t-tinta-terciaria">{c.nombre}</h2>
              <ul>
                {c.productos.map((d) => {
                  const sub = secondary(d)
                  return (
                    <li key={d.id} className="px-5 py-3.5 border-b border-t-borde flex items-center justify-between gap-3">
                      {/* Agotado: nombre, línea secundaria y precio al 55 %; la insignia queda fuera, entera. */}
                      <button type="button" onClick={() => onOpen(d)} className={`min-w-0 flex-1 text-left flex flex-col ${dimIf(d)}`}>
                        <span className="text-[16px] font-medium text-t-tinta">{d.nombre}</span>
                        {sub && <span className="text-[13px] text-t-tinta-suave">{sub}</span>}
                      </button>
                      <span className={`font-t-mono tabular text-[15px] whitespace-nowrap text-t-tinta ${dimIf(d)}`}>{formatCop(d.precio)}</span>
                      {d.agotado ? <SoldOutBadge /> : <AddButton dish={d} onAdd={onAdd} />}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
      </section>
      {/* Un solo bloque pegado abajo: la línea de pedido (solo con algo pedido) y el pie de acciones del marco (botones de 48 px, radio 10 fijo del spec). */}
      <div className="sticky bottom-0 bg-t-fondo flex flex-col">
        <OrderStrip cart={cart} href={orderBarHref} variant="line" sticky={false} />
        <div className="px-5 py-3.5 border-t border-t-borde flex flex-col gap-2">
          {called !== 'idle' && <p role="status" className={`text-[13px] ${called === 'ok' ? 'text-free-ink' : 'text-busy-ink'}`}>{called === 'ok' ? t('templates.A3.called') : t('templates.A3.callFailed')}</p>}
          <div className="flex gap-2">
            <button type="button" aria-pressed={filterOpen} onClick={() => { if (filterOpen) setQuery(''); setFilterOpen((o) => !o) }} className="flex-1 h-12 rounded-[10px] border border-t-borde bg-t-fondo text-[15px] font-medium text-t-tinta">{filterOpen ? t('templates.A3.filterClose') : t('templates.A3.filter')}</button>
            <button type="button" onClick={() => void sommelier()} className="flex-1 h-12 rounded-[10px] bg-t-acento text-t-acento-tinta text-[15px] font-medium">{t('templates.A3.sommelier')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
