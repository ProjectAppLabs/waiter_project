'use client'

import { imageUrl } from '@/lib/services/pantry'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { Stepper } from '@/components/orders/Stepper'
import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'
import { selectionComplete, toggleChoice, type OptionChoice, type OptionGroup } from '@/lib/domain/orderWizard'
import type { Product } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface DishDraft { qty: number; note: string; options: OptionChoice[] }
interface Props {
  product: Product; description: string; groups: OptionGroup[]; initial?: DishDraft
  onClose: () => void; onConfirm: (draft: DishDraft) => void
}

// Modal "Add Order" del kit: foto, precio base, grupos de adiciones (atributo obligatorio / combo opcional),
// nota de cocina, cantidad y "Agregar al carrito" bloqueado hasta elegir lo obligatorio.
export function AddDishModal({ product, description, groups, initial, onClose, onConfirm }: Props) {
  const t = useTranslations('orders.create')
  const [qty, setQty] = useState(initial?.qty ?? 1)
  const [note, setNote] = useState(initial?.note ?? '')
  const [chosen, setChosen] = useState<OptionChoice[]>(initial?.options ?? [])
  const ready = selectionComplete(groups, chosen)
  const isOn = (c: OptionChoice) => chosen.some((x) => x.id === c.id && x.kind === c.kind)

  return (
    <Modal open onClose={onClose} title={t('addOrder')}
      footer={
        <div className="flex items-center justify-between">
          <Stepper value={qty} onChange={setQty} min={1} max={99} lessLabel={t('less')} moreLabel={t('more')} />
          <Button variant="primary" className="rounded-md" disabled={!ready} onClick={() => onConfirm({ qty, note: note.trim(), options: chosen })}>
            {initial ? t('saveChanges') : t('addToCartBtn')}
          </Button>
        </div>
      }>
      <div className="flex items-start gap-4 px-6 py-4 border-b border-border">
        <span className="w-[76px] h-[76px] rounded-md bg-muted overflow-hidden grid place-items-center text-dim shrink-0">
          {product.hasImage
            ? <img src={imageUrl(product.templateId)} alt={t('photo', { name: product.name })} className="w-full h-full object-cover" />
            : <Icon name="photo" size={24} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-semibold text-ink">{product.name}</p>
          {description && <p className="text-[14px] text-dim">{description}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[13px] text-soft">{t('basePrice')}</p>
          <p className="text-[18px] font-semibold text-primary tabular-nums">$ {formatCop(product.price)}</p>
        </div>
      </div>

      <div className="px-6 py-4 flex flex-col gap-5">
        {groups.length === 0 && <p className="text-[14px] text-soft">{t('noOptions')}</p>}
        {groups.map((group) => (
          <fieldset key={`${group.kind}-${group.id}`} className="flex flex-col gap-1">
            <legend className="w-full flex items-center justify-between mb-2">
              <span className="text-[15px] font-semibold text-ink">{group.name}</span>
              <span className={cn('h-6 px-2 rounded-sm text-[13px] font-semibold grid place-items-center', group.required ? 'bg-primary-soft text-primary' : 'bg-muted text-soft')}>
                {group.required ? t('required') : t('optional')}
              </span>
            </legend>
            {group.choices.map((choice) => (
              <button key={`${choice.kind}-${choice.id}`} type="button" role={group.multiple ? 'checkbox' : 'radio'} aria-checked={isOn(choice)}
                onClick={() => setChosen((cs) => toggleChoice(groups, cs, choice))} className="h-11 flex items-center gap-3 text-[15px] text-ink">
                <span className={cn('w-5 h-5 border-2 grid place-items-center shrink-0', group.multiple ? 'rounded-sm' : 'rounded-full', isOn(choice) ? 'border-primary bg-primary text-primary-ink' : 'border-border')}>
                  {isOn(choice) && (group.multiple ? <Icon name="check" size={13} /> : <span className="w-2 h-2 rounded-full bg-primary-ink" />)}
                </span>
                <span className="flex-1 text-left">{choice.name}</span>
                <span className="text-[15px] text-soft tabular-nums">+$ {formatCop(choice.priceExtra)}</span>
              </button>
            ))}
          </fieldset>
        ))}

        <label className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold text-ink">{t('kitchenNote')}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('kitchenNotePlaceholder')} rows={2}
            className="p-3 rounded-md border border-border bg-surface text-[15px] text-ink placeholder:text-dim focus:outline-2 focus:outline-primary resize-none" />
        </label>
      </div>
    </Modal>
  )
}
