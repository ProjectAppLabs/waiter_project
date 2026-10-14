'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { StatusPill, type PillTone } from '@/components/kit/StatusPill'
import { IngredientPhoto } from '@/components/pantry/IngredientPhoto'
import { LevelBadge } from '@/components/pantry/LevelBadge'
import { categoryEmoji, formatStock, type Ingredient, type IngredientStatus } from '@/lib/domain/pantry'

const TONE: Record<IngredientStatus, PillTone> = { request: 'danger', normal: 'progress', good: 'success' }

// Fila de "Ingredients List": foto, nombre, categoría • stock • nivel, PROVEEDOR, ESTADO y menú ⋯ (Editar / Solicitar / Eliminar).
// `mayEdit` decide si el menú ofrece editar y borrar. Solicitar al proveedor se queda siempre: es pedir,
// no cambiar el inventario, y quien ve que algo se acaba suele ser el de la sala.
export function IngredientRow({ ingredient, onEdit, onRequest, onDelete, onControl, mayEdit = true }: { ingredient: Ingredient; onEdit: () => void; onRequest: () => void; onDelete: () => void; mayEdit?: boolean; onControl?:()=>void }) {
  const t = useTranslations('pantry')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  const pick = (fn: () => void) => () => { setOpen(false); fn() }
  return (
    <li className="h-[72px] px-3 rounded-md border border-border bg-surface flex items-center gap-3">
      <IngredientPhoto id={ingredient.id} hasImage={ingredient.hasImage} size={48} />
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className="text-[15px] font-semibold text-ink truncate">{ingredient.name}</p>
        <p className="text-[13px] text-soft flex items-center gap-1.5 truncate">
          <span>{categoryEmoji(ingredient.category)} {t(`categories.${ingredient.category ?? 'other'}`)}</span><span aria-hidden>•</span>
          <span>{t('ingredients.stock')} {formatStock(ingredient.qty, ingredient.uomName)}</span>
          <LevelBadge level={ingredient.level} />
        </p>
      </div>
      <span className="w-px h-10 bg-border" aria-hidden />
      <div className="w-[160px] flex flex-col gap-1">
        <span className="text-[12px] font-medium text-dim tracking-wide">{t('ingredients.supplier')}</span>
        <span className="text-[15px] font-semibold text-ink truncate">{ingredient.supplierName ?? t('ingredients.noSupplier')}</span>
      </div>
      <div className="w-[130px] flex flex-col gap-1 items-start">
        <span className="text-[12px] font-medium text-dim tracking-wide">{t('ingredients.status')}</span>
        {ingredient.status
          ? <StatusPill tone={TONE[ingredient.status]} className="h-6 px-2 text-[13px]">{t(`ingredients.statusLabel.${ingredient.status}`)}</StatusPill>
          : <span className="text-[13px] text-dim">{t('levels.none')}</span>}
      </div>
      <div ref={box} className="relative">
        <button type="button" aria-label={t('actions.more', { name: ingredient.name })} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
          className="w-10 h-10 rounded-md border border-border bg-surface grid place-items-center text-ink hover:bg-muted"><Icon name="moreHorizontal" size={20} /></button>
        {open && (
          <div role="menu" className="absolute right-0 top-full mt-1 z-20 w-[200px] p-1.5 rounded-md border border-border bg-surface shadow-lg flex flex-col">
            {onControl&&<button type="button" role="menuitem" onClick={pick(onControl)} className="h-10 px-2.5 text-left text-sm hover:bg-muted">Existencias y movimientos</button>}
            {mayEdit && <button type="button" role="menuitem" onClick={pick(onEdit)} className="h-10 px-2.5 rounded-sm flex items-center gap-2.5 text-[14px] font-medium text-ink hover:bg-muted"><Icon name="edit" size={18} />{t('actions.edit')}</button>}
            <button type="button" role="menuitem" onClick={pick(onRequest)} className="h-10 px-2.5 rounded-sm flex items-center gap-2.5 text-[14px] font-medium text-ink hover:bg-muted"><Icon name="catalog" size={18} />{t('actions.request')}</button>
            <span className="my-1 border-t border-border" aria-hidden />
            {mayEdit && <button type="button" role="menuitem" onClick={pick(onDelete)} className="h-10 px-2.5 rounded-sm flex items-center gap-2.5 text-[14px] font-medium text-danger-ink hover:bg-danger-soft"><Icon name="trash" size={18} />{t('actions.delete')}</button>}
          </div>
        )}
      </div>
    </li>
  )
}
