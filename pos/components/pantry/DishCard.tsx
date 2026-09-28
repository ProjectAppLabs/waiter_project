'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { LevelBadge } from '@/components/pantry/LevelBadge'
import { dishAvailable, dishServings, type Dish } from '@/lib/domain/pantry'
import { imageUrl } from '@/lib/services/pantry'
import { cn } from '@/lib/utils'

// Tarjeta del "Menu List": foto con badge Disponible, nombre, categoría y pie "Se pueden servir: N" con el nivel.
// `onEdit` (solo administradores) abre la ficha comercial: precio, foto, categoría, mostrarlo u ocultarlo.
// Plan O: `closedHere` es el agotado de este restaurante (el plato sigue en el catálogo de la organización);
// `onToggleHere` (encargado) lo cambia.
export function DishCard({ dish, category, onOpen, onEdit, closedHere = false, onToggleHere }: { dish: Dish; category: string; onOpen: () => void; onEdit?: () => void; closedHere?: boolean; onToggleHere?: () => void }) {
  const t = useTranslations('pantry')
  const available = dishAvailable(dish) && !closedHere
  const servings = dishServings(dish)
  return (
    <div className="relative flex">
    {onEdit && <button type="button" onClick={onEdit} aria-label={t('menuAdmin.edit', { name: dish.name })} title={t('menuAdmin.editShort')}
      className="absolute top-3.5 right-3.5 z-10 w-10 h-10 rounded-full bg-surface text-ink shadow grid place-items-center hover:bg-muted"><Icon name="edit" size={18} /></button>}
    <button type="button" onClick={onOpen} aria-label={t('detail.open', { name: dish.name })} className="flex-1 min-w-0 text-left bg-surface border border-border rounded-md p-1.5 flex flex-col hover:border-primary/40">
      <div className="relative aspect-[230/122] rounded-sm overflow-hidden bg-muted grid place-items-center text-dim">
        {dish.hasImage ? <img src={imageUrl(dish.id)} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <Icon name="photo" size={28} />}
        <span className="absolute top-2 left-2 h-7 px-2.5 rounded-full bg-surface text-[13px] font-semibold text-ink flex items-center gap-1.5">
          <span className={cn('w-2 h-2 rounded-full', available ? 'bg-success' : 'bg-danger')} aria-hidden />{closedHere ? t('menu.closedHere') : t(available ? 'menu.available' : 'menu.unavailable')}
        </span>
      </div>
      <div className="px-1.5 pt-2.5 pb-2 flex flex-col gap-0.5">
        <p className="text-[15px] font-semibold text-ink truncate">{dish.name}</p>
        <p className="text-[13px] text-soft truncate">{category}</p>
      </div>
      <div className="mt-auto w-full border-t border-border px-1.5 pt-2 pb-1 flex items-center justify-between text-[13px] text-soft">
        {servings === null ? <span>{t('menu.noRecipe')}</span> : <span>{t('menu.canServe')} <b className="text-ink font-semibold">{servings}</b></span>}
        <LevelBadge level={dish.level} />
      </div>
    </button>
    {onToggleHere && <button type="button" onClick={onToggleHere} aria-pressed={closedHere} aria-label={t(closedHere ? 'menu.reopenHereLabel' : 'menu.closeHereLabel', { name: dish.name })}
      className={cn('absolute bottom-12 right-3.5 z-10 h-9 px-3 rounded-full text-[13px] font-semibold shadow', closedHere ? 'bg-success text-white' : 'bg-surface text-danger-ink border border-danger/30')}>
      {t(closedHere ? 'menu.reopenHere' : 'menu.closeHere')}
    </button>}
    </div>
  )
}
