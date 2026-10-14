'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { AddButton, EmptyMenu, MenuSearch, SoldOut } from '@/components/templates/families/E/parts'
import { CategoryTabs, tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount } from '@/lib/domain/cart'
import type { Dish } from '@/lib/types'

// E2 · Coctelería en fichas (docs/diseno/plantillas/E2): la cabecera del marco ES la marca, en la voz de la plantilla (Instrument
// Serif 25) con subtítulo gris (el lema o «N cócteles»); es la única cabecera de la pantalla (la página no pinta la suya sobre este
// layout). Bajo ella, el buscador y las categorías de Waiter; fichas de una columna sobre superficie violeta (radio 16, padding 15)
// con nombre 18/700 y precio mono 16 en la misma línea, la descripción como ingredientes en 14 y chips de perfil de 28 px
// (atributos.etiquetas, solo si existen: sin chips ni descripción la ficha es solo su primera línea, sin banda vacía). Barra
// inferior «N ítems · total» con el botón en acento: el marco dice «Otra igual» (repite la última ronda), pero la sesión no guarda
// rondas, así que lleva a orderBarHref como «Ver pedido». El marco no dibuja ＋: va uno de 32 px con borde tras el precio (44 px de
// toque); tocar la ficha abre el plato.
export function E2Menu({ entry, template, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const te = useTranslations('diner.templates.E2')
  const tf = useTranslations('diner.templates.familiaE')
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  const brand = entry.contexto.marca
  const count = itemCount(cart)
  const dark = template.tokens.modo === 'oscuro'
  const showAll = () => { setQuery(''); setCategory(null) }
  return (
    <div className="flex flex-col min-h-[60vh] text-t-tinta">
      <header className="px-5 pt-5 pb-4 border-b border-t-borde flex flex-col gap-3">
        <div>
          <h1 className="t-title text-[25px] leading-tight">{brand.nombre}</h1>
          <p className="text-[13px] text-t-tinta-suave mt-0.5">{brand.lema || te('cocktails', { n: dishes.length })}</p>
        </div>
        <MenuSearch query={query} setQuery={setQuery} />
        <CategoryTabs categories={categories} category={category} setCategory={setCategory} className="[&>button]:h-[44px] [&>button]:text-[14px]" />
      </header>
      {entry.carta.imagenesDeReferencia && <p className="px-5 pt-3 text-[13px] text-t-tinta-suave">{t('menu.referenceImages')}</p>}
      <section role="tabpanel" aria-labelledby={tabId(category)} className="flex-1 px-5 py-4">
        {dishes.length === 0
          ? <EmptyMenu query={query} category={category} onShowAll={showAll} />
          : <ul className="flex flex-col gap-3">{dishes.map((d) => <Card key={d.id} dish={d} dark={dark} onOpen={onOpen} onAdd={onAdd} />)}</ul>}
      </section>
      <div data-testid="frame-order-bar" className="sticky bottom-0 z-30 px-5 py-3.5 border-t border-t-borde bg-t-fondo flex items-center justify-between gap-3 min-h-[76px]">
        {count > 0
          ? <span className="text-[14px] text-t-tinta-terciaria">{te('round', { n: count })}<span className="font-t-mono tabular">{formatCop(cart?.total ?? 0)}</span></span>
          : <span className="text-[14px] text-t-tinta-terciaria">{tf('orderEmpty')}</span>}
        {count > 0 && <Link href={orderBarHref} className="shrink-0 h-[48px] px-4 rounded-t-boton bg-t-acento text-t-acento-tinta text-[15px] font-bold grid place-items-center">{te('seeOrder')}</Link>}
      </div>
    </div>
  )
}

// Ficha: nombre + precio + ＋ en la primera línea, ingredientes (descripción) y chips de perfil (etiquetas) solo si existen.
// Agotado: el contenido al 55 % una sola vez y la insignia «Agotado» fuera de la zona atenuada, en la fila de chips.
function Card({ dish, dark, onOpen, onAdd }: { dish: Dish; dark: boolean; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void }) {
  const tags = dish.atributos?.etiquetas ?? []
  const dim = dish.agotado ? 'opacity-55' : ''
  return (
    <li className="rounded-t-tarjeta bg-t-superficie p-[15px] flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => onOpen(dish)} className={`flex-1 min-w-0 text-left flex flex-col gap-2 ${dim}`}>
          <span className="flex justify-between items-baseline gap-3">
            <span className="text-[18px] font-bold leading-snug">{dish.nombre}</span>
            <span className="font-t-mono tabular text-[16px] whitespace-nowrap">{formatCop(dish.precio)}</span>
          </span>
          {dish.descripcion && <span className="text-[14px] leading-[1.45] text-t-tinta-terciaria">{dish.descripcion}</span>}
        </button>
        {/* 44 px de toque sin estirar la línea del nombre (≈25 px): el margen negativo absorbe el resto. */}
        <AddButton dish={dish} onAdd={onAdd} className="-my-[10px] -mr-2.5" />
      </div>
      {(dish.agotado || tags.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {dish.agotado && <SoldOut dark={dark} chip />}
          {tags.map((x) => <span key={x} className={`inline-flex items-center h-[28px] px-2.5 rounded-t-chip bg-t-borde text-[12px] ${dim}`}>{x}</span>)}
        </div>
      )}
    </li>
  )
}
