'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { AddButton, DarkOrderBar, MenuEmpty, ReferenceNote, SearchField, SoldOutBadge, useDinerAccount, useDishIndex } from '@/components/templates/families/D/parts'
import { CategoryTabs, tabId, unique, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop, recommended } from '@/lib/domain/cart'
import type { AccountOrder, AccountOrderLine, Dish } from '@/lib/types'

export interface UsualOrder { lineas: AccountOrderLine[]; veces: number; vecesEsteMes: number }

const monthOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'America/Bogota' }).format(new Date(iso))
const signature = (lineas: AccountOrderLine[]) => [...lineas].map((l) => `${l.producto_id}×${l.cantidad}`).sort().join('|')

// «Lo de siempre» derivado del historial (cuenta.habitual no existe en el contrato): la combinación de líneas que más veces pidió el
// comensal (empate → la más reciente). Sin pedidos con líneas no hay habitual y la carta se muestra directa.
export function usualOrder(orders: AccountOrder[], now = new Date()): UsualOrder | null {
  const withLines = orders.filter((o) => o.lineas && o.lineas.length > 0)
  if (withLines.length === 0) return null
  const month = monthOf(now.toISOString())
  const groups = new Map<string, { lineas: AccountOrderLine[]; veces: number; vecesEsteMes: number; last: string }>()
  for (const o of withLines) {
    const key = signature(o.lineas ?? [])
    const g = groups.get(key) ?? { lineas: o.lineas ?? [], veces: 0, vecesEsteMes: 0, last: '' }
    g.veces += 1
    if (monthOf(o.fecha) === month) g.vecesEsteMes += 1
    if (o.fecha > g.last) { g.last = o.fecha; g.lineas = o.lineas ?? [] }
    groups.set(key, g)
  }
  const best = Array.from(groups.values()).sort((a, b) => b.veces - a.veces || b.last.localeCompare(a.last))[0]
  return { lineas: best.lineas, veces: best.veces, vecesEsteMes: best.vecesEsteMes }
}

