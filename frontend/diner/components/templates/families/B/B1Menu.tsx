'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { AddButton, DishMeta, FrameOrderBar, Photo, Pills, SEARCH_FIELD, SEARCH_SURFACE } from '@/components/templates/families/B/parts'
import { tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { Dish } from '@/lib/types'

// B1 · Rejilla con foto (docs/diseno/plantillas/B1): píldoras de categoría arriba (activa en acento), rejilla de 2 columnas con foto de
// 82 px, nombre, precio en mono y ＋ redondo en acento; barra oscura de pedido abajo. El marco no dibuja buscador: va plegado tras
// un botón de 44 px al inicio de las píldoras para no romper el diseño. La barra oscura la pinta el layout (cart.total + orderBarHref)
// y es la única de la pantalla: el marco no dibuja cabecera de marca y la página no superpone la suya ni su barra (ownsChrome).
export function B1Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const tb = useTranslations('diner.templates.familiaB')
  const [searching, setSearching] = useState(false)
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  const emptyText = query ? t('menu.empty') : category === null ? t('menu.emptyMenu') : t('menu.emptyCategory')
  const filtered = query !== '' || category !== null
  const showAll = () => { setQuery(''); setCategory(null) }
  return (
    <div className="flex flex-col min-h-[60vh]">
      <div className="px-[18px] py-4 border-b border-t-borde flex items-center gap-1.5">
        <button type="button" aria-label={tb('searchToggle')} aria-pressed={searching} onClick={() => setSearching((s) => !s)} className={`shrink-0 w-[44px] h-[44px] rounded-t-chip grid place-items-center text-[17px] ${searching || query ? 'bg-t-acento text-t-acento-tinta' : 'border border-t-borde text-t-tinta-suave'}`}>⌕</button>
        <Pills categories={categories} category={category} setCategory={setCategory} className="flex-1" />
      </div>
      {(searching || query) && (
        <div className="px-[18px] pt-3">
          <input type="search" aria-label={tb('search')} placeholder={tb('search')} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" autoFocus className={`${SEARCH_FIELD} ${SEARCH_SURFACE}`} />
        </div>
      )}
      {entry.carta.imagenesDeReferencia && <p className="px-[18px] pt-3 text-[13px] text-t-tinta-suave">{t('menu.referenceImages')}</p>}
      <section role="tabpanel" aria-labelledby={tabId(category)} className="flex-1 px-[18px] py-3.5">
        {dishes.length === 0
          ? (
            <div className="py-10 flex flex-col items-center gap-4 text-center">
              <p role="status" className="text-base text-t-tinta-suave">{emptyText}</p>
              {filtered && <button type="button" onClick={showAll} className="h-[44px] px-[18px] rounded-t-boton bg-t-superficie border border-t-borde text-[15px] font-medium text-t-tinta">{t('home.seeAll')}</button>}
            </div>
          )
          : <div className="grid grid-cols-2 gap-3 content-start">{dishes.map((d) => <Card key={d.id} dish={d} onOpen={onOpen} onAdd={onAdd} />)}</div>}
      </section>
      <FrameOrderBar cart={cart} href={orderBarHref} />
    </div>
  )
}

// Tarjeta del marco: foto 82 px, cuerpo 9/11, nombre 15/500, fila precio (mono 14) + ＋ 32 px. Tocar la tarjeta abre el plato.
function Card({ dish, onOpen, onAdd }: { dish: Dish; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void }) {
  return (
    <article className="border border-t-borde rounded-t-tarjeta bg-t-fondo overflow-hidden flex flex-col">
      <button type="button" onClick={() => onOpen(dish)} className="text-left flex-1 flex flex-col">
        <Photo dish={dish} className="h-[82px] w-full" />
        <div className="px-[11px] pt-[9px] flex flex-col gap-1">
          <span className={`text-[15px] font-medium leading-[1.2] text-t-tinta ${dish.agotado ? 'opacity-55' : ''}`}>{dish.nombre}</span>
          <DishMeta dish={dish} />
        </div>
      </button>
      <div className="px-[11px] pb-[9px] pt-1 flex items-center justify-between">
        <span className="font-t-mono tabular text-[14px] text-t-tinta">{formatCop(dish.precio)}</span>
        <AddButton dish={dish} onAdd={onAdd} className="-mr-1.5 -mb-1.5" />
      </div>
    </article>
  )
}
