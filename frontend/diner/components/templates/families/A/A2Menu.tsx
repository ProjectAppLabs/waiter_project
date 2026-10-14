'use client'

import { useTranslations } from 'next-intl'

import { EditorialTabs, EmptyMenu, OrderStrip, SearchToggle, SoldOutBadge, dimIf } from '@/components/templates/families/A/shared'
import { fold, tabId } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'

// A2 · Menú degustación por pasos (docs/diseno/plantillas/A2). Mapeo del spec: la categoría elegida es el menú (antetítulo = categoria.nombre),
// su primer producto da el nombre y el precio «por persona», y los demás productos son los pasos numerados (01, 02…). Un paso agotado va al
// 55 %. La carta completa sigue disponible: las otras categorías son pestañas en versalitas («Todo» no aplica: un menú a la vez, sin categoría
// se toma la primera) y la búsqueda plegada filtra los pasos. Tocar un paso abre el plato (onOpen); «Reservar el menú» = onAdd(producto-menú).
// atributos.maridaje no existe en el contrato 2: la línea «Maridaje: …» se omite. El marco no dibuja barra de pedido: se añade la línea
// discreta «Tu pedido · N · $» bajo el CTA cuando hay algo pedido.
export function A2Menu({ entry, query, setQuery, category, setCategory, onOpen, onAdd, cart, orderBarHref }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const categories = entry.carta.categorias
  const current = categories.find((c) => c.id === category) ?? categories[0]
  const needle = fold(query)
  const menu = current?.productos[0]
  const steps = (current?.productos.slice(1) ?? []).filter((d) => !needle || fold(d.nombre).includes(needle))
  return (
    <div className="flex flex-col">
      {categories.length > 1 && (
        <div className="px-6 pt-4 flex items-center gap-1 border-b border-t-borde">
          <EditorialTabs categories={categories} category={current?.id ?? null} setCategory={setCategory} all={false} className="min-w-0" />
          <SearchToggle query={query} setQuery={setQuery} className="min-w-0 ml-auto" />
        </div>
      )}
      {!current || !menu
        ? <div className="px-6"><EmptyMenu query={query} category={category} setQuery={setQuery} setCategory={setCategory} /></div>
        : (
          <>
            <header className="px-6 py-6 border-b border-t-borde">
              <p className="text-[10px] tracking-[0.22em] uppercase text-t-tinta-suave">{current.nombre}</p>
              <button type="button" onClick={() => onOpen(menu)} className={`block text-left t-title text-[30px] leading-[1.1] text-t-tinta mt-1.5 ${menu.agotado ? 'opacity-55' : ''}`}>
                <h1>{menu.nombre}</h1>
              </button>
              <p className="mt-2 font-t-mono tabular text-[15px] text-t-acento">$ {formatCop(menu.precio)} {t('templates.A2.perPerson')}</p>
              {menu.descripcion && <p className="mt-2 text-[14px] leading-[1.45] text-t-tinta-suave">{menu.descripcion}</p>}
              {categories.length === 1 && <SearchToggle query={query} setQuery={setQuery} className="mt-2 -ml-2" />}
            </header>
            <section role="tabpanel" aria-labelledby={tabId(current.id)} className="px-6 py-[18px] flex flex-col gap-3.5">
              {steps.length === 0
                ? <p role="status" className="text-[14px] text-t-tinta-suave">{query ? t('menu.empty') : t('templates.A2.noSteps')}</p>
                : (
                  <ol aria-label={t('templates.A2.steps')} className="flex flex-col gap-3.5">
                    {steps.map((d, i) => (
                      <li key={d.id} className="flex gap-3.5 items-start">
                        {/* Paso agotado: número y texto al 55 % (una sola vez); la insignia va fuera del botón atenuado para seguir legible. */}
                        <button type="button" onClick={() => onOpen(d)} className={`min-w-0 flex-1 text-left flex gap-3.5 items-start min-h-tap-min py-1 ${dimIf(d)}`}>
                          <span aria-hidden="true" className="w-[18px] shrink-0 font-t-mono text-[13px] leading-[1.6] text-t-acento">{String(i + 1).padStart(2, '0')}</span>
                          <span className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-[16px] font-medium leading-snug text-t-tinta">{d.nombre}</span>
                            {d.descripcion && <span className="text-[13px] text-t-tinta-suave">{d.descripcion}</span>}
                          </span>
                        </button>
                        {d.agotado && <SoldOutBadge className="shrink-0 mt-1.5" />}
                      </li>
                    ))}
                  </ol>
                )}
              <p className="px-3.5 py-3 rounded-t-tarjeta bg-t-superficie text-[13px] leading-[1.45] text-t-tinta-terciaria">{t('templates.A2.allergies')}</p>
            </section>
            <div className="px-6 py-4 border-t border-t-borde">
              <button type="button" disabled={menu.agotado} onClick={() => onAdd(menu)} className="w-full h-[52px] rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold disabled:opacity-60">
                {menu.agotado ? t('templates.A2.reserveSoldOut') : t('templates.A2.reserve')}
              </button>
            </div>
          </>
        )}
      <OrderStrip cart={cart} href={orderBarHref} variant="line" />
    </div>
  )
}
