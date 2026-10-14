'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { AddButton, DishPhoto, FOrderBar, FTabs, Foot, MenuEmpty, ReferenceNote, SearchField, SearchToggle } from '@/components/templates/families/F/parts'
import { tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { Dish } from '@/lib/types'

// F1 · Rollos con conteo de piezas (docs/diseno/plantillas/F1). Bloques del marco en orden: tabs rectangulares (radio 8, 42 px,
// la activa rellena en el acento), filas de 86 px con miniatura 58×58 (1x1), nombre 16/500 + chip opcional (picante N / primera
// etiqueta) en la misma línea, descripción 13, «N piezas» en mono terciario y precio mono 15; barra de pedido oscura «18 piezas ·
// 62.000» + «Ver pedido →» pegada al pie (la única barra: la página no pinta la suya sobre este layout). Añadidos de Waiter: la
// lupa pliega el buscador y cada fila lleva su ＋ (44 px) bajo el precio. Sin atributos.piezas la barra dice «N ítems»; sin
// picante/etiquetas no hay chip; picante 0 tampoco lo pinta.
export function F1Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const tf = useTranslations('diner.templates.familiaF')
  const [searching, setSearching] = useState(false)
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  const chip = (active: boolean) => `h-[42px] px-[15px] rounded-[8px] text-[15px] ${active ? 'bg-t-acento text-t-acento-tinta font-medium' : 'border border-t-borde text-t-tinta'}`
  return (
    <div className="flex flex-col text-t-tinta">
      <div className="px-5 py-4 border-b border-t-borde flex items-center gap-1.5">
        <FTabs categories={categories} category={category} setCategory={setCategory} chip={chip} className="flex-1 min-w-0" />
        <SearchToggle open={searching} setOpen={setSearching} className="rounded-[8px] border border-t-borde text-t-tinta-suave" />
      </div>
      {searching && <div className="px-5 pt-3"><SearchField query={query} setQuery={setQuery} /></div>}
      <ReferenceNote menu={entry.carta} />
      <section role="tabpanel" aria-labelledby={tabId(category)}>
        {dishes.length === 0
          ? <MenuEmpty query={query} category={category} setQuery={setQuery} setCategory={setCategory} />
          : <ul className="flex flex-col">{dishes.map((d) => <Row key={d.id} dish={d} onOpen={onOpen} onAdd={onAdd} spicy={tf('spicy', { n: d.atributos?.picante ?? 0 })} />)}</ul>}
      </section>
      <Foot className="mt-2"><FOrderBar cart={cart} menu={entry.carta} href={orderBarHref} /></Foot>
    </div>
  )
}

function Row({ dish, onOpen, onAdd, spicy }: { dish: Dish; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void; spicy: string }) {
  const tf = useTranslations('diner.templates.familiaF')
  const a = dish.atributos
  const tag = a?.etiquetas?.[0]
  const chip = 'h-[22px] px-[7px] rounded-[6px] text-[12px] font-medium grid place-items-center shrink-0'
  return (
    <li className="px-5 py-3.5 border-b border-t-borde last:border-b-0 flex items-center gap-3">
      <button type="button" onClick={() => onOpen(dish)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <DishPhoto dish={dish} className="w-[58px] h-[58px] rounded-[10px] shrink-0" />
        <span className="flex-1 min-w-0 flex flex-col">
          {/* Nombre y chip en la misma línea, como en el marco: el chip no baja; si el ancho no da, el nombre se recorta con puntos. */}
          <span className="flex items-center gap-[7px] min-w-0">
            <span className="text-[16px] font-medium leading-snug truncate">{dish.nombre}</span>
            {a?.picante ? <span className={`${chip} bg-busy-soft text-busy-ink`}>{spicy}</span> : null}
            {tag && <span className={`${chip} bg-free-soft text-free-ink`}>{tag}</span>}
          </span>
          {dish.descripcion && <span className="text-[13px] text-t-tinta-suave line-clamp-1">{dish.descripcion}</span>}
          {a?.piezas ? <span className="font-t-mono tabular text-[13px] text-t-tinta-terciaria mt-0.5">{tf('pieces', { n: a.piezas })}</span> : null}
        </span>
      </button>
      {/* Precio y ＋ apilados a la derecha: el marco solo dibuja el precio; el ＋ de Waiter cabe debajo sin robar ancho al nombre.
          Agotado: la insignia ya va sobre la foto, aquí solo queda el precio. */}
      <span className="shrink-0 flex flex-col items-end gap-1">
        <span className="font-t-mono tabular text-[15px]">{formatCop(dish.precio)}</span>
        <AddButton dish={dish} onAdd={onAdd} soldOutLabel={false} circle="w-[30px] h-[30px] rounded-[8px] bg-t-acento text-t-acento-tinta text-[16px]" />
      </span>
    </li>
  )
}
