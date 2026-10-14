'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { BrandName, EmptyList, FOOT_CLASS, SearchField, money, price } from '@/components/templates/families/C/parts'
import { CategoryTabs, tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { itemCount } from '@/lib/domain/cart'

// C4 · Pizarra de camión (docs/diseno/plantillas/C4). Pizarra oscura con tiza: una sola cabecera centrada con el nombre del
// restaurante (o su logo) en Bebas Neue 34 y una línea de sede en versalitas («{sede} · {lema} · Mesa N», con lo que exista: el
// marco pone ahí la dirección y «hoy hasta agotar», dato no estándar), separada por línea discontinua; lista sin tarjetas: nombre
// en Bebas 24, guía de puntos y precio mono 17, todas las filas con el mismo alto mínimo de toque (44 px) para que el ritmo no
// se rompa en la agotada, que va al 42 %, tachada y con «se acabó» en vez del precio; caja de escasez con borde discontinuo (solo
// con datos reales: los platos que ya se acabaron hoy) y CTA «PEDIR Y PAGAR» en tiza que lleva al pedido (orderBarHref) con el
// total si hay ítems. El toque en la fila agrega (spec: toque = onAdd); Waiter pone el buscador y las categorías bajo la cabecera,
// en la misma tiza. Datos no estándar omitidos: stock y lemaSede.
export function C4Menu({ entry, query, setQuery, category, setCategory, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner.common')
  const tc = useTranslations('diner.templates.C4')
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  const gone = dishes.filter((d) => d.agotado).map((d) => d.nombre)
  const table = entry.contexto.mesa?.numero ?? null
  const venue = [entry.contexto.sede.nombre, entry.contexto.marca.lema, table !== null ? t('table', { n: table }) : null].filter(Boolean).join(' · ')
  const count = itemCount(cart)
  const reset = () => { setQuery(''); setCategory(null) }
  const dashed = 'border-dashed border-t-tinta/28'
  const row = 'w-full min-h-11 flex items-baseline gap-2.5 text-left'
  return (
    <div className="flex flex-col text-t-tinta">
      <header className={`px-5 py-5 text-center border-b ${dashed} flex flex-col items-center`}>
        <BrandName brand={entry.contexto.marca} className="text-[34px] tracking-[0.05em]" />
        {venue && <span className="mt-1.5 text-[12px] tracking-[0.18em] uppercase text-t-tinta-suave">{venue}</span>}
      </header>
      <div className="px-5 pt-3 flex flex-col gap-2.5">
        <SearchField query={query} setQuery={setQuery} className="bg-transparent border-dashed" />
        <CategoryTabs categories={categories} category={category} setCategory={setCategory} />
      </div>
      <section role="tabpanel" aria-labelledby={tabId(category)} className="px-5 py-[18px] flex flex-col gap-3.5">
        {dishes.length === 0 && <EmptyList query={query} category={category} reset={reset} />}
        {dishes.map((dish) => (
          dish.agotado
            ? (
              <div key={dish.id} className={`${row} opacity-[0.42]`}>
                <span className="t-title text-[24px] tracking-[0.03em] leading-none line-through">{dish.nombre}</span>
                <span aria-hidden="true" className="flex-1 border-b border-dotted border-t-tinta/30" />
                <span className="text-[13px]">{tc('soldOut')}</span>
              </div>
            )
            : (
              <button key={dish.id} type="button" aria-label={tc('add', { name: dish.nombre })} onClick={() => onAdd(dish)} className={row}>
                <span className="t-title text-[24px] tracking-[0.03em] leading-none">{dish.nombre}</span>
                <span aria-hidden="true" className="flex-1 border-b border-dotted border-t-tinta/40" />
                <span className="font-t-mono tabular text-[17px]">{price(dish.precio)}</span>
              </button>
            )
        ))}
        {gone.length > 0 && <p className={`mt-2 px-3.5 py-3 rounded-t-tarjeta border ${dashed} text-[13px] leading-snug text-t-tinta-terciaria`}>{tc('scarcity', { names: gone.join(', ') })}</p>}
      </section>
      <div className={`${FOOT_CLASS} px-5 py-4 border-t ${dashed} bg-t-fondo`}>
        <Link href={orderBarHref} className="h-14 rounded-t-boton bg-t-acento text-t-acento-tinta t-title text-[24px] leading-none grid place-items-center">
          {count > 0 ? <span className="whitespace-nowrap">{tc('cta')} · <span className="font-t-mono tabular normal-case tracking-normal text-[18px]">{money(cart?.total ?? 0)}</span></span> : tc('cta')}
        </Link>
      </div>
    </div>
  )
}
