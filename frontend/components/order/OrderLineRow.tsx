'use client'

import { useTranslations } from 'next-intl'

import { QtyStepper } from '@/components/order/QtyStepper'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import type { DraftLine } from '@/lib/domain/order'
import { cn } from '@/lib/utils'

interface Props { line: DraftLine; selected: boolean; onSelect: () => void; onQty: (q: number) => void; onNote: () => void; onRemove: () => void }

export function OrderLineRow({ line, selected, onSelect, onQty, onNote, onRemove }: Props) {
  const t = useTranslations('pos.order')
  const chips = line.note.split(' · ').filter(Boolean)
  return (
    <div className={cn('py-3.5 border-b border-muted flex flex-col gap-1.5', selected && 'bg-brand-50 -mx-5 px-5')}>
      <button type="button" onClick={onSelect} className={cn('grid grid-cols-[26px_1fr_auto] gap-2.5 text-[17px] text-left w-full', selected && 'font-bold')}>
        <span className={cn('font-mono', selected ? 'text-brand-600' : 'text-ink-3')}>{line.qty}</span>
        <span>{line.name}</span>
        <Money amount={line.unitPrice * line.qty} />
      </button>
      {chips.length > 0 && !selected && (
        <div className="flex gap-1.5 pl-9">{chips.map((c) => <span key={c} className="h-[30px] px-2.5 rounded-sm bg-muted text-sm text-soft grid place-items-center">{c}</span>)}</div>
      )}
      {selected && (
        <div className="flex items-center gap-2.5 mt-2.5 pl-9">
          <QtyStepper qty={line.qty} onChange={onQty} />
          <Button size="compact" onClick={onNote}>{t('modify')}</Button>
          <Button size="compact" variant="destructive" className="ml-2" onClick={onRemove}>{t('remove')}</Button>
        </div>
      )}
    </div>
  )
}
