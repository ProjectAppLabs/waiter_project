'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { AddButton, Avatar, EmptyMenu, MenuSearch, SoldOut, payHrefFrom, useAccount, useAttrParts, useBill, useDinerLabels } from '@/components/templates/families/E/parts'
import { CategoryTabs, tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount } from '@/lib/domain/cart'
import type { CartLine, Dish } from '@/lib/types'

// E4 · Cuenta compartida (docs/diseno/plantillas/E4, la única clara de la familia): arriba la cuenta viva de la mesa como en el marco:
// «Mesa N · P personas», «N ítems en la mesa» y el total mono 20; una fila por comensal con avatar de iniciales (acento para mí;
// cocina / libre alternos para los demás), el resumen de sus líneas «2 IPA · 1 michelada» y su importe mono. Personas, «Dividir en P»
// y la nota «X cada uno» salen de la cuenta del servidor (bill.partes / bill.porParte, la misma que usa el pago), no de un cálculo
// local: si la cuenta no se ha pedido, no hay división que ofrecer (el pago tampoco la tendría) y las personas son los comensales con
// líneas en la mesa. La fila «Para la mesa» del marco no se pinta: toda línea tiene dueño en el carrito (no hay bolsa común). Debajo
// va la carta completa (buscador, categorías, filas con ＋), porque el marco es un resumen y no una lista de platos. Barra pegada
// abajo: «Pagar lo mío» y «Dividir en N» van al pago (…/pago, derivado del enlace al pedido) y «Pagar todo · total» a orderBarHref.
// Ronda y tiempo abierta no existen.
export function E4Menu({ entry, template, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const te = useTranslations('diner.templates.E4')
  const account = useAccount()
  const bill = useBill()
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  const { of } = useDinerLabels(cart, account)
  const table = entry.contexto.mesa?.numero ?? null
  const dark = template.tokens.modo === 'oscuro'
  const count = itemCount(cart)
  // Un grupo por comensal (id real de la línea), conservando el orden de aparición; lo mío primero.
  const groups = useMemo(() => {
    const map = new Map<string, CartLine[]>()
    for (const l of cart?.lineas ?? []) map.set(l.comensal, [...(map.get(l.comensal) ?? []), l])
    return Array.from(map.values()).sort((a, b) => Number(b[0].mio) - Number(a[0].mio))
  }, [cart])
  // Partes y cifra por parte: las del salón (misma fuente que el pago); sin cuenta pedida no se divide.
  const parts = bill?.partes ?? 1
  const people = bill ? bill.partes : groups.length
  const total = cart?.total ?? 0
  const amount = formatCop(total)
  const [before, after] = te('payAll', { amount }).split(amount)
  const payHref = payHrefFrom(orderBarHref)
  const showAll = () => { setQuery(''); setCategory(null) }
  const secondary = 'flex-1 h-[50px] rounded-[10px] border border-t-borde bg-t-fondo text-[15px] font-medium text-t-tinta grid place-items-center'
  return (
    <div className="flex flex-col min-h-[60vh] text-t-tinta">
      <header className="px-5 py-[18px] border-b border-t-borde flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="t-title text-[19px] leading-tight">{table === null ? te('noTable') : people > 0 ? te('tablePeople', { n: table, people }) : te('table', { n: table })}</h1>
          <p className="text-[14px] text-t-tinta-suave">{count > 0 ? te('itemsOpen', { n: count }) : te('nobodyYet')}</p>
        </div>
        <span className="font-t-mono tabular text-[20px] whitespace-nowrap">{formatCop(total)}</span>
      </header>
      {groups.length > 0 && (
        <ul aria-label={te('tablePeople', { n: table ?? 0, people })} className="flex flex-col">
          {groups.map((lines) => {
            const who = of(lines[0])
            const summary = lines.map((l) => `${l.cantidad} ${l.nombre}`).join(' · ')
            const subtotal = lines.reduce((a, l) => a + l.subtotal, 0)
            return (
              <li key={lines[0].comensal} className={`px-5 py-[13px] border-b border-t-borde flex items-center gap-2.5 ${lines[0].mio ? '' : 'bg-t-superficie'}`}>
                <Avatar label={who.label} name={who.name} color={who.color} />
                <span className="flex-1 min-w-0 text-[15px] truncate">{summary}</span>
                <span className="font-t-mono tabular text-[15px] whitespace-nowrap">{formatCop(subtotal)}</span>
              </li>
            )
          })}
        </ul>
      )}
      {bill && parts > 1 && <p className="px-5 py-3.5 text-[14px] text-t-tinta-terciaria border-b border-t-borde">{te('splitNote', { n: parts, amount: formatCop(bill.porParte) })}</p>}
      <div className="px-5 pt-4 flex flex-col gap-2.5">
        <h2 className="t-title text-[17px] leading-tight">{te('menuTitle')}</h2>
        <MenuSearch query={query} setQuery={setQuery} />
        <CategoryTabs categories={categories} category={category} setCategory={setCategory} className="pb-0 [&>button]:h-[44px] [&>button]:text-[14px]" />
      </div>
      {entry.carta.imagenesDeReferencia && <p className="px-5 pt-3 text-[13px] text-t-tinta-suave">{t('menu.referenceImages')}</p>}
      <section role="tabpanel" aria-labelledby={tabId(category)} className="flex-1 pt-2">
        {dishes.length === 0
          ? <EmptyMenu query={query} category={category} onShowAll={showAll} />
          : <ul className="flex flex-col">{dishes.map((d) => <Row key={d.id} dish={d} dark={dark} onOpen={onOpen} onAdd={onAdd} />)}</ul>}
      </section>
      <div data-testid="frame-order-bar" className="sticky bottom-0 z-30 px-5 py-3.5 border-t border-t-borde bg-t-fondo flex flex-col gap-2">
        {count > 0 && (
          <div className="flex gap-2">
            <Link href={payHref} className={secondary}>{te('payMine')}</Link>
            {parts > 1 && <Link href={payHref} className={secondary}>{te('splitIn', { n: parts })}</Link>}
          </div>
        )}
        {count > 0
          ? <Link href={orderBarHref} className="h-[56px] rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold flex items-center justify-center gap-1">{before}<span className="font-t-mono tabular">{amount}</span>{after}</Link>
          : <button type="button" disabled className="h-[56px] rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold disabled:opacity-60">{te('payAllEmpty')}</button>}
      </div>
    </div>
  )
}

// Fila de la carta bajo la cuenta: nombre 15, atributos si existen, precio mono y ＋ (44 px). Tocar la fila abre el plato.
// Agotado: el contenido al 55 % una sola vez y «Agotado» legible en el sitio del ＋.
function Row({ dish, dark, onOpen, onAdd }: { dish: Dish; dark: boolean; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void }) {
  const parts = useAttrParts(dish)
  return (
    <li className="px-5 border-b border-t-borde flex items-center gap-2">
      <button type="button" onClick={() => onOpen(dish)} className={`flex-1 min-w-0 min-h-[56px] py-2.5 flex items-center justify-between gap-3 text-left ${dish.agotado ? 'opacity-55' : ''}`}>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-[15px] leading-snug">{dish.nombre}</span>
          {parts.length > 0 && <span className="text-[12px] text-t-tinta-suave truncate">{parts.join(' · ')}</span>}
        </span>
        <span className="font-t-mono tabular text-[15px] whitespace-nowrap">{formatCop(dish.precio)}</span>
      </button>
      {dish.agotado ? <SoldOut dark={dark} /> : <AddButton dish={dish} onAdd={onAdd} filled className="-mr-1.5" />}
    </li>
  )
}
