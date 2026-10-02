'use client'

import { useTranslations } from 'next-intl'

import { Modal } from '@/components/kit/Modal'
import { IngredientPhoto } from '@/components/pantry/IngredientPhoto'
import { LevelBadge } from '@/components/pantry/LevelBadge'
import { dishServings, formatQty, unitLabel, type Dish, type RecipeLine } from '@/lib/domain/pantry'

export function DishDetailModal({ dish, category, lines, loading, onClose }: {
  dish: Dish | null; category: string; lines: RecipeLine[]; loading: boolean; onClose: () => void
}) {
  const t = useTranslations('pantry')
  const servings = dish ? dishServings(dish) : null
  return (
    <Modal open={dish !== null} onClose={onClose} title={t('detail.title')} size="center">
      {dish && (
        <div className="p-4 flex flex-col gap-4 min-h-[420px]">
          <section className="flex flex-col gap-2.5">
            <h3 className="text-[15px] font-semibold text-ink">{t('detail.dish')}</h3>
            <div className="flex items-center gap-3">
              <IngredientPhoto id={dish.id} hasImage={dish.hasImage} size={48} />
              <div className="min-w-0 flex flex-col gap-0.5">
                <p className="text-[15px] font-semibold text-ink">{dish.name}</p>
                <p className="text-[13px] text-soft flex items-center gap-1.5">
                  <span>{category}</span><span aria-hidden>•</span>
                  <span>{servings === null ? t('menu.noRecipe') : t('detail.canServe', { n: servings })}</span>
                  <LevelBadge level={dish.level} />
                </p>
              </div>
            </div>
          </section>
          <section className="flex flex-col gap-2.5 border-t border-border pt-4">
            <h3 className="text-[15px] font-semibold text-ink">{t('detail.ingredients')}</h3>
            {loading && <p className="text-[14px] text-soft">{t('detail.loading')}</p>}
            {!loading && lines.length === 0 && <p className="text-[14px] text-soft">{t('detail.noRecipe')}</p>}
            {lines.length > 0 && (
              <ul className="grid grid-cols-2 gap-2">
                {lines.map((line) => (
                  <li key={line.id} className="bg-muted rounded-sm p-2 flex items-center gap-2.5">
                    <IngredientPhoto id={line.ingredientId} hasImage={false} size={40} />
                    <div className="min-w-0 flex-1 flex flex-col">
                      <span className="text-[14px] font-medium text-ink truncate">{line.name}</span>
                      <span className="text-[13px] text-soft">{formatQty(line.qty)} {unitLabel(line.uomName)}</span>
                    </div>
                    <LevelBadge level={line.level} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}
