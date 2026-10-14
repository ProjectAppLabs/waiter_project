'use client'

import { useTranslations } from 'next-intl'

import { EditorialDish, EditorialTabs, EmptyMenu, OrderStrip, SearchToggle, filterSections } from '@/components/templates/families/A/shared'
import { tabId } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'

// A1 · Carta editorial (docs/diseno/plantillas/A1). Bloques del spec, en orden: cabecera centrada (marca.nombre o logo + «lema · Mesa N»),
// cuerpo en una columna sin fotos con rótulos de categoría centrados en versalitas, plato = nombre en serif 21 / descripción larga / precio
// mono discreto, y la barra «Tu pedido» + píldora «Ver · N». La cabecera y la barra son las del marco y las únicas en pantalla: la página no
// pinta su BrandHeader ni su OrderBar sobre un layout registrado (ownsChrome). Waiter: el filtro es un índice de categorías en versalitas y la
// búsqueda va plegada en «Buscar», ambos bajo el subtítulo (el marco no dibuja ninguno). El marco no tiene ＋: tocar la fila abre el plato
// (onOpen) y un ＋ hueco de 32 px (48 de toque) junto al precio lo agrega (onAdd). A1 no declara atributos opcionales: no se pintan.
export function A1Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const brand = entry.contexto.marca
  const table = entry.contexto.mesa?.numero ?? null
  const subtitle = [brand.lema, table !== null ? t('common.table', { n: table }) : null].filter(Boolean).join(' · ')
  const sections = filterSections(entry.carta.categorias, category, query)
  return (
    <div className="flex flex-col">
      <header className="px-6 pt-[26px] pb-[18px] border-b border-t-borde flex flex-col items-center text-center">
        {brand.logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={brand.logo} alt={brand.nombre} className="h-9 w-auto object-contain" />
          : <h1 className="t-title text-[27px] leading-[1.1] text-t-tinta">{brand.nombre}</h1>}
        {subtitle && <p className="mt-1 text-[10px] tracking-[0.24em] uppercase text-t-tinta-terciaria">{subtitle}</p>}
        <div className="mt-3 w-full flex items-center justify-center gap-1">
          <EditorialTabs categories={entry.carta.categorias} category={category} setCategory={setCategory} className="min-w-0 justify-start" />
          <SearchToggle query={query} setQuery={setQuery} className="min-w-0" />
        </div>
      </header>
      <section role="tabpanel" aria-labelledby={tabId(category)} className="px-6 py-5 flex flex-col gap-[18px]">
        {sections.length === 0
          ? <EmptyMenu query={query} category={category} setQuery={setQuery} setCategory={setCategory} />
          : sections.map((c) => (
            <div key={c.id} className="flex flex-col gap-[18px]">
              <h2 className="text-[11px] tracking-[0.2em] uppercase text-t-tinta-terciaria text-center">{c.nombre}</h2>
              <div className="flex flex-col gap-4">{c.productos.map((d) => <EditorialDish key={d.id} dish={d} onOpen={onOpen} onAdd={onAdd} />)}</div>
            </div>
          ))}
      </section>
      <OrderStrip cart={cart} href={orderBarHref} variant="pill" />
    </div>
  )
}
