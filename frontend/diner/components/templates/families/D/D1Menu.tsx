'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Fragment, useMemo } from 'react'

import { AddButton, MenuEmpty, ReferenceNote, SearchField, SoldOutBadge } from '@/components/templates/families/D/parts'
import { CategoryTabs, tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount } from '@/lib/domain/cart'
import type { Dish } from '@/lib/types'

// D1 · Pizarra de café (docs/diseno/plantillas/D1). Pizarra oscura: cabecera del marco con la marca en serif (o su logo) y, a la
// derecha, la mesa en versalitas (la ventana horaria de la sede no existe en los datos: se usa la mesa; sin mesa, «Domicilio»);
// lista de barra por categoría con guía de puntos entre nombre y precio mono; botón crema «Pedir en la barra» pegado al pie (es
// la barra de pedido del marco: la página no pinta la suya sobre este layout). Sin fotos ni descripciones (spec.fotos = ninguna).
// La nota rotativa («Grano de la semana») se omite: la sede no la manda. Búsqueda y pestañas de Waiter van bajo la cabecera con
// el mismo trazo translúcido; el ＋ es un aro fino junto al precio.
export function D1Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const td = useTranslations('diner.templates.D1')
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  // Secciones de la pizarra: en «Todo», cada categoría con los platos que pasan el filtro (un plato en dos categorías sale una vez).
  const sections = useMemo(() => {
    const visible = new Set(dishes.map((d) => d.id))
    const seen = new Set<number>()
    return categories
      .filter((c) => category === null || c.id === category)
      .map((c) => ({ id: c.id, nombre: c.nombre, productos: c.productos.filter((d) => visible.has(d.id) && !seen.has(d.id) && seen.add(d.id)) }))
      .filter((c) => c.productos.length > 0)
  }, [categories, category, dishes])
  const count = itemCount(cart)
  const brand = entry.contexto.marca
  const table = entry.contexto.mesa?.numero ?? null
  const field = 'h-11 w-full rounded-t-boton bg-t-superficie border border-t-borde px-4 text-[15px] text-t-tinta placeholder:text-t-tinta-terciaria'
  return (
    <div className="flex flex-col text-t-tinta">
      <header className="px-5 py-5 border-b border-t-borde flex items-baseline justify-between gap-3">
        {brand.logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={brand.logo} alt={brand.nombre} className="h-9 w-auto object-contain self-center" />
          : <h1 className="t-title text-[25px] leading-tight truncate">{brand.nombre}</h1>}
        <span className="shrink-0 text-[12px] tracking-[0.14em] uppercase opacity-[0.62]">{table !== null ? t('common.table', { n: table }) : t('common.delivery')}</span>
      </header>
      <div className="px-5 pt-4 flex flex-col gap-3">
        <SearchField query={query} setQuery={setQuery} className={field} />
        <CategoryTabs categories={categories} category={category} setCategory={setCategory} />
        <ReferenceNote show={entry.carta.imagenesDeReferencia} />
      </div>
      <section role="tabpanel" aria-labelledby={tabId(category)} className="px-5 pt-[18px] pb-5 flex flex-col gap-[13px]">
        {sections.length === 0
          ? <MenuEmpty query={query} category={category} setQuery={setQuery} setCategory={setCategory} button="h-11 px-[18px] rounded-t-boton bg-t-superficie border border-t-borde text-[15px] font-medium text-t-tinta" />
          : sections.map((c) => (
            <Fragment key={c.id}>
              <h2 className="text-[11px] tracking-[0.2em] uppercase opacity-55 mt-1.5 first:mt-0">{c.nombre}</h2>
              {c.productos.map((d) => <Row key={d.id} dish={d} onOpen={onOpen} onAdd={onAdd} />)}
            </Fragment>
          ))}
      </section>
      <footer className="sticky bottom-0 z-30 px-5 py-4 border-t border-t-borde bg-t-fondo">
        <Link href={orderBarHref} className="h-[54px] rounded-t-boton bg-t-acento text-t-acento-tinta grid place-items-center text-[16px] font-bold">
          {count > 0 ? td('orderAtBarWith', { amount: formatCop(cart?.total ?? 0) }) : td('orderAtBar')}
        </Link>
      </footer>
    </div>
  )
}

// Fila de barra: nombre 17, guía de puntos, precio mono 16. Toda la fila abre el plato; el aro ＋ agrega. Agotado al 55 % con insignia.
function Row({ dish, onOpen, onAdd }: { dish: Dish; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void }) {
  return (
    <article className={`flex items-baseline gap-2.5 ${dish.agotado ? 'opacity-55' : ''}`}>
      <button type="button" onClick={() => onOpen(dish)} className="flex-1 min-w-0 flex items-baseline gap-2.5 text-left">
        <span className="text-[17px] leading-tight">{dish.nombre}</span>
        <span aria-hidden="true" className="flex-1 border-b border-dotted border-t-tinta/30 translate-y-[-4px]" />
        <span className="font-t-mono tabular text-[16px]">{formatCop(dish.precio)}</span>
      </button>
      {dish.agotado
        ? <SoldOutBadge className="self-center" />
        : <AddButton dish={dish} onAdd={onAdd} className="self-center -my-2 -mr-2" circle="w-7 h-7 rounded-full border border-t-tinta/40 text-t-tinta text-[15px]" />}
    </article>
  )
}
