'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { AddButton, EmptyMenu, MenuSearch, SoldOut } from '@/components/templates/families/E/parts'
import { CategoryTabs, tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount } from '@/lib/domain/cart'
import type { Dish } from '@/lib/types'

// E3 · Happy hour con reloj (docs/diseno/plantillas/E3): cabecera en acento (rojo, texto blanco) con rótulo en versalitas y una cifra
// mono de 42 px; tarjetas de una columna sobre superficie con nombre 16/500, subtítulo y precio mono en menta; nota al pie; CTA.
// La promoción (nombre, hora de fin, cuenta atrás del POS) no está en los datos estándar: sin ella no hay reloj. Lo que sí existe es
// atributos.soloHoy: si hay platos «solo hoy», la cabecera dice «Solo hoy · marca» y la cifra grande es cuántos son; sin ninguno,
// muestra la marca y su lema. La lista es la carta completa (búsqueda y categorías de Waiter encima), con los «solo hoy» primero y
// un filtro «Solo hoy» (aria-pressed) para verlos solos; el subtítulo de la tarjeta es el primer tamaño (atributos.tamanos) o la
// descripción, y no hay hueco si faltan. La nota solo aparece cuando hay platos de hoy. El CTA «Aprovechar 2 × 1» del marco es aquí
// «Ver pedido · total» (orderBarHref, en acento como pide el spec) con el radio 12 del marco del menú (radioBoton 8 es el de carrito
// y pago). El marco no dibuja ＋: va uno de 32 px con borde (44 px de toque).
export function E3Menu({ entry, template, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const te = useTranslations('diner.templates.E3')
  const [onlyToday, setOnlyToday] = useState(false)
  const categories = entry.carta.categorias
  const all = useMenuDishes(categories, query, category)
  const todayCount = useMemo(() => new Set(categories.flatMap((c) => c.productos).filter((d) => d.atributos?.soloHoy).map((d) => d.id)).size, [categories])
  const dishes = useMemo(() => {
    const today = all.filter((d) => d.atributos?.soloHoy)
    return onlyToday ? today : [...today, ...all.filter((d) => !d.atributos?.soloHoy)]
  }, [all, onlyToday])
  const brand = entry.contexto.marca
  const dark = template.tokens.modo === 'oscuro'
  const count = itemCount(cart)
  const amount = formatCop(cart?.total ?? 0)
  const [before, after] = te('cta', { amount }).split(amount)
  const showAll = () => { setQuery(''); setCategory(null); setOnlyToday(false) }
  return (
    <div className="flex flex-col min-h-[60vh] text-t-tinta">
      <header className="px-5 py-5 bg-t-acento text-t-acento-tinta">
        <p className="text-[12px] tracking-[0.16em] uppercase opacity-85">{todayCount > 0 ? te('todayKicker', { name: brand.nombre }) : brand.lema || te('menuKicker')}</p>
        {todayCount > 0
          ? <p className="flex items-baseline gap-2.5 mt-1.5"><span className="font-t-mono tabular text-[42px] leading-none">{todayCount}</span><span className="text-[15px] opacity-90">{te('todayCount', { n: todayCount })}</span></p>
          : <h1 className="t-title text-[28px] leading-none mt-1.5">{brand.nombre}</h1>}
        {todayCount > 0 && <h1 className="sr-only">{brand.nombre}</h1>}
      </header>
      <div className="px-5 pt-4 flex flex-col gap-2.5">
        <MenuSearch query={query} setQuery={setQuery} />
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {todayCount > 0 && <button type="button" aria-pressed={onlyToday} onClick={() => setOnlyToday((s) => !s)} className={`shrink-0 h-[44px] px-3.5 rounded-t-chip text-[14px] font-medium whitespace-nowrap ${onlyToday ? 'bg-t-acento text-t-acento-tinta' : 'bg-t-superficie border border-t-borde text-t-tinta'}`}>{te('todayFilter')}</button>}
          <CategoryTabs categories={categories} category={category} setCategory={setCategory} className="pb-0 [&>button]:h-[44px] [&>button]:text-[14px]" />
        </div>
      </div>
      {entry.carta.imagenesDeReferencia && <p className="px-5 pt-3 text-[13px] text-t-tinta-suave">{t('menu.referenceImages')}</p>}
      <section role="tabpanel" aria-labelledby={tabId(category)} className="flex-1 px-5 py-4 flex flex-col gap-[11px]">
        {dishes.length === 0
          ? <EmptyMenu query={query} category={category} onShowAll={showAll} />
          : <ul className="flex flex-col gap-[11px]">{dishes.map((d) => <Card key={d.id} dish={d} dark={dark} onOpen={onOpen} onAdd={onAdd} />)}</ul>}
        {todayCount > 0 && <p className="mt-auto px-3.5 py-3 rounded-[10px] bg-t-superficie text-[13px] leading-[1.45] text-t-tinta-terciaria">{te('todayNote')}</p>}
      </section>
      <div data-testid="frame-order-bar" className="sticky bottom-0 z-30 px-5 py-3.5 border-t border-t-borde bg-t-fondo">
        {count > 0
          ? <Link href={orderBarHref} className="h-[56px] rounded-[12px] bg-t-acento text-t-acento-tinta text-[16px] font-bold flex items-center justify-center gap-1">{before}<span className="font-t-mono tabular">{amount}</span>{after}</Link>
          : <button type="button" disabled className="w-full h-[56px] rounded-[12px] bg-t-acento text-t-acento-tinta text-[16px] font-bold disabled:opacity-60">{te('ctaEmpty')}</button>}
      </div>
    </div>
  )
}

// Tarjeta: nombre, subtítulo (primer tamaño o descripción), chip «Solo hoy» si aplica, precio en menta (color fijo del marco) y ＋.
// Agotado: el contenido al 55 % una sola vez y «Agotado» legible en el sitio del ＋.
function Card({ dish, dark, onOpen, onAdd }: { dish: Dish; dark: boolean; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void }) {
  const tf = useTranslations('diner.templates.familiaE')
  const size = dish.atributos?.tamanos?.[0]
  const sub = size ? `${size.nombre} · ${formatCop(size.precio)}` : dish.descripcion
  return (
    <li className="rounded-t-tarjeta bg-t-superficie pl-3.5 pr-1.5 py-2 flex items-center gap-2">
      <button type="button" onClick={() => onOpen(dish)} className={`flex-1 min-w-0 min-h-[44px] py-1 flex items-center justify-between gap-3 text-left ${dish.agotado ? 'opacity-55' : ''}`}>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="flex items-center gap-2">
            <span className="text-[16px] font-medium leading-snug">{dish.nombre}</span>
            {dish.atributos?.soloHoy && <span className="inline-flex items-center h-[20px] px-1.5 rounded-t-chip bg-t-acento-suave text-[11px] font-medium">{tf('todayOnly')}</span>}
          </span>
          {sub && <span className="text-[13px] text-t-tinta-suave truncate">{sub}</span>}
        </span>
        <span className="font-t-mono tabular text-[16px] text-[#A9E0C0] whitespace-nowrap">{formatCop(dish.precio)}</span>
      </button>
      {dish.agotado ? <SoldOut dark={dark} className="pr-2" /> : <AddButton dish={dish} onAdd={onAdd} />}
    </li>
  )
}
