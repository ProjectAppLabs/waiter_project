'use client'

import { useTranslations } from 'next-intl'

import { CategoryTabs, TemplateDishCard, tabId, useMenuDishes } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'

// Menú genérico (referencia B1 · Rejilla con foto): título en la voz de la plantilla, buscador, píldoras de categoría y rejilla de 2 columnas.
// La barra oscura de pedido la pinta la página (OrderBar); aquí solo se deja sitio abajo.
export function GenericMenu({ entry, query, setQuery, category, setCategory, onOpen, onAdd }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const categories = entry.carta.categorias
  const dishes = useMenuDishes(categories, query, category)
  // Estado vacío honesto: solo habla de búsqueda si el comensal buscó; si no, es la categoría (o la carta entera) la que no tiene platos.
  const emptyText = query ? t('menu.empty') : category === null ? t('menu.emptyMenu') : t('menu.emptyCategory')
  const filtered = query !== '' || category !== null
  const showAll = () => { setQuery(''); setCategory(null) }
  return (
    <div className="flex flex-col gap-4 pt-[22px]">
      <section className="px-[18px] flex flex-col gap-3">
        <h1 className="t-title text-[32px] leading-tight text-t-tinta">{t('menu.title')}</h1>
        <input type="search" aria-label={t('menu.search')} placeholder={t('menu.search')} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" className="h-tap-min w-full rounded-t-boton bg-t-superficie border border-t-borde px-4 text-base text-t-tinta placeholder:text-t-tinta-terciaria" />
      </section>
      <CategoryTabs categories={categories} category={category} setCategory={setCategory} className="px-[18px]" />
      {/* Límite legal: si algún plato lleva foto generada con IA, la carta lo dice una vez, antes de la rejilla. Es de la carta entera, no del filtro. */}
      {entry.carta.imagenesDeReferencia && <p className="px-[18px] text-[13px] text-t-tinta-suave">{t('menu.referenceImages')}</p>}
      <section role="tabpanel" aria-labelledby={tabId(category)} className="px-[18px]">
        {dishes.length === 0
          ? (
            <div className="py-10 flex flex-col items-center gap-4 text-center">
              <p role="status" className="text-base text-t-tinta-suave">{emptyText}</p>
              {filtered && <button type="button" onClick={showAll} className="h-tap-min px-[18px] rounded-t-boton bg-t-superficie border border-t-borde text-[15px] font-medium text-t-tinta">{t('home.seeAll')}</button>}
            </div>
          )
          : <div className="grid grid-cols-2 gap-3">{dishes.map((d) => <TemplateDishCard key={d.id} dish={d} onOpen={onOpen} onAdd={onAdd} />)}</div>}
      </section>
    </div>
  )
}
