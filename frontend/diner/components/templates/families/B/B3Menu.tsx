'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { DishMeta, GOLD_BG, Photo, Pills } from '@/components/templates/families/B/parts'
import { fold, tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop, recommended } from '@/lib/domain/cart'
import type { Category, Dish } from '@/lib/types'

export const GROUPS = [2, 4, 6, 8] as const
const SHARING = /compart|bandeja|picada|tabla|grupo|familiar/i

// B3 · Para compartir (docs/diseno/plantillas/B3): selector «¿Cuántos son?» (2 / 4 / 6 / 8+, activo en acento), tarjeta destacada con
// borde de 2 px, foto de 96 px, nombre, precio, descripción y «N por persona» en mono verde; tarjetas secundarias sin foto; CTA dorado
// «Añadir bandeja · precio» (dorado fijo de la familia con tinta oscura, no el acento). Los atributos personas/ahorro no existen en la
// carta: el tamaño del grupo es estado del layout, «por persona» es precio ÷ grupo (solo en categorías para compartir) y «ahorras» se
// omite. El marco muestra una sola categoría: aquí se pintan todas (píldoras de categoría; en «Todo», las de compartir van primero).
// Fuera de una categoría para compartir el CTA no habla de bandejas: dice «Añadir {plato} · precio» del destacado visible.
export function B3Menu({ entry, query, category, setCategory, onOpen, onAdd }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const tb = useTranslations('diner.templates.B3')
  const [group, setGroup] = useState<number>(4)
  const categories = entry.carta.categorias
  const ordered = useMemo(() => [...categories].sort((a, b) => Number(SHARING.test(b.nombre)) - Number(SHARING.test(a.nombre))), [categories])
  const visible = useMemo(() => {
    const pool = category === null ? ordered : ordered.filter((c) => c.id === category)
    const needle = fold(query)
    return pool.map((c) => ({ ...c, productos: needle ? c.productos.filter((d) => fold(d.nombre).includes(needle)) : c.productos })).filter((c) => c.productos.length > 0)
  }, [ordered, category, query])
  const dishes = useMenuDishes(categories, query, category)
  const featured = visible[0] ? recommended(visible[0].productos, 1)[0] ?? visible[0].productos[0] : undefined
  const featuredSharing = visible[0] ? SHARING.test(visible[0].nombre) : false
  const emptyText = query ? t('menu.empty') : category === null ? t('menu.emptyMenu') : t('menu.emptyCategory')
  return (
    <div className="flex flex-col min-h-[60vh]">
      <header className="px-[18px] py-[18px] border-b border-t-borde">
        <h1 className="t-title text-[20px] leading-tight text-t-tinta">{tb('howMany')}</h1>
        <div role="group" aria-label={tb('groupLabel')} className="flex gap-2 mt-3">
          {GROUPS.map((g) => {
            const active = group === g
            return <button key={g} type="button" aria-pressed={active} onClick={() => setGroup(g)} className={`flex-1 h-[48px] rounded-[10px] text-[16px] ${active ? 'bg-t-acento text-t-acento-tinta font-bold' : 'border border-t-borde text-t-tinta'}`}>{g === 8 ? '8+' : g}</button>
          })}
        </div>
        <Pills categories={categories} category={category} setCategory={setCategory} className="mt-3" />
      </header>
      {entry.carta.imagenesDeReferencia && <p className="px-[18px] pt-3 text-[13px] text-t-tinta-suave">{t('menu.referenceImages')}</p>}
      <section role="tabpanel" aria-labelledby={tabId(category)} className="flex-1 px-[18px] py-4 flex flex-col gap-4">
        {dishes.length === 0 && <p role="status" className="py-6 text-center text-base text-t-tinta-suave">{emptyText}</p>}
        {visible.map((c) => <Block key={c.id} category={c} group={group} multi={visible.length > 1} onOpen={onOpen} />)}
      </section>
      <div className="sticky bottom-0 z-30 px-[18px] py-3.5 bg-t-fondo border-t border-t-borde">
        {featured && !featured.agotado
          ? (
            <button type="button" aria-label={featuredSharing ? tb('addTrayNamed', { name: featured.nombre }) : tb('addDishNamed', { name: featured.nombre })} onClick={() => onAdd(featured)} className={`w-full h-[56px] px-4 rounded-t-boton text-[16px] font-bold truncate ${GOLD_BG}`}>
              {featuredSharing ? tb('addTray', { amount: formatCop(featured.precio) }) : tb('addDish', { name: featured.nombre, amount: formatCop(featured.precio) })}
            </button>
          )
          : <p role="status" className="text-center text-[15px] text-t-tinta-suave">{t('menu.emptyMenu')}</p>}
      </div>
    </div>
  )
}

// Un bloque por categoría: la recomendada (favorito primero, nunca agotada) como tarjeta destacada y el resto como tarjetas secundarias.
function Block({ category, group, multi, onOpen }: { category: Category; group: number; multi: boolean; onOpen: (d: Dish) => void }) {
  const tb = useTranslations('diner.templates.B3')
  const tc = useTranslations('diner.common')
  const sharing = SHARING.test(category.nombre)
  const star = recommended(category.productos, 1)[0] ?? category.productos[0]
  const rest = category.productos.filter((d) => d.id !== star.id)
  return (
    <div className="flex flex-col gap-3">
      {multi && <h2 className="text-[11px] tracking-[0.16em] uppercase font-medium text-t-tinta-terciaria">{category.nombre}</h2>}
      <article className="border-2 border-t-acento rounded-t-tarjeta overflow-hidden">
        <button type="button" onClick={() => onOpen(star)} className="w-full text-left">
          <Photo dish={star} className="h-[96px] w-full" placeholder={tb('photo')} />
          <div className="px-[15px] py-[13px] flex flex-col">
            <div className="flex justify-between items-baseline gap-3">
              <span className={`t-title text-[17px] leading-tight text-t-tinta ${star.agotado ? 'opacity-55' : ''}`}>{star.nombre}</span>
              <span className="font-t-mono tabular text-[16px] text-t-tinta whitespace-nowrap">{formatCop(star.precio)}</span>
            </div>
            {star.descripcion && <span className="text-[14px] leading-[1.45] text-t-tinta-suave mt-1">{star.descripcion}</span>}
            <DishMeta dish={star} allergens className="mt-1" />
            {sharing && <span className="font-t-mono tabular text-[13px] text-free-ink mt-1.5">{tb('perPerson', { amount: formatCop(star.precio / group) })} · {tb('featured', { n: group === 8 ? '8+' : group })}</span>}
          </div>
        </button>
      </article>
      {rest.map((d) => (
        <button key={d.id} type="button" onClick={() => onOpen(d)} className="w-full text-left border border-t-borde rounded-t-tarjeta px-[15px] py-[13px] flex justify-between items-center gap-3 min-h-[56px]">
          <span className="flex flex-col min-w-0">
            <span className={`text-[16px] font-medium leading-snug text-t-tinta ${d.agotado ? 'opacity-55' : ''}`}>{d.nombre}</span>
            {d.descripcion ? <span className="text-[13px] text-t-tinta-suave truncate">{d.descripcion}</span> : <DishMeta dish={d} />}
            {d.agotado && <span className="text-[12px] font-medium text-busy-ink">{tc('soldOut')}</span>}
          </span>
          <span className="font-t-mono tabular text-[15px] text-t-tinta whitespace-nowrap">{formatCop(d.precio)}</span>
        </button>
      ))}
    </div>
  )
}
