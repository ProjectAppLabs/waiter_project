'use client'

import { useTranslations } from 'next-intl'

import { formatCop } from '@/lib/domain/cart'
import type { Dish } from '@/lib/types'

// Tarjeta de plato del diseño: foto, nombre, descripción, precio mono y ＋ redondo en el color del restaurante.
export function DishCard({ dish, onOpen, onAdd }: { dish: Dish; onOpen: (d: Dish) => void; onAdd: (d: Dish) => void }) {
  const t = useTranslations('diner')
  return (
    <article className="border border-[#EFE9E0] rounded-rest bg-surface overflow-hidden flex flex-col">
      <button type="button" onClick={() => onOpen(dish)} className="text-left flex-1 flex flex-col">
        {/* Agotado (espec. de imágenes): la foto se queda al 55 % con la insignia encima; el plato no se oculta. */}
        <div className="relative h-[88px] bg-muted grid place-items-center text-[11px] tracking-[0.08em] uppercase text-ink-3 overflow-hidden">
          {dish.foto ? <img src={dish.foto} alt="" className={dish.agotado ? 'w-full h-full object-cover opacity-55' : 'w-full h-full object-cover'} /> : t('home.photo')}
          {dish.agotado && dish.foto && <span data-testid="sold-out-badge" className="absolute top-2 right-2 rounded-full bg-busy-soft px-2 py-0.5 text-[11px] font-medium tracking-[0.04em] normal-case text-busy-ink">{t('common.soldOut')}</span>}
        </div>
        <div className="px-3 pt-2.5 flex flex-col gap-0.5">
          <span className="text-[15px] font-medium leading-snug">{dish.nombre}</span>
          {dish.descripcion && <span className="text-[13px] text-soft leading-snug line-clamp-2">{dish.descripcion}</span>}
        </div>
      </button>
      <div className="px-3 pb-3 pt-2 flex items-center justify-between">
        <span className="font-mono tabular text-[15px]">{formatCop(dish.precio)}</span>
        {dish.agotado
          ? <span className="text-[12px] font-medium text-busy-ink bg-busy-soft rounded-rest px-1">{t('common.soldOut')}</span>
          : (
            // Área de toque de 48px (§03) sin agrandar el dibujo de 34px del mock: el margen negativo la extiende 7px hacia fuera y el pie no crece.
            <button type="button" aria-label={`${t('common.add')}: ${dish.nombre}`} onClick={() => onAdd(dish)} className="w-tap-min h-tap-min -m-[7px] grid place-items-center">
              <span aria-hidden="true" className="w-[34px] h-[34px] rounded-full bg-brand text-brand-ink grid place-items-center text-[17px] leading-none">＋</span>
            </button>
          )}
      </div>
    </article>
  )
}
