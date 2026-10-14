'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { DishPhoto, EmptyList, FOOT_CLASS, SearchField, extrasOf, price } from '@/components/templates/families/C/parts'
import { CategoryTabs, TemplateDishCard, tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { itemCount } from '@/lib/domain/cart'

// C5 · Kiosco de autoservicio (docs/diseno/plantillas/C5). La pantalla principal es el resumen del pedido, no la carta: banda
// ámbar fija del diseño con «Tu pedido» y el total en mono; filas del carrito con «{n}×» en mono terciario, nombre 16/500, nota
// y total de la línea; sección «ANTES DE PAGAR» con dos tarjetas de upsell (foto 52 px, nombre, «+precio»; salen de la categoría
// de extras y no repiten lo que ya está en el pedido); pie con «Seguir pidiendo» (abre la carta: rejilla del motor con buscador y
// categorías, que el marco no muestra) y «Pagar» en verde (orderBarHref, flex 1.3). Con el pedido vacío la carta se abre sola.
// La banda ámbar (#C1873A sobre #1A1815) es un color fijo de la plantilla, distinto del acento verde de acción.
export function C5Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const tc = useTranslations('diner.templates.C5')
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  const lines = cart?.lineas ?? []
  const count = itemCount(cart)
  const [open, setOpen] = useState(false)
  const showMenu = open || count === 0
  const extras = extrasOf(categories, lines.map((l) => l.producto_id)).slice(0, 2)
  const reset = () => { setQuery(''); setCategory(null) }
  return (
    <div className="flex flex-col text-t-tinta">
      <div className="px-[18px] py-4 bg-[#C1873A] text-[#1A1815] flex items-center justify-between gap-3">
        <span className="text-[19px] font-bold">{tc('yourOrder')}</span>
        <span className="font-t-mono tabular text-[19px]">{price(cart?.total ?? 0)}</span>
      </div>
      {lines.length === 0
        ? <p className="px-[18px] py-3.5 text-[14px] text-t-tinta-suave border-b border-t-borde">{tc('empty')}</p>
        : (
          <ul className="flex flex-col">
            {lines.map((l) => (
              <li key={l.id} className="px-[18px] py-3.5 border-b border-t-borde flex items-center gap-3">
                <span className="font-t-mono tabular text-[17px] text-t-tinta-terciaria shrink-0">{tc('qty', { n: l.cantidad })}</span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="text-[16px] font-medium leading-tight">{l.nombre}</span>
                  {l.nota && <span className="text-[13px] text-t-tinta-suave">{l.nota}</span>}
                </span>
                <span className="font-t-mono tabular text-[16px] shrink-0">{price(l.subtotal)}</span>
              </li>
            ))}
          </ul>
        )}
      {extras.length > 0 && (
        <section aria-label={tc('beforePay')} className="px-[18px] py-4 flex flex-col gap-2.5">
          <span className="text-[13px] tracking-[0.12em] uppercase text-t-tinta-terciaria font-medium">{tc('beforePay')}</span>
          <div className="flex gap-2.5">
            {extras.map((d) => (
              <button key={d.id} type="button" aria-label={`${t('common.add')}: ${d.nombre}`} onClick={() => onAdd(d)} className="flex-1 min-w-0 border border-t-borde rounded-t-tarjeta p-3 flex flex-col gap-1.5 text-left">
                <DishPhoto dish={d} className="h-[52px] w-full rounded-lg" />
                <span className="text-[14px] font-medium leading-tight">{d.nombre}</span>
                <span className="font-t-mono tabular text-[13px]">{tc('plus', { amount: price(d.precio) })}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {showMenu && (
        <section id="c5-menu" className="px-[18px] pt-3 pb-4 flex flex-col gap-3 border-t border-t-borde">
          <h2 className="t-title text-[19px] leading-tight">{tc('menuTitle')}</h2>
          <SearchField query={query} setQuery={setQuery} />
          <CategoryTabs categories={categories} category={category} setCategory={setCategory} />
          {entry.carta.imagenesDeReferencia && <p className="text-[13px] text-t-tinta-suave">{t('menu.referenceImages')}</p>}
          <div role="tabpanel" aria-labelledby={tabId(category)}>
            {dishes.length === 0
              ? <EmptyList query={query} category={category} reset={reset} />
              : <div className="grid grid-cols-2 gap-3">{dishes.map((d) => <TemplateDishCard key={d.id} dish={d} onOpen={onOpen} onAdd={onAdd} />)}</div>}
          </div>
        </section>
      )}
      <div className={`${FOOT_CLASS} px-[18px] py-3.5 border-t border-t-borde bg-t-fondo flex gap-2.5`}>
        <button type="button" aria-expanded={showMenu} aria-controls="c5-menu" onClick={() => setOpen((o) => !o)} className="flex-1 h-[60px] rounded-t-boton border border-t-borde text-[16px] font-medium">{tc('keepOrdering')}</button>
        <Link href={orderBarHref} className="flex-[1.3] h-[60px] rounded-t-boton bg-t-acento text-t-acento-tinta text-[17px] font-bold grid place-items-center">{tc('pay')}</Link>
      </div>
    </div>
  )
}
