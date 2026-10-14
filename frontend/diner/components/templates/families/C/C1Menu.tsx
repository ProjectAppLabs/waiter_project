'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { BrandName, EmptyList, FOOT_CLASS, SearchField, SoldOutBadge, TableChip, money, price } from '@/components/templates/families/C/parts'
import { CategoryTabs, fold, tabId } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { itemCount } from '@/lib/domain/cart'
import type { Category, Dish } from '@/lib/types'

// C1 · Combos numerados (docs/diseno/plantillas/C1). Marco oscuro: cabecera única con el nombre del restaurante (o su logo) en la
// voz de la plantilla (Bebas Neue 30) y, donde el marco pone el chip de espera (dato no estándar, omitido), el chip de mesa de
// Waiter; lista de filas-tarjeta con el número del combo en ámbar, nombre 17/700, subtítulo (descripción o «El más pedido») y
// precio mono 17; nota de uso y CTA «PEDIR EL {n}» de 60 px. El número es el producto y se pide en voz alta: es único en toda la
// carta (posición corrida por categorías, cada plato una sola vez) y no cambia al filtrar ni al cambiar de pestaña. Waiter pone el
// buscador y las pestañas bajo la cabecera (el marco no las dibuja); en «Todo» se listan todas las categorías con su rótulo.
// Un toque en la fila la selecciona (aria-pressed) y el CTA la pide (onAdd); tocar la fila ya seleccionada abre su ficha (onOpen).
// Sin selección, el CTA lleva al pedido (orderBarHref). Datos no estándar omitidos: esperaMinutos (chip rojo de espera).
const numberDishes = (categories: Category[]): Map<number, number> => {
  const numbers = new Map<number, number>()
  categories.forEach((c) => c.productos.forEach((d) => { if (!numbers.has(d.id)) numbers.set(d.id, numbers.size + 1) }))
  return numbers
}

export function C1Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const tc = useTranslations('diner.templates.C1')
  const categories = entry.carta.categorias
  const [selected, setSelected] = useState<{ dish: Dish; n: number } | null>(null)
  const numbers = useMemo(() => numberDishes(categories), [categories])
  const needle = fold(query)
  // El número es el del plato en la carta completa: «PEDIR EL 4» sigue siendo el 4 aunque se busque o se filtre por categoría.
  const groups = (category === null ? categories : categories.filter((c) => c.id === category))
    .map((c) => ({ id: c.id, nombre: c.nombre, rows: c.productos.map((dish) => ({ dish, n: numbers.get(dish.id) ?? 0 })).filter(({ dish }) => !needle || fold(dish.nombre).includes(needle)) }))
    .filter((g) => g.rows.length > 0)
  const reset = () => { setQuery(''); setCategory(null) }
  const tap = (dish: Dish, n: number) => {
    if (dish.agotado) return
    if (selected?.dish.id === dish.id) onOpen(dish)
    else setSelected({ dish, n })
  }
  const order = () => { if (selected) { onAdd(selected.dish); setSelected(null) } }
  const subtitle = (dish: Dish) => (dish.descripcion ? dish.descripcion.split('\n')[0] : dish.favorito ? tc('mostOrdered') : null)
  const count = itemCount(cart)
  const cta = 'h-[60px] rounded-t-boton bg-t-acento text-t-acento-tinta t-title text-[26px] leading-none grid place-items-center'
  return (
    <div className="flex flex-col text-t-tinta">
      <header className="px-5 py-[18px] border-b border-t-borde flex items-center justify-between gap-3">
        <BrandName brand={entry.contexto.marca} className="text-[30px]" />
        <TableChip table={entry.contexto.mesa?.numero ?? null} />
      </header>
      <div className="px-5 pt-3 flex flex-col gap-2.5">
        <SearchField query={query} setQuery={setQuery} />
        <CategoryTabs categories={categories} category={category} setCategory={setCategory} />
      </div>
      <section role="tabpanel" aria-labelledby={tabId(category)} className="px-5 py-3.5 flex flex-col gap-2.5">
        {groups.length === 0 && <EmptyList query={query} category={category} reset={reset} />}
        {groups.map((g) => (
          <div key={g.id} className="flex flex-col gap-2.5">
            {category === null && groups.length > 1 && <h2 className="pt-1 text-[12px] tracking-[0.12em] uppercase text-t-tinta-terciaria">{g.nombre}</h2>}
            {g.rows.map(({ dish, n }) => {
              const active = selected?.dish.id === dish.id
              const sub = subtitle(dish)
              // Agotado: número, nombre y subtítulo al 55 % (una sola atenuación); la insignia queda fuera de ella para leerse.
              const dim = dish.agotado ? 'opacity-55' : ''
              return (
                <button key={dish.id} type="button" aria-pressed={active} aria-label={tc('select', { n, name: dish.nombre })} disabled={dish.agotado} onClick={() => tap(dish, n)}
                  className={`w-full text-left flex items-center gap-3.5 p-3 rounded-t-tarjeta bg-t-superficie border-2 ${active ? 'border-t-acento' : 'border-transparent'}`}>
                  <span aria-hidden="true" className={`t-title text-[40px] leading-[0.9] w-[42px] shrink-0 text-t-acento ${dim}`}>{n}</span>
                  <span className={`flex-1 min-w-0 flex flex-col ${dim}`}>
                    <span className="text-[17px] font-bold leading-tight">{dish.nombre}</span>
                    {sub && <span className="text-[13px] text-t-tinta-suave leading-snug line-clamp-1">{sub}</span>}
                  </span>
                  {dish.agotado
                    ? <SoldOutBadge className="shrink-0" />
                    : <span className="font-t-mono tabular text-[17px] shrink-0">{price(dish.precio)}</span>}
                </button>
              )
            })}
          </div>
        ))}
        {groups.length > 0 && <p className="pt-1 text-[13px] text-t-tinta-terciaria">{tc('note')}</p>}
      </section>
      <div className={`${FOOT_CLASS} px-5 py-4 border-t border-t-borde bg-t-fondo`}>
        {selected
          ? <button type="button" onClick={order} className={`w-full ${cta}`}>{tc('order', { n: selected.n })}</button>
          : <Link href={orderBarHref} className={`${cta} whitespace-nowrap ${count > 0 ? 'text-[22px]' : ''}`}>{count > 0 ? <span>{tc('seeOrder')} · <span className="font-t-mono tabular normal-case tracking-normal text-[18px]">{money(cart?.total ?? 0)}</span></span> : tc('seeOrder')}</Link>}
      </div>
    </div>
  )
}