// D4 · Lo de siempre (docs/diseno/plantillas/D4). Cabecera oscura con «Hola de nuevo, {nombre}» en versalitas y «¿Lo de siempre?»;
// tarjeta del pedido habitual (borde acento sobre acentoSuave: nombre compuesto, «Lo pediste N veces este mes.», precio mono y
// «Pedir igual» → onAdd de cada línea); sección «O cambia algo» con dos sugerencias de la carta (favoritos: cuenta.variantes no
// existe) y «Ver toda la carta →» que despliega el listado estándar (búsqueda, pestañas, filas nombre + precio + ＋). Un comensal
// sin cuenta o sin historial cae directo en ese listado, con la marca y su bienvenida en la cabecera. El pie de sellos de
// fidelidad se omite: no hay programa de sellos en los datos. La cuenta se lee del store (la carta no la recibe por props; ver
// useDinerAccount: una sola consulta silenciosa por carga). Sin barra de pedido propia: al pie va la barra oscura de Waiter,
// solo cuando hay algo pedido.
export function D4Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const td = useTranslations('diner.templates.D4')
  const tf = useTranslations('diner.templates.familiaD')
  const { account, orders } = useDinerAccount()
  const index = useDishIndex()
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  const usual = account ? usualOrder(orders) : null
  // Líneas del habitual que siguen en la carta y no están agotadas: solo esas se pueden volver a pedir.
  const usualDishes = (usual?.lineas ?? []).map((l) => ({ line: l, dish: index.get(l.producto_id) ?? null })).filter((x): x is { line: AccountOrderLine; dish: Dish } => x.dish !== null && !x.dish.agotado)
  const hasUsual = usual !== null && usualDishes.length > 0
  const [expanded, setExpanded] = useState(false)
  const showList = !hasUsual || expanded
  const usualName = usualDishes.map(({ line, dish }) => (line.cantidad > 1 ? `${line.cantidad} × ${dish.nombre}` : dish.nombre)).join(' + ')
  const usualPrice = usualDishes.reduce((a, { line, dish }) => a + dish.precio * line.cantidad, 0)
  const reorder = () => { for (const { line, dish } of usualDishes) for (let i = 0; i < line.cantidad; i += 1) onAdd(dish) }
  const variants = recommended(unique(categories.flatMap((c) => c.productos)).filter((d) => !usualDishes.some((u) => u.dish.id === d.id)), 2)
  const brand = entry.contexto.marca
  const label = 'text-[13px] tracking-[0.1em] uppercase text-t-tinta-terciaria font-medium'
  const row = 'flex items-center justify-between gap-3 px-[15px] rounded-t-boton border border-t-borde text-left min-h-12'
  const field = 'h-11 w-full rounded-t-boton bg-t-superficie border border-t-borde px-4 text-[15px] text-t-tinta placeholder:text-t-tinta-terciaria'
  return (
    <div className="flex flex-col text-t-tinta">
      <header className="px-5 py-[22px] bg-dark text-dark-ink">
        <p className="text-[13px] tracking-[0.12em] uppercase text-dark-soft font-medium truncate">{account ? td('greeting', { name: account.nombre }) : brand.nombre}</p>
        <h1 className="t-title text-[24px] leading-tight mt-1.5">{hasUsual ? td('usual') : brand.bienvenida || t('menu.title')}</h1>
      </header>
      {hasUsual && (
        <>
          <section className="px-5 py-[18px] border-b border-t-borde">
            <div className="border-2 border-t-acento rounded-t-tarjeta p-4 bg-t-acento-suave flex flex-col gap-2.5">
              <h2 className="text-[17px] font-bold leading-snug">{usualName}</h2>
              <p className="text-[14px] text-t-tinta-terciaria">{usual.vecesEsteMes > 0 ? td('timesThisMonth', { n: usual.vecesEsteMes }) : td('times', { n: usual.veces })}</p>
              <div className="flex items-center gap-3">
                <span className="font-t-mono tabular text-[19px]">{formatCop(usualPrice)}</span>
                <button type="button" onClick={reorder} className="flex-1 h-[52px] rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold">{td('reorder')}</button>
              </div>
            </div>
          </section>
          <section className="px-5 py-4 flex flex-col gap-2.5">
            <h2 className={label}>{td('change')}</h2>
            {variants.map((d) => (
              <button key={d.id} type="button" onClick={() => onOpen(d)} className={row}>
                <span className="text-[15px]">{d.nombre}</span>
                <span className="font-t-mono tabular text-[14px] text-t-tinta-suave">{formatCop(d.precio)}</span>
              </button>
            ))}
            <button type="button" aria-expanded={expanded} aria-controls="d4-menu" onClick={() => setExpanded((e) => !e)} className={row}>
              <span className="text-[15px]">{expanded ? td('hideAll') : td('seeAll')}</span>
              <span aria-hidden="true" className="text-[14px] text-t-tinta-terciaria">{expanded ? '↑' : '→'}</span>
            </button>
          </section>
        </>
      )}
      {showList && (
        <div id="d4-menu" className="flex flex-col">
          <div className="px-5 pt-4 flex flex-col gap-3">
            {hasUsual && <h2 className={label}>{tf('fullMenu')}</h2>}
            <SearchField query={query} setQuery={setQuery} className={field} />
            <CategoryTabs categories={categories} category={category} setCategory={setCategory} />
            <ReferenceNote show={entry.carta.imagenesDeReferencia} />
          </div>
          <section role="tabpanel" aria-labelledby={tabId(category)} className="px-5 pt-3 pb-4 flex flex-col gap-2.5">
            {dishes.length === 0
              ? <MenuEmpty query={query} category={category} setQuery={setQuery} setCategory={setCategory} button="h-11 px-[18px] rounded-t-boton bg-t-superficie border border-t-borde text-[15px] font-medium text-t-tinta" />
              : dishes.map((d) => (
                <article key={d.id} className={`flex items-center gap-1 pr-1 rounded-t-boton border border-t-borde ${d.agotado ? 'opacity-55' : ''}`}>
                  <button type="button" onClick={() => onOpen(d)} className="flex-1 min-w-0 min-h-12 py-2 pl-[15px] flex items-center justify-between gap-3 text-left">
                    <span className="flex flex-col min-w-0">
                      <span className="text-[15px] leading-snug">{d.nombre}</span>
                      {d.descripcion && <span className="text-[13px] text-t-tinta-suave leading-snug line-clamp-1">{d.descripcion}</span>}
                    </span>
                    <span className="font-t-mono tabular text-[14px] text-t-tinta-suave shrink-0">{formatCop(d.precio)}</span>
                  </button>
                  {d.agotado ? <SoldOutBadge className="mr-2" /> : <AddButton dish={d} onAdd={onAdd} circle="w-[30px] h-[30px] rounded-full bg-t-acento text-t-acento-tinta text-[16px]" />}
                </article>
              ))}
          </section>
        </div>
      )}
      <DarkOrderBar cart={cart} href={orderBarHref} hideWhenEmpty />
    </div>
  )
}
