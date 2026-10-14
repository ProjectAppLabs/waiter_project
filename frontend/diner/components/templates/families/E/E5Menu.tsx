'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { EmptyMenu, MenuSearch, SoldOut, useAttrParts } from '@/components/templates/families/E/parts'
import { CategoryTabs, tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount } from '@/lib/domain/cart'
import type { Dish } from '@/lib/types'

// Huecos del flight: el marco dibuja cuatro (tamaño del diseño; el flight no viene en los datos estándar).
export const FLIGHT_SIZE = 4
// Palabras que no nombran nada por sí solas («IPA de la casa» → «IPA»).
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'sin', 'al', 'a', 'en', 'the', 'of'])
// Caracteres que caben en un hueco de 46 px a 14/700 sin recortar.
const FITS = 9
// Nombre corto para el hueco, como los del marco («Golden Ale» → «Golden», «IPA de la casa» → «IPA»): la primera palabra con
// sentido si cabe; si es larga («Hamburguesa Angus»), la palabra más corta que distingue el producto («Angus»), nunca un recorte.
export const shortName = (name: string) => {
  const words = name.trim().split(/\s+/).filter((w) => !STOP.has(w.toLowerCase()))
  if (words.length === 0) return name.trim()
  if (words[0].length <= FITS) return words[0]
  return words.slice(1).filter((w) => w.length >= 3).sort((a, b) => a.length - b.length)[0] ?? words[0]
}

