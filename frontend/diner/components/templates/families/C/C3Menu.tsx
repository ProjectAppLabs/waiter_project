'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { EmptyList, FOOT_CLASS, SearchField, price } from '@/components/templates/families/C/parts'
import { fold } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import type { Dish } from '@/lib/types'

// C3 · Ármalo tú (docs/diseno/plantillas/C3). Constructor por pasos: cada categoría de la carta es un paso, en orden. Cabecera con
// barra de progreso (un segmento por paso; hechos y actual en acento), «Paso {i} de {n}» y «Elige {categoría}»; opciones como filas
// de borde con nombre 16 y precio mono («incluido» si es 0, «+{precio}» si no); la elegida con borde 2 px de acento y fondo suave;
// la agotada al 60 % con «agotado» en rojo. Pie con «Va en {acumulado}» y «Siguiente» (último paso: «Añadir», que agrega cada
// opción elegida con onAdd y vuelve al primer paso). El paso actual es la categoría de Waiter (setCategory): los segmentos son
// pestañas y saltan de paso; el buscador filtra las opciones del paso. Tocar la opción ya elegida abre su ficha (onOpen).
// Datos no estándar omitidos: precioBase e «incluido» explícito (se infiere solo de precio 0).
export function C3Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd }: MenuLayoutProps) {
  const tc = useTranslations('diner.templates.C3')
  const categories = entry.carta.categorias
  const [chosen, setChosen] = useState<Record<number, Dish>>({})
  const step = Math.max(0, categories.findIndex((c) => c.id === category))
  const current = categories[step]
  const needle = fold(query)
  const options = current ? current.productos.filter((d) => !needle || fold(d.nombre).includes(needle)) : []
  const running = Object.values(chosen).reduce((a, d) => a + d.precio, 0)
  const last = step === categories.length - 1
  const pick = (dish: Dish) => {
    if (dish.agotado || !current) return
    if (chosen[current.id]?.id === dish.id) { onOpen(dish); return }
    setChosen((prev) => ({ ...prev, [current.id]: dish }))
  }
  const next = () => {
    if (!last) { setCategory(categories[step + 1].id); return }
    Object.values(chosen).forEach((d) => onAdd(d))
    setChosen({})
    setCategory(categories[0]?.id ?? null)
  }
  const reset = () => { setQuery(''); setCategory(null) }
  if (!current) return <div className="px-5"><EmptyList query={query} category={category} reset={reset} /></div>
  return (
    <div className="flex flex-col text-t-tinta">
      <header className="px-5 pt-4 pb-4 border-b border-t-borde flex flex-col">
        <div role="tablist" aria-label={tc('progress')} className="flex gap-1.5 mb-3">
          {categories.map((c, i) => (
            <button key={c.id} type="button" role="tab" aria-selected={i === step} aria-label={tc('jump', { i: i + 1, name: c.nombre })} onClick={() => setCategory(c.id)} className="flex-1 h-11 -my-[19px] grid items-center">
              <span aria-hidden="true" className={`block h-1.5 rounded-[3px] ${i <= step ? 'bg-t-acento' : 'bg-t-borde'}`} />
            </button>
          ))}
        </div>
        <span className="text-[13px] text-t-tinta-terciaria">{tc('step', { i: step + 1, n: categories.length })}</span>
        <h2 className="t-title text-[21px] leading-tight mt-0.5">{tc('choose', { name: current.nombre })}</h2>
        <SearchField query={query} setQuery={setQuery} className="mt-3" />
      </header>
      <section role="tabpanel" className="px-5 py-3.5 flex flex-col gap-2.5">
        {options.length === 0 && <EmptyList query={query} category={category} reset={reset} />}
        {options.map((dish) => {
          const on = chosen[current.id]?.id === dish.id
          const row = dish.agotado ? 'border border-t-borde bg-t-superficie opacity-60' : on ? 'border-2 border-t-acento bg-t-acento-suave' : 'border border-t-borde'
          return (
            <button key={dish.id} type="button" aria-pressed={on} disabled={dish.agotado} onClick={() => pick(dish)} className={`w-full min-h-[52px] flex items-center justify-between gap-3 p-3.5 rounded-t-tarjeta text-left ${row}`}>
              <span className={`text-[16px] ${on ? 'font-medium' : ''}`}>{dish.nombre}</span>
              {dish.agotado
                ? <span className="text-[13px] text-busy-ink">{tc('soldOut')}</span>
                : <span className={`font-t-mono tabular text-[14px] ${on ? 'text-pending-ink' : 'text-t-tinta-suave'}`}>{dish.precio === 0 ? tc('included') : tc('extra', { amount: price(dish.precio) })}</span>}
            </button>
          )
        })}
      </section>
      <div className={`${FOOT_CLASS} px-5 py-3.5 border-t border-t-borde bg-t-fondo flex items-center gap-3`}>
        <div className="flex flex-col leading-tight shrink-0">
          <span className="text-[13px] text-t-tinta-terciaria">{tc('runningLabel')}</span>
          <span className="font-t-mono tabular text-[18px]">{price(running)}</span>
        </div>
        <button type="button" onClick={next} disabled={last && Object.keys(chosen).length === 0} className="flex-1 h-14 rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold disabled:opacity-50">{last ? tc('add') : tc('next')}</button>
      </div>
    </div>
  )
}
