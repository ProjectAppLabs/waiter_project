'use client'

import { useTranslations } from 'next-intl'

import { EditorialDish, EmptyMenu, OrderStrip, SearchToggle, filterSections } from '@/components/templates/families/A/shared'
import { tabId } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'

// A5 · Índice de dos columnas (docs/diseno/plantillas/A5). Portada: «La carta» en serif 24 + «Toca una sección para abrirla», rejilla de dos
// columnas con tarjetas de sección de 92 px (nombre en serif 19, «N platos» en mono 12); la activa en tinta (#1A1815, no el acento: en A5 el
// acento es el dorado) con el nombre en el color del fondo y el conteo en dorado (acento), como el bloque tarjetaSeccionActiva del spec.
// El marco no dibuja la lista de platos ni la barra de pedido: al abrir una sección la portada se pliega a «← La carta» + la tarjeta activa y
// debajo va la lista editorial (misma fila que A1: serif, descripción, precio mono, ＋ hueco); la búsqueda plegada de la cabecera lista las
// coincidencias de toda la carta. pieNota (horario de cocina, servicio sugerido) no existe en los datos de la sede: se omite; el pie lleva la
// barra de pedido discreta cuando hay algo pedido. Los ＋ llaman onAdd y las filas onOpen.
export function A5Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const categories = entry.carta.categorias
  const active = categories.find((c) => c.id === category) ?? null
  const searching = query.trim() !== ''
  const sections = searching || active ? filterSections(categories, active ? active.id : null, query) : []
  const card = (c: (typeof categories)[number], selected: boolean) => (
    <button key={c.id} type="button" role="tab" id={tabId(c.id)} aria-selected={selected} onClick={() => setCategory(selected ? null : c.id)}
      className={`h-[92px] rounded-t-tarjeta p-3.5 flex flex-col justify-between text-left ${selected ? 'bg-t-tinta' : 'bg-t-superficie border border-t-borde'}`}>
      <span className={`font-t-display text-[19px] leading-tight ${selected ? 'text-t-fondo' : 'text-t-tinta'}`}>{c.nombre}</span>
      <span className={`font-t-mono tabular text-[12px] ${selected ? 'text-t-acento' : 'text-t-tinta-terciaria'}`}>{t('templates.A5.count', { n: c.productos.length })}</span>
    </button>
  )
  return (
    <div className="flex flex-col">
      <header className="px-[22px] pt-[22px] pb-3.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {active
            ? <button type="button" onClick={() => setCategory(null)} className="h-tap-min -ml-1 px-1 flex items-center gap-2 t-title text-[24px] leading-tight text-t-tinta"><span aria-hidden="true" className="text-[18px] text-t-tinta-suave">←</span>{t('templates.A5.back')}</button>
            : <h1 className="t-title text-[24px] leading-tight text-t-tinta">{t('templates.A5.title')}</h1>}
          {!active && <p className="mt-0.5 text-[13px] text-t-tinta-terciaria">{searching ? t('templates.A5.results') : t('templates.A5.subtitle')}</p>}
        </div>
        <SearchToggle query={query} setQuery={setQuery} className="min-w-0 max-w-[60%]" />
      </header>
      {!searching && (
        <div role="tablist" aria-label={t('templates.familiaA.sections')} className="px-[22px] grid grid-cols-2 gap-2.5">
          {active ? card(active, true) : categories.map((c) => card(c, false))}
        </div>
      )}
      {(searching || active) && (
        <section role="tabpanel" aria-labelledby={active ? tabId(active.id) : undefined} aria-label={active ? undefined : t('templates.A5.results')} className="px-[22px] pt-5 pb-4 flex flex-col gap-[18px]">
          {sections.length === 0
            ? <EmptyMenu query={query} category={category} setQuery={setQuery} setCategory={setCategory} />
            : sections.map((c) => (
              <div key={c.id} className="flex flex-col gap-[18px]">
                {(searching || !active) && <h2 className="text-[11px] tracking-[0.2em] uppercase text-t-tinta-terciaria">{c.nombre}</h2>}
                <div className="flex flex-col gap-4">{c.productos.map((d) => <EditorialDish key={d.id} dish={d} onOpen={onOpen} onAdd={onAdd} />)}</div>
              </div>
            ))}
        </section>
      )}
      {!searching && !active && categories.length === 0 && <div className="px-[22px]"><EmptyMenu query={query} category={category} setQuery={setQuery} setCategory={setCategory} /></div>}
      <OrderStrip cart={cart} href={orderBarHref} variant="line" />
    </div>
  )
}