// E5 · Flight de degustación (docs/diseno/plantillas/E5): cabecera «Arma tu flight» con «Elige cuatro» / «N de 4 · $ suma»; fila de
// cuatro huecos de 46 px (los llenos en acento con el nombre corto; los vacíos con borde punteado y ＋); rótulo en versalitas «Añade N
// más»; filas sobre superficie con nombre 15 y ＋ redondo de 32 px con borde; CTA bloqueado «Faltan N para pedir» que pasa a acento
// «Pedir flight · $ suma» al completar, con el radio 12 del marco del menú (radioBoton 8 es el de carrito y pago). El constructor es
// local: el flight (tamaño, precio, orden de servicio) no está en los datos, así que el ＋ de cada fila llena un hueco con el producto
// real, tocar un hueco lo vacía, y «Pedir flight» agrega los cuatro al pedido (onAdd × 4, al precio real de cada uno) y lleva a
// orderBarHref. La carta completa sigue debajo de los huecos (búsqueda y categorías de Waiter arriba de la lista; tocar el nombre abre
// el plato); los elegidos desaparecen de la lista mientras estén en el flight. La nota «Se sirven de la más ligera a la más oscura»
// necesita ordenServicio y se omite. Con ítems en el pedido, «Ver pedido · total» va sobre el CTA.
export function E5Menu({ entry, template, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const te = useTranslations('diner.templates.E5')
  const tf = useTranslations('diner.templates.familiaE')
  const [flight, setFlight] = useState<Dish[]>([])
  const categories = entry.carta.categorias
  const all = useMenuDishes(categories, query, category)
  const chosen = useMemo(() => new Set(flight.map((d) => d.id)), [flight])
  const dishes = useMemo(() => all.filter((d) => !chosen.has(d.id)), [all, chosen])
  const missing = FLIGHT_SIZE - flight.length
  const sum = flight.reduce((a, d) => a + d.precio, 0)
  const count = itemCount(cart)
  const dark = template.tokens.modo === 'oscuro'
  const pick = (d: Dish) => setFlight((f) => (f.length < FLIGHT_SIZE && !f.some((x) => x.id === d.id) ? [...f, d] : f))
  const drop = (d: Dish) => setFlight((f) => f.filter((x) => x.id !== d.id))
  const order = () => { flight.forEach((d) => onAdd(d)); setFlight([]) }
  const showAll = () => { setQuery(''); setCategory(null) }
  const amount = formatCop(sum)
  const [before, after] = te('order', { amount }).split(amount)
  return (
    <div className="flex flex-col min-h-[60vh] text-t-tinta">
      <header className="px-5 py-5 border-b border-t-borde">
        <h1 className="t-title text-[20px] leading-tight">{te('title')}</h1>
        <p className="text-[14px] text-t-tinta-suave mt-0.5">{flight.length === 0 ? te('pickFour') : te('progress', { n: flight.length, size: FLIGHT_SIZE, amount: formatCop(sum) })}</p>
      </header>
      <div className="px-5 pt-4 flex flex-col gap-2.5">
        <ul aria-label={te('slots')} className="flex gap-2 mb-1">
          {Array.from({ length: FLIGHT_SIZE }, (_, i) => {
            const d = flight[i]
            return (
              <li key={i} className="flex-1 min-w-0">
                {d
                  ? <button type="button" aria-label={te('removeSlot', { name: d.nombre })} onClick={() => drop(d)} className="w-full h-[46px] rounded-[10px] bg-t-acento text-t-acento-tinta text-[14px] font-bold truncate px-1">{shortName(d.nombre)}</button>
                  : <span aria-label={te('emptySlot')} className="w-full h-[46px] rounded-[10px] border border-dashed border-t-borde text-t-tinta-suave text-[14px] grid place-items-center">＋</span>}
              </li>
            )
          })}
        </ul>
        <p className="text-[13px] tracking-[0.1em] uppercase font-medium text-t-tinta-terciaria">{te('addMore', { n: missing })}</p>
        <MenuSearch query={query} setQuery={setQuery} />
        <CategoryTabs categories={categories} category={category} setCategory={setCategory} className="pb-0 [&>button]:h-[44px] [&>button]:text-[14px]" />
      </div>
      {entry.carta.imagenesDeReferencia && <p className="px-5 pt-3 text-[13px] text-t-tinta-suave">{t('menu.referenceImages')}</p>}
      <section role="tabpanel" aria-labelledby={tabId(category)} className="flex-1 px-5 py-4">
        {dishes.length === 0
          ? (all.length > 0 ? <p role="status" className="py-6 text-center text-[15px] text-t-tinta-suave">{te('allChosen')}</p> : <EmptyMenu query={query} category={category} onShowAll={showAll} />)
          : <ul className="flex flex-col gap-2.5">{dishes.map((d) => <Row key={d.id} dish={d} dark={dark} full={missing === 0} onOpen={onOpen} onPick={pick} />)}</ul>}
      </section>
      <div data-testid="frame-order-bar" className="sticky bottom-0 z-30 px-5 py-3.5 border-t border-t-borde bg-t-fondo flex flex-col gap-2">
        {count > 0 && <Link href={orderBarHref} className="self-center inline-flex items-center h-[44px] text-[14px] font-medium text-t-acento">{tf('seeOrderTotal', { amount: formatCop(cart?.total ?? 0) })}</Link>}
        {missing > 0
          ? <button type="button" disabled className="h-[56px] rounded-[12px] bg-t-borde text-t-tinta-suave text-[16px] font-bold">{te('missing', { n: missing })}</button>
          : <Link href={orderBarHref} onClick={order} className="h-[56px] rounded-[12px] bg-t-acento text-t-acento-tinta text-[16px] font-bold flex items-center justify-center gap-1">{before}<span className="font-t-mono tabular">{amount}</span>{after}</Link>}
      </div>
    </div>
  )
}

// Fila: nombre 15 (abre el plato), atributos si existen y ＋ de 32 px con borde (44 px de toque) que llena un hueco.
// Agotado: sin ＋, el contenido al 55 % una sola vez y «Agotado» legible en el sitio del ＋.
function Row({ dish, dark, full, onOpen, onPick }: { dish: Dish; dark: boolean; full: boolean; onOpen: (d: Dish) => void; onPick: (d: Dish) => void }) {
  const te = useTranslations('diner.templates.E5')
  const parts = useAttrParts(dish)
  return (
    <li className="rounded-t-tarjeta bg-t-superficie pl-3.5 pr-1.5 flex items-center gap-2">
      <button type="button" onClick={() => onOpen(dish)} className={`flex-1 min-w-0 min-h-[58px] py-2 flex items-center justify-between gap-3 text-left ${dish.agotado ? 'opacity-55' : ''}`}>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-[15px] leading-snug">{dish.nombre}</span>
          {parts.length > 0 && <span className="font-t-mono text-[12px] text-t-tinta-suave truncate">{parts.join(' · ')}</span>}
        </span>
        <span className="font-t-mono tabular text-[14px] text-t-tinta-suave whitespace-nowrap">{formatCop(dish.precio)}</span>
      </button>
      {dish.agotado
        ? <SoldOut dark={dark} className="pr-2" />
        : (
          <button type="button" aria-label={te('addToFlight', { name: dish.nombre })} disabled={full} onClick={() => onPick(dish)} className="shrink-0 w-[44px] h-[44px] grid place-items-center disabled:opacity-40">
            <span aria-hidden="true" className="w-[32px] h-[32px] rounded-full border border-t-borde text-t-tinta-terciaria grid place-items-center text-[16px] leading-none">＋</span>
          </button>
        )}
    </li>
  )
}
