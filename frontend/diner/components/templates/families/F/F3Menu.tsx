'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { AddButton, FOrderBar, FTabs, Foot, MenuEmpty, ReferenceNote, SearchField, SearchToggle, useCountLabel } from '@/components/templates/families/F/parts'
import { tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount } from '@/lib/domain/cart'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Cart, Dish } from '@/lib/types'

// F3 · Omakase por tiempos (docs/diseno/plantillas/F3). El marco es una pantalla oscura de seguimiento de un solo menú; el layout
// sigue pintando la carta completa con esa jerarquía: cabecera centrada (antetítulo en versalitas con la sede y la mesa, título
// en la fuente display de la plantilla = la categoría activa, línea dorada en mono = el pedido en curso «$ total · N piezas» o,
// sin pedido, «N platos»), lista de «tiempos» = los platos de la categoría con el círculo de 26 px: los que ya están en el
// pedido van resaltados sobre la superficie con el anillo dorado (el «en curso» del marco), los demás con el anillo fino y los
// agotados atenuados al 55 % con «Agotado» legible al lado. El estado de cocina por tiempo (servido h:mm) no existe en la carta:
// no se inventa. La nota fija «Sin cambios ni sustituciones.» va sin alergias (la cuenta no las trae). El pie conserva la única
// acción del marco, «Llamar al itamae» (llamar al mesero de Waiter, store.call), con la barra de pedido de la familia encima
// cuando hay pedido (la página no pinta la suya). Waiter añade, sin chips que pesen sobre la cabecera, un índice de categorías en
// versalitas con la lupa al final, y el ＋ de 44 px por fila (onAdd).
export function F3Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const tf = useTranslations('diner.templates.familiaF')
  const countLabel = useCountLabel()
  const call = useDinerStore((s) => s.call)
  const [searching, setSearching] = useState(false)
  const [called, setCalled] = useState(false)
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  const title = category === null ? t('menu.title') : categories.find((c) => c.id === category)?.nombre ?? t('menu.title')
  const mesa = entry.contexto.mesa?.numero ?? null
  // Índice de texto (no chips): 12/0.14em en versalitas, la activa subrayada en el acento.
  const chip = (active: boolean) => `h-9 px-1.5 text-[12px] tracking-[0.14em] uppercase border-b-2 ${active ? 'border-t-acento text-t-acento font-medium' : 'border-transparent text-t-tinta-suave'}`
  const onCall = async () => { if (await call()) setCalled(true) }
  return (
    <div className="flex flex-col text-t-tinta">
      <header className="px-5 pt-[22px] pb-4 border-b border-t-borde text-center">
        <p className="text-[11px] tracking-[0.22em] uppercase text-t-tinta-suave">{mesa !== null ? tf('omakase.bar', { venue: entry.contexto.sede.nombre, n: mesa }) : entry.contexto.sede.nombre}</p>
        <h1 className="t-title text-[28px] leading-tight mt-1.5">{title}</h1>
        <p className="font-t-mono tabular text-[15px] text-t-acento mt-1.5">
          {itemCount(cart) > 0 ? `$ ${formatCop(cart?.total ?? 0)} · ${countLabel(cart, entry.carta)}` : tf('omakase.courses', { n: dishes.length })}
        </p>
      </header>
      <div className="px-5 pt-1.5 flex items-center gap-2">
        <FTabs categories={categories} category={category} setCategory={setCategory} chip={chip} className="flex-1 min-w-0 gap-3" />
        <SearchToggle open={searching} setOpen={setSearching} className="rounded-t-chip text-t-tinta-suave" />
      </div>
      {searching && <div className="px-5 pt-2"><SearchField query={query} setQuery={setQuery} /></div>}
      <ReferenceNote menu={entry.carta} />
      <section role="tabpanel" aria-labelledby={tabId(category)} className="px-5 py-[18px] flex flex-col gap-[13px]">
        {dishes.length === 0
          ? <MenuEmpty query={query} category={category} setQuery={setQuery} setCategory={setCategory} />
          : dishes.map((d) => <Course key={d.id} dish={d} cart={cart} onOpen={onOpen} onAdd={onAdd} />)}
        <p className="mt-2 px-3.5 py-3 rounded-[10px] bg-t-superficie text-[13px] leading-[1.45] text-t-tinta-terciaria">{tf('omakase.noChanges')}</p>
      </section>
      <Foot>
        <FOrderBar cart={cart} menu={entry.carta} href={orderBarHref} />
        <div className="px-5 py-3.5 border-t border-t-borde flex flex-col gap-2">
          <button type="button" onClick={() => void onCall()} className="h-[52px] rounded-t-boton border border-t-borde text-[15px] text-t-tinta">{tf('omakase.call')}</button>
          {called && <p role="status" className="text-center text-[14px] text-t-tinta-suave">{t('home.called')}</p>}
        </div>
      </Foot>
    </div>
  )
}

function Course({ dish, cart, onOpen, onAdd }: { dish: Dish; cart: Cart | null; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void }) {
  const tf = useTranslations('diner.templates.familiaF')
  const qty = cart?.lineas.filter((l) => l.producto_id === dish.id).reduce((a, l) => a + l.cantidad, 0) ?? 0
  const inCart = qty > 0
  const ring = inCart ? 'border-2 border-t-acento' : 'border border-t-borde'
  return (
    <div className={`flex items-center gap-3 ${inCart ? 'p-3 -mx-3 rounded-t-tarjeta bg-t-superficie' : ''}`}>
      {/* Agotado: se atenúa el tiempo (una sola vez) y la insignia «Agotado» del AddButton queda legible fuera. */}
      <button type="button" onClick={() => onOpen(dish)} className={`flex-1 min-w-0 flex items-center gap-3 text-left min-h-11 ${dish.agotado ? 'opacity-55' : ''}`}>
        <span aria-hidden="true" className={`w-[26px] h-[26px] rounded-full shrink-0 ${ring}`} />
        <span className="flex-1 min-w-0 flex flex-col">
          <span className={`text-[15px] truncate ${inCart ? 'font-medium' : ''}`}>{dish.nombre}</span>
          {inCart
            ? <span className="text-[13px] text-t-acento">{tf('omakase.inOrder', { n: qty })}</span>
            : dish.descripcion ? <span className="text-[13px] text-t-tinta-suave truncate">{dish.descripcion}</span> : null}
        </span>
        <span className="font-t-mono tabular text-[15px] shrink-0">{formatCop(dish.precio)}</span>
      </button>
      <AddButton dish={dish} onAdd={onAdd} circle="w-[30px] h-[30px] rounded-full border border-t-acento text-t-acento text-[16px]" />
    </div>
  )
}
