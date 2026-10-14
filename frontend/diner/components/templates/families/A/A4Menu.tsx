'use client'

import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import { AddButton, DishPhoto, EditorialTabs, EmptyMenu, OrderStrip, SearchToggle, SoldOutBadge, attributeChips, dimIf } from '@/components/templates/families/A/shared'
import { tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'

// A4 · Plato con relato (docs/diseno/plantillas/A4). El marco es la ficha de un solo plato: foto 3:2 a sangre (158 px; placeholder #E8E1D5 del
// spec), nombre en serif 26, descripción larga, chips grises de atributos, y pie con precio mono 22 + «Añadir». El marco no dibuja la lista que
// lleva a la ficha; este layout la resuelve así: índice de categorías en versalitas + búsqueda plegada arriba, la ficha del plato elegido (por
// defecto el primero de la lista filtrada) y debajo «Más de la carta» con filas compactas (nombre, precio, ＋); tocar una fila la convierte en
// la ficha. Tocar la foto o el nombre abre el plato (onOpen); «Añadir» y los ＋ llaman onAdd. atributos.maridaje y tiempoMin no existen en
// el contrato 2 (la caja de maridaje se omite); los chips salen de piezas, picante, etiquetas, abv/ibu, tamaños, soloHoy y alérgenos si existen.
export function A4Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const ta = useTranslations('diner.templates.familiaA.attr')
  const [picked, setPicked] = useState<number | null>(null)
  const top = useRef<HTMLDivElement>(null)
  const dishes = useMenuDishes(entry.carta.categorias, query, category)
  const hero = dishes.find((d) => d.id === picked) ?? dishes[0]
  const rest = hero ? dishes.filter((d) => d.id !== hero.id) : []
  const chips = hero ? attributeChips(hero, ta) : []
  const pick = (id: number) => { setPicked(id); top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }
  return (
    <div className="flex flex-col" ref={top}>
      <div className="px-[22px] pt-3 pb-1 flex items-center gap-1 border-b border-t-borde">
        <EditorialTabs categories={entry.carta.categorias} category={category} setCategory={setCategory} className="min-w-0" />
        <SearchToggle query={query} setQuery={setQuery} className="min-w-0 ml-auto" />
      </div>
      {entry.carta.imagenesDeReferencia && <p className="px-[22px] pt-2 text-[13px] text-t-tinta-suave">{t('menu.referenceImages')}</p>}
      <section role="tabpanel" aria-labelledby={tabId(category)} className="flex flex-col">
        {!hero
          ? <div className="px-[22px]"><EmptyMenu query={query} category={category} setQuery={setQuery} setCategory={setCategory} /></div>
          : (
            <article aria-label={hero.nombre} className="flex flex-col">
              <button type="button" aria-label={hero.nombre} onClick={() => onOpen(hero)} className="block w-full text-left">
                <DishPhoto dish={hero} className="h-[158px] w-full" placeholderClass="bg-[#E8E1D5]" />
              </button>
              <div className="px-[22px] py-[22px] flex flex-col gap-3">
                <button type="button" onClick={() => onOpen(hero)} className="text-left"><h1 className="t-title text-[26px] leading-[1.1] text-t-tinta">{hero.nombre}</h1></button>
                {hero.descripcion && <p className="text-[15px] leading-[1.5] text-t-tinta-suave">{hero.descripcion}</p>}
                {chips.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {chips.map((c) => <li key={c} className="inline-flex items-center h-[30px] px-2.5 rounded-t-chip bg-muted text-[13px] text-t-tinta-suave">{c}</li>)}
                  </ul>
                )}
                {hero.agotado && !hero.foto && <SoldOutBadge className="self-start" />}
              </div>
              <div className="px-[22px] py-4 border-t border-t-borde flex items-center gap-3">
                <span className="font-t-mono tabular text-[22px] text-t-tinta">{formatCop(hero.precio)}</span>
                <button type="button" disabled={hero.agotado} onClick={() => onAdd(hero)} className="flex-1 h-14 rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold disabled:opacity-60">
                  {hero.agotado ? t('common.soldOut') : t('templates.A4.add')}
                </button>
              </div>
            </article>
          )}
        {rest.length > 0 && (
          <div className="px-[22px] pt-4 pb-2 flex flex-col">
            <h2 className="text-[11px] tracking-[0.2em] uppercase text-t-tinta-terciaria pb-2">{t('templates.A4.more')}</h2>
            <ul>
              {rest.map((d) => (
                <li key={d.id} className="py-2.5 border-t border-t-borde flex items-center gap-3">
                  {/* Agotado: la miniatura ya se atenúa sola (DishPhoto); aquí solo el texto, una vez, y la insignia fuera. */}
                  <button type="button" aria-label={t('templates.A4.show', { name: d.nombre })} onClick={() => pick(d.id)} className="min-w-0 flex-1 text-left flex items-center gap-3">
                    <DishPhoto dish={d} badge={false} className="w-11 h-11 shrink-0 rounded-[8px] text-[0px]" />
                    <span className={`flex flex-col min-w-0 ${dimIf(d)}`}><span className="text-[15px] font-medium text-t-tinta truncate">{d.nombre}</span><span className="font-t-mono tabular text-[13px] text-t-tinta-suave">{formatCop(d.precio)}</span></span>
                  </button>
                  {d.agotado ? <SoldOutBadge /> : <AddButton dish={d} onAdd={onAdd} />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <OrderStrip cart={cart} href={orderBarHref} variant="line" />
    </div>
  )
}
