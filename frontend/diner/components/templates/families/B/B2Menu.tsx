'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { AddButton, DishMeta, GOLD_INK, Photo, Pills, SEARCH_FIELD, SEARCH_SURFACE } from '@/components/templates/families/B/parts'
import { tabId, unique, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop, recommended } from '@/lib/domain/cart'
import type { Category, Dish } from '@/lib/types'

const TOP = 5

// B2 · Los favoritos primero (docs/diseno/plantillas/B2): cabecera sobre acentoSuave, lista numerada de los más pedidos con miniatura
// cuadrada de 52 px, nombre y precio; fila «Ver la carta completa · N platos» y CTA «Pedir el más pedido». El ranking real
// («312 pedidos este mes», atributo pedidos30d) no existe todavía: se ordena por favorito del POS y, en su lugar, la fila dice
// «Favorito de la casa» o la categoría (datos reales; nada inventado). La carta completa se despliega debajo del ranking
// (buscador + píldoras + filas con ＋) para que ninguna plantilla esconda platos. El antetítulo va en la tinta ámbar de la familia
// (el #A06E2C del marco sobre la crema da 4,1:1 a 11 px: no llega a AA). El marco no dibuja cabecera de marca: no se pinta.
export function B2Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const tb = useTranslations('diner.templates.B2')
  const tf = useTranslations('diner.templates.familiaB')
  const categories = entry.carta.categorias
  const all = useMemo(() => unique(categories.flatMap((c) => c.productos)), [categories])
  const ranking = useMemo(() => recommended(all, TOP), [all])
  const [expanded, setExpanded] = useState(false)
  const open = expanded || query !== '' || category !== null
  const dishes = useMenuDishes(categories, query, category)
  const top = ranking[0]
  const categoryName = (d: Dish) => categories.find((c) => d.categorias.includes(c.id))?.nombre ?? ''
  const emptyText = query ? t('menu.empty') : category === null ? t('menu.emptyMenu') : t('menu.emptyCategory')
  return (
    <div className="flex flex-col min-h-[60vh]">
      <header className="px-[18px] py-[18px] bg-t-acento-suave border-b border-t-borde">
        <p className={`text-[11px] tracking-[0.16em] uppercase font-medium ${GOLD_INK}`}>{tb('kicker')}</p>
        <h1 className="t-title text-[20px] leading-tight mt-1 text-t-tinta">{tb('title')}</h1>
      </header>
      <ol aria-label={tb('rankingLabel')} className="flex flex-col">
        {ranking.map((d, i) => (
          <li key={d.id}>
            <button type="button" onClick={() => onOpen(d)} className="w-full text-left px-[18px] py-[13px] border-b border-t-borde/60 flex items-center gap-3">
              <span aria-hidden="true" className="w-5 shrink-0 font-t-mono tabular text-[18px] text-t-acento">{i + 1}</span>
              <Photo dish={d} className="w-[52px] h-[52px] shrink-0 rounded-t-tarjeta" placeholder={tf('thumb')} />
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-[16px] font-medium leading-snug text-t-tinta truncate">{d.nombre}</span>
                <span className="text-[13px] text-t-tinta-suave truncate">{d.favorito ? tb('favorite') : categoryName(d)}</span>
              </span>
              <span className="font-t-mono tabular text-[15px] text-t-tinta whitespace-nowrap">{formatCop(d.precio)}</span>
            </button>
          </li>
        ))}
      </ol>
      <button type="button" aria-expanded={open} aria-controls="b2-full-menu" onClick={() => { if (open) { setExpanded(false); setQuery(''); setCategory(null) } else setExpanded(true) }} className="w-full text-left px-[18px] min-h-[48px] py-3.5 bg-t-superficie text-[14px] text-t-tinta-suave flex items-center justify-between">
        <span>{open ? tb('hideAll') : tb('seeAll', { n: all.length })}</span>
        <span aria-hidden="true">{open ? '↑' : '↓'}</span>
      </button>
      {open && (
        <section id="b2-full-menu" aria-label={tb('fullMenu')} className="flex flex-col gap-3 pt-3 pb-4">
          <div className="px-[18px] flex flex-col gap-3">
            <input type="search" aria-label={tf('search')} placeholder={tf('search')} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" className={`${SEARCH_FIELD} ${SEARCH_SURFACE}`} />
            <Pills categories={categories} category={category} setCategory={setCategory} />
          </div>
          {entry.carta.imagenesDeReferencia && <p className="px-[18px] text-[13px] text-t-tinta-suave">{t('menu.referenceImages')}</p>}
          <div role="tabpanel" aria-labelledby={tabId(category)}>
            {dishes.length === 0
              ? <p role="status" className="px-[18px] py-6 text-center text-base text-t-tinta-suave">{emptyText}</p>
              : <ul>{dishes.map((d) => <Row key={d.id} dish={d} category={categoryName(d)} onOpen={onOpen} onAdd={onAdd} />)}</ul>}
          </div>
        </section>
      )}
      <div className="flex-1" />
      <div className="sticky bottom-0 z-30 px-[18px] py-3.5 bg-t-fondo border-t border-t-borde">
        {top
          ? <button type="button" aria-label={tb('orderTopNamed', { name: top.nombre })} onClick={() => onAdd(top)} className="w-full h-[52px] rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold">{tb('orderTop')}</button>
          : <p role="status" className="text-center text-[15px] text-t-tinta-suave">{t('menu.emptyMenu')}</p>}
      </div>
    </div>
  )
}

// Fila de la carta completa: mismo ritmo que el ranking (miniatura 52, nombre, categoría o atributos, precio) más ＋ de 44 px.
function Row({ dish, category, onOpen, onAdd }: { dish: Dish; category: Category['nombre']; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void }) {
  const tf = useTranslations('diner.templates.familiaB')
  return (
    <li className="px-[18px] py-2.5 border-b border-t-borde/60 flex items-center gap-3">
      <button type="button" onClick={() => onOpen(dish)} className="flex-1 min-w-0 text-left flex items-center gap-3">
        <Photo dish={dish} className="w-[52px] h-[52px] shrink-0 rounded-t-tarjeta" placeholder={tf('thumb')} />
        <span className="flex-1 min-w-0 flex flex-col">
          <span className={`text-[16px] font-medium leading-snug text-t-tinta truncate ${dish.agotado ? 'opacity-55' : ''}`}>{dish.nombre}</span>
          <DishMeta dish={dish} />
          {!dish.atributos && <span className="text-[13px] text-t-tinta-suave truncate">{category}</span>}
        </span>
        <span className="font-t-mono tabular text-[15px] text-t-tinta whitespace-nowrap">{formatCop(dish.precio)}</span>
      </button>
      <AddButton dish={dish} onAdd={onAdd} size={28} className="-mr-2" />
    </li>
  )
}
