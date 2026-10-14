'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useRef, useState } from 'react'

import { AddButton, AttributeChips, DarkOrderBar, MenuEmpty, ReferenceNote, SearchField, SoldOutBadge } from '@/components/templates/families/D/parts'
import { CategoryTabs, tabId, unique, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Dish } from '@/lib/types'

// D2 · Constructor de bebida (docs/diseno/plantillas/D2). El marco muestra solo la ficha-constructor de una bebida (Tamaño en
// segmentos, Leche en chips, Extras en filas, precio recalculado y «Añadir»). Aquí el layout pinta la carta completa: arriba la
// ficha del plato elegido (por defecto el primero con tamaños, si no el primero disponible) y debajo «Toda la carta» con
// búsqueda, pestañas y filas nombre + precio + ＋. Tocar una fila carga el plato en el constructor (eso es «abrir» en este
// marco); «Ver ficha completa →» lleva a la página del plato (onOpen). Grupos con datos: Tamaño (atributos.tamanos). Leche y
// Extras (atributos.opciones) no existen en el contrato 2: se omiten sin hueco; la «última combinación» de la cuenta tampoco.
// El precio del pie es el que cobra el carrito (producto.precio): el motor no admite variantes, así que los precios por tamaño
// de atributos.tamanos no se pintan (mostrar 8.000 y cobrar 9.000 era engañar al comensal) y el tamaño elegido viaja como nota
// de la línea («Tamaño: 12 oz»), que la cocina y el POS sí leen. Sin tamaños, «Añadir» es el onAdd del contrato.
// El marco no tiene barra de pedido propia: al pie va la barra oscura de Waiter, solo cuando hay algo pedido.
export function D2Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const td = useTranslations('diner.templates.D2')
  const tf = useTranslations('diner.templates.familiaD')
  const categories = entry.carta.categorias
  const all = useMemo(() => unique(categories.flatMap((c) => c.productos)), [categories])
  const dishes = useMenuDishes(categories, query, category)
  const initial = useMemo(() => all.find((d) => !d.agotado && d.atributos?.tamanos?.length) ?? all.find((d) => !d.agotado) ?? all[0] ?? null, [all])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = (selectedId === null ? undefined : all.find((d) => d.id === selectedId)) ?? initial
  // El tamaño elegido va ligado a la bebida: al cambiar de bebida vuelve al primero.
  const [sizeOf, setSizeOf] = useState<{ id: number; i: number } | null>(null)
  const size = sizeOf && sizeOf.id === selected?.id ? sizeOf.i : 0
  const top = useRef<HTMLElement | null>(null)
  // Al elegir desde la lista, la ficha vuelve a la vista (scrollIntoView no existe en jsdom: se comprueba antes).
  const pick = (d: Dish) => { setSelectedId(d.id); if (typeof top.current?.scrollIntoView === 'function') top.current.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const sizes = selected?.atributos?.tamanos ?? []
  const addLine = useDinerStore((s) => s.add)
  const add = (d: Dish) => { const chosen = sizes[size]; if (chosen) void addLine(d.id, 1, td('sizeNote', { size: chosen.nombre })); else onAdd(d) }
  const field = 'h-11 w-full rounded-t-boton bg-t-fondo border border-t-borde px-4 text-[15px] text-t-tinta placeholder:text-t-tinta-terciaria'
  const label = 'text-[13px] tracking-[0.1em] uppercase text-t-tinta-terciaria font-medium'
  return (
    <div className="flex flex-col text-t-tinta">
      {selected && (
        <section ref={top} aria-label={td('builder')} className="flex flex-col border-b border-t-borde">
          <header className="px-5 pt-[18px] pb-4 border-b border-t-borde">
            <h1 className="t-title text-[21px] leading-tight">{selected.nombre}</h1>
            <p className="text-[14px] text-t-tinta-suave mt-0.5">{td('subtitle')}</p>
          </header>
          <div className="px-5 py-4 flex flex-col gap-4">
            {selected.descripcion && <p className="text-[14px] leading-snug text-t-tinta-suave">{selected.descripcion}</p>}
            <AttributeChips attrs={selected.atributos} />
            {sizes.length > 0 && (
              <div role="radiogroup" aria-label={td('size')} className="flex flex-col">
                <span className={`${label} mb-2`}>{td('size')}</span>
                <div className="flex gap-2">
                  {sizes.map((s, i) => (
                    <button key={s.nombre} type="button" role="radio" aria-checked={size === i} onClick={() => setSizeOf({ id: selected.id, i })} className={`flex-1 h-[50px] rounded-[10px] text-[15px] grid place-items-center ${size === i ? 'bg-t-tinta text-t-fondo font-medium' : 'border border-t-borde text-t-tinta'}`}>
                      {s.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button type="button" onClick={() => onOpen(selected)} className="self-start h-11 text-[14px] font-medium text-t-acento">{td('openDish')}</button>
          </div>
          <footer className="px-5 py-3.5 border-t border-t-borde flex items-center gap-2.5">
            <span className="font-t-mono tabular text-[20px]">{formatCop(selected.precio)}</span>
            {selected.agotado
              ? <span className="flex-1 h-14 rounded-t-boton bg-t-superficie grid place-items-center text-[15px] font-medium text-busy-ink">{t('common.soldOut')}</span>
              : <button type="button" onClick={() => add(selected)} className="flex-1 h-14 rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold">{td('add')}</button>}
          </footer>
        </section>
      )}
      <div className="px-5 pt-4 flex flex-col gap-3">
        <h2 className={label}>{tf('fullMenu')}</h2>
        <SearchField query={query} setQuery={setQuery} className={field} />
        <CategoryTabs categories={categories} category={category} setCategory={setCategory} />
        <ReferenceNote show={entry.carta.imagenesDeReferencia} />
      </div>
      <section role="tabpanel" aria-labelledby={tabId(category)} className="px-5 pt-3 pb-4 flex flex-col gap-2">
        {dishes.length === 0
          ? <MenuEmpty query={query} category={category} setQuery={setQuery} setCategory={setCategory} button="h-11 px-[18px] rounded-t-boton bg-t-superficie border border-t-borde text-[15px] font-medium text-t-tinta" />
          : dishes.map((d) => <Row key={d.id} dish={d} active={d.id === selected?.id} onPick={pick} onAdd={onAdd} />)}
      </section>
      <DarkOrderBar cart={cart} href={orderBarHref} hideWhenEmpty />
    </div>
  )
}

// Fila de la carta con el trazo de las filas «Extras» del marco: nombre 15 + precio mono 14, borde 1 px radio 10. La elegida lleva el
// borde del acento sobre acentoSuave (como el chip elegido del marco).
function Row({ dish, active, onPick, onAdd }: { dish: Dish; active: boolean; onPick: (d: Dish) => void; onAdd: (d: Dish) => void }) {
  return (
    <article className={`flex items-center gap-2 pl-3.5 pr-1 rounded-[10px] ${active ? 'border-2 border-t-acento bg-t-acento-suave' : 'border border-t-borde'} ${dish.agotado ? 'opacity-55' : ''}`}>
      <button type="button" aria-pressed={active} onClick={() => onPick(dish)} className="flex-1 min-w-0 min-h-12 py-2 flex items-center justify-between gap-3 text-left">
        <span className={`text-[15px] leading-snug ${active ? 'font-medium' : ''}`}>{dish.nombre}</span>
        <span className="font-t-mono tabular text-[14px] text-t-tinta-suave shrink-0">{formatCop(dish.precio)}</span>
      </button>
      {dish.agotado ? <SoldOutBadge className="mr-2" /> : <AddButton dish={dish} onAdd={onAdd} circle="w-[30px] h-[30px] rounded-full bg-t-acento text-t-acento-tinta text-[16px]" />}
    </article>
  )
}
