'use client'

import { useTranslations } from 'next-intl'

import { AddButton, DarkOrderBar, DishPhoto, MenuEmpty, ReferenceNote, SearchField, TabRow } from '@/components/templates/families/D/parts'
import { tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { Dish } from '@/lib/types'

// D5 · Desayuno con horario (docs/diseno/plantillas/D5). Tabs de franja de ancho igual (las categorías: la activa en acento, las
// demás con borde); banda sobre acentoSuave; filas de 84 px con miniatura 56×56 (recorte 1x1, radio 12), nombre 16/500,
// descripción 13 y precio mono; barra oscura al pie «N ítems · total / Ver pedido →» (barra de pedido del marco). Las
// categorías no traen horario: no hay tab «apagada» ni cuenta atrás, y la banda lleva el buscador de Waiter con el mismo trazo.
// Un producto agotado va al 50 % (una sola vez, la fila entera) con «Vuelve mañana» en rojo en lugar de la descripción y sin ＋,
// exactamente como el marco: ese aviso es su insignia, no se añade otra.
export function D5Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const td = useTranslations('diner.templates.D5')
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  // Tabs de ancho igual siempre: rejilla de columnas iguales que salta de fila cuando no caben más (4+ categorías), en vez de
  // un scroll que recortaba la última. Los nombres largos se cortan con elipsis dentro de su columna, no fuera de la pantalla.
  // Bloque con line-height fijo (no grid/flex): solo así el texto recortado muestra la elipsis. La activa lleva borde del acento
  // para medir igual que las demás.
  const chip = (active: boolean) => `block min-w-0 h-11 px-3 rounded-t-chip border text-[14px] leading-[42px] text-center whitespace-nowrap overflow-hidden text-ellipsis ${active ? 'bg-t-acento border-t-acento text-t-acento-tinta font-medium' : 'border-t-borde text-t-tinta-suave'}`
  return (
    <div className="flex flex-col text-t-tinta">
      <TabRow categories={categories} category={category} setCategory={setCategory} chip={chip} className="px-5 py-4 border-b border-t-borde grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-1.5" />
      <div className="px-5 py-3 bg-t-acento-suave border-b border-t-borde">
        <SearchField query={query} setQuery={setQuery} className="h-10 w-full rounded-t-chip bg-t-fondo border border-t-borde px-4 text-[14px] text-t-tinta placeholder:text-t-tinta-terciaria" />
      </div>
      <ReferenceNote show={entry.carta.imagenesDeReferencia} className="px-5 pt-3" />
      <section role="tabpanel" aria-labelledby={tabId(category)} className="flex flex-col">
        {dishes.length === 0
          ? <MenuEmpty query={query} category={category} setQuery={setQuery} setCategory={setCategory} button="h-11 px-[18px] rounded-t-boton bg-t-superficie border border-t-borde text-[15px] font-medium text-t-tinta" />
          : dishes.map((d) => <Row key={d.id} dish={d} onOpen={onOpen} onAdd={onAdd} tomorrow={td('tomorrow')} />)}
      </section>
      <DarkOrderBar cart={cart} href={orderBarHref} />
    </div>
  )
}

// Fila de 84 px: miniatura, nombre + descripción (o «Vuelve mañana» si está agotado), precio mono y ＋. Toda la fila abre el plato.
function Row({ dish, onOpen, onAdd, tomorrow }: { dish: Dish; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void; tomorrow: string }) {
  return (
    <article className={`px-5 py-3.5 flex items-center gap-3 border-b border-t-borde ${dish.agotado ? 'opacity-50' : ''}`}>
      <button type="button" onClick={() => onOpen(dish)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <DishPhoto dish={dish} className="w-14 h-14 rounded-[12px]" />
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-[16px] font-medium leading-snug">{dish.nombre}</span>
          {dish.agotado
            ? <span className="text-[13px] text-busy-ink">{tomorrow}</span>
            : dish.descripcion && <span className="text-[13px] text-t-tinta-suave leading-snug line-clamp-1">{dish.descripcion}</span>}
        </span>
        <span className="font-t-mono tabular text-[15px] shrink-0">{formatCop(dish.precio)}</span>
      </button>
      {!dish.agotado && <AddButton dish={dish} onAdd={onAdd} className="-mr-2" circle="w-[30px] h-[30px] rounded-full bg-t-acento text-t-acento-tinta text-[16px]" />}
    </article>
  )
}
