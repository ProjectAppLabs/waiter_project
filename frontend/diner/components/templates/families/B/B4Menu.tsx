'use client'

import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { fold } from '@/components/templates/generic/menuParts'
import type { MenuLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { Category, Dish } from '@/lib/types'

// Día de la semana del reloj del comensal, en español y minúsculas («martes»), como el marco.
export const weekday = (date = new Date()) => new Intl.DateTimeFormat('es-CO', { weekday: 'long', timeZone: 'America/Bogota' }).format(date)

// B4 · Menú del día (docs/diseno/plantillas/B4): pizarra verde oscura (tokens en modo oscuro), «Hoy, martes», título grande y pasos
// (una categoría = un paso) escritos como UNA línea de 17 px con las opciones separadas por « · », como el marco («Ajiaco · Crema de
// auyama»); CTA crema «Armar mi menú». No hay menú del día con precio único en la carta (menuDelDia.nombre/precio ni atributos.recargo):
// el título es fijo, el precio único se omite y cada opción lleva su precio en mono de 14 px donde el marco pone el recargo. Elegir una
// opción por paso es estado del layout: cada opción es un botón en línea (aria-pressed; el relleno vertical le da 44 px de toque sin
// engordar la línea), la elegida va en negrita subrayada en acento, y el separador viaja pegado a la opción anterior para que nunca
// abra una línea. «Ver plato →» (onOpen de la elegida) va en la fila del rótulo del paso, no en una línea extra. El CTA agrega las
// elegidas (onAdd por cada una). El marco no dibuja cabecera de marca ni barra de pedido: la página tampoco (ownsChrome).
export function B4Menu({ entry, query, category, onOpen, onAdd }: MenuLayoutProps) {
  const t = useTranslations('diner')
  const tb = useTranslations('diner.templates.B4')
  const [picked, setPicked] = useState<Record<number, number | undefined>>({})
  const categories = entry.carta.categorias
  const steps = useMemo(() => {
    const pool = category === null ? categories : categories.filter((c) => c.id === category)
    const needle = fold(query)
    return pool.map((c) => ({ ...c, productos: needle ? c.productos.filter((d) => fold(d.nombre).includes(needle)) : c.productos })).filter((c) => c.productos.length > 0)
  }, [categories, category, query])
  const chosen = steps.map((c) => c.productos.find((d) => d.id === picked[c.id])).filter((d): d is Dish => Boolean(d))
  const toggle = (c: Category, d: Dish) => setPicked((p) => ({ ...p, [c.id]: p[c.id] === d.id ? undefined : d.id }))
  const build = () => { for (const d of chosen) onAdd(d) }
  const emptyText = query ? t('menu.empty') : category === null ? t('menu.emptyMenu') : t('menu.emptyCategory')
  return (
    <div className="flex flex-col min-h-[60vh] text-t-tinta">
      <header className="px-[22px] py-[22px] border-b border-t-borde">
        <p className="text-[11px] tracking-[0.18em] uppercase opacity-70">{tb('today', { day: weekday() })}</p>
        <h1 className="t-title text-[26px] leading-tight mt-1">{tb('title')}</h1>
        <p className="text-[13px] opacity-70 mt-2">{tb('pickOne')}</p>
      </header>
      {entry.carta.imagenesDeReferencia && <p className="px-[22px] pt-3 text-[13px] opacity-70">{t('menu.referenceImages')}</p>}
      <section className="flex-1 px-[22px] py-[18px] flex flex-col gap-4">
        {steps.length === 0 && <p role="status" className="py-6 text-center text-base opacity-80">{emptyText}</p>}
        {steps.map((c) => {
          const sel = c.productos.find((d) => d.id === picked[c.id])
          return (
            <div key={c.id} role="group" aria-label={c.nombre}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[11px] tracking-[0.16em] uppercase opacity-60">{c.nombre}</h2>
                {sel && <button type="button" onClick={() => onOpen(sel)} aria-label={`${tb('seeDish')}: ${sel.nombre}`} className="shrink-0 inline-flex items-center min-h-[44px] -my-3 text-[12px] opacity-80 underline underline-offset-4">{tb('seeDish')}</button>}
              </div>
              <p className="mt-[5px] text-[17px] leading-[1.55]">
                {c.productos.map((d, i) => (
                  <span key={d.id}>
                    <span className="whitespace-nowrap">
                      <Option dish={d} active={sel?.id === d.id} onToggle={() => toggle(c, d)} />
                      {i < c.productos.length - 1 && <span aria-hidden="true" className="opacity-60"> ·</span>}
                    </span>
                    {/* El único punto de corte de la línea es este espacio, fuera del trozo no partible. */}
                    {i < c.productos.length - 1 && ' '}
                  </span>
                ))}
              </p>
            </div>
          )
        })}
      </section>
      <div className="sticky bottom-0 z-30 px-[22px] py-4 bg-t-fondo border-t border-t-borde">
        <button type="button" disabled={chosen.length === 0} onClick={build} className="w-full h-[56px] rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold disabled:opacity-60">
          {chosen.length === 0 ? tb('build') : tb('buildCount', { n: chosen.length })}
        </button>
      </div>
    </div>
  )
}

// Una opción del paso: botón en línea (Chromium lo pinta inline-block: el relleno vertical amplía el toque a 44 px y el margen negativo
// lo descuenta para no engordar la línea de 17 px), precio en mono
// de 14 px; agotado → nombre al 55 % una sola vez e insignia legible sobre acentoSuave, no elegible.
function Option({ dish, active, onToggle }: { dish: Dish; active: boolean; onToggle: () => void }) {
  const t = useTranslations('diner.common')
  return (
    <button type="button" aria-pressed={active} disabled={dish.agotado} onClick={onToggle} className={`inline-block align-baseline py-[9px] -my-[9px] rounded-sm ${active ? 'font-bold underline decoration-2 underline-offset-[5px] decoration-t-acento' : ''}`}>
      <span className={dish.agotado ? 'opacity-55' : ''}>{dish.nombre}</span>
      {' '}
      {dish.agotado
        ? <span className="inline-flex items-center h-[20px] px-1.5 rounded-t-chip bg-t-acento-suave text-t-tinta text-[11px] font-medium align-middle">{t('soldOut')}</span>
        : <span className="font-t-mono tabular text-[14px] opacity-75">{formatCop(dish.precio)}</span>}
    </button>
  )
}
