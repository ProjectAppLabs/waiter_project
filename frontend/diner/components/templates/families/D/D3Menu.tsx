'use client'

import { useTranslations } from 'next-intl'

import { AddButton, DarkOrderBar, DishPhoto, MenuEmpty, ReferenceNote, SearchField, SoldOutBadge } from '@/components/templates/families/D/parts'
import { CategoryTabs, tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { Dish } from '@/lib/types'

// D3 · Vitrina de panadería (docs/diseno/plantillas/D3). Fondo crema; cabecera «Salió del horno» con, a la derecha en mono acento,
// el conteo de piezas visibles (la hora del último horneado de la sede no existe en los datos); rejilla de 2 columnas de tarjetas
// blancas con foto de 88 px (recorte 3x2), nombre 15/500 y precio mono; banda inferior sobre acentoSuave. El stock en vivo
// («18 quedan») y la hora del próximo horneado no existen: a la derecha del precio va el ＋, y agotado deja la tarjeta entera al
// 55 % (una sola vez: la foto no se atenúa aparte) con «Agotado» en rojo donde el marco pone «a las 10». La banda inferior lleva
// el texto del marco. Búsqueda y pestañas de Waiter bajo la cabecera (el marco no las trae). Sin barra de pedido propia: al pie
// va la barra oscura de Waiter, solo cuando hay algo pedido.
export function D3Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const td = useTranslations('diner.templates.D3')
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  const field = 'h-11 w-full rounded-t-boton bg-t-superficie border border-t-borde px-4 text-[15px] text-t-tinta placeholder:text-t-tinta-terciaria'
  return (
    <div className="flex flex-col text-t-tinta">
      <header className="px-5 py-[18px] border-b border-t-borde flex items-baseline justify-between gap-3">
        <h1 className="t-title text-[20px] leading-tight">{td('title')}</h1>
        <span className="font-t-mono tabular text-[13px] text-t-acento">{td('count', { n: dishes.length })}</span>
      </header>
      <div className="px-5 pt-3.5 flex flex-col gap-2.5">
        <SearchField query={query} setQuery={setQuery} className={field} />
        <CategoryTabs categories={categories} category={category} setCategory={setCategory} />
        <ReferenceNote show={entry.carta.imagenesDeReferencia} />
      </div>
      <section role="tabpanel" aria-labelledby={tabId(category)} className="px-5 py-3.5">
        {dishes.length === 0
          ? <MenuEmpty query={query} category={category} setQuery={setQuery} setCategory={setCategory} button="h-11 px-[18px] rounded-t-boton bg-t-superficie border border-t-borde text-[15px] font-medium text-t-tinta" />
          : <div className="grid grid-cols-2 gap-3 content-start">{dishes.map((d) => <Card key={d.id} dish={d} onOpen={onOpen} onAdd={onAdd} />)}</div>}
      </section>
      <p className="px-5 py-3 border-t border-t-borde bg-t-acento-suave text-[13px] leading-[1.45] text-t-tinta-terciaria">{td('inventory')}</p>
      <DarkOrderBar cart={cart} href={orderBarHref} hideWhenEmpty />
    </div>
  )
}

// Tarjeta de vitrina: foto 88 px, cuerpo 9/11, nombre 15/500, fila precio mono 14 + ＋ (o «Agotado» en rojo con la tarjeta al 55 %).
function Card({ dish, onOpen, onAdd }: { dish: Dish; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void }) {
  return (
    <article className={`rounded-t-tarjeta overflow-hidden border border-t-borde bg-t-superficie flex flex-col ${dish.agotado ? 'opacity-55' : ''}`}>
      <button type="button" onClick={() => onOpen(dish)} className="text-left flex flex-col">
        <DishPhoto dish={dish} className="h-[88px] w-full" />
        <span className="px-[11px] pt-[9px] text-[15px] font-medium leading-snug">{dish.nombre}</span>
      </button>
      <div className="px-[11px] pb-[9px] pt-1 flex items-center justify-between gap-2">
        <span className="font-t-mono tabular text-[14px]">{formatCop(dish.precio)}</span>
        {dish.agotado ? <SoldOutBadge /> : <AddButton dish={dish} onAdd={onAdd} className="-my-2 -mr-2" circle="w-7 h-7 rounded-full bg-t-acento text-t-acento-tinta text-[15px]" />}
      </div>
    </article>
  )
}
