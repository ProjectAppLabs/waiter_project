'use client'

import { useTranslations } from 'next-intl'

import { OrderLineRow } from '@/components/order/OrderLineRow'
import { Button } from '@/components/ui/Button'
import { Money } from '@/components/ui/Money'
import type { DraftLine } from '@/lib/domain/order'

interface Props {
  tableNumber: number; lines: DraftLine[]; selectedUuid: string | null; busy: boolean
  onSelectLine: (uuid: string | null) => void; onQty: (uuid: string, qty: number) => void; onNote: (uuid: string) => void
  onRemove: (uuid: string) => void; onSave: () => void; onBill: () => void; onSend: () => void
}

export function OrderPanel({ tableNumber, lines, selectedUuid, busy, onSelectLine, onQty, onNote, onRemove, onSave, onBill, onSend }: Props) {
  const t = useTranslations('pos.order')
  const total = lines.reduce((a, l) => a + l.unitPrice * l.qty, 0)
  return (
    <aside className="w-panel-lg shrink-0 border-l border-border bg-surface flex flex-col">
      <div className="px-5 py-4 border-b border-muted flex items-center justify-between">
        <span className="text-[19px] font-bold">{t('panelTitle', { number: tableNumber })}</span>
        <span className="text-[15px] text-soft">{t('items', { count: lines.length })}</span>
      </div>
      <div className="flex-1 min-h-0 px-5 py-1 overflow-auto">
        {lines.map((l) => (
          <OrderLineRow key={l.uuid} line={l} selected={l.uuid === selectedUuid}
            onSelect={() => onSelectLine(l.uuid === selectedUuid ? null : l.uuid)} onQty={(q) => onQty(l.uuid, q)} onNote={() => onNote(l.uuid)} onRemove={() => onRemove(l.uuid)} />
        ))}
      </div>
      <div className="px-5 py-4 border-t border-muted bg-canvas">
        <div className="flex justify-between items-baseline mb-3.5"><span className="text-lg font-bold">{t('partial')}</span><Money amount={total} withSymbol className="text-3xl" /></div>
        <div className="grid grid-cols-2 gap-2.5">
          <Button onClick={onSave} disabled={busy || lines.length === 0}>{t('save')}</Button>
          <Button onClick={onBill} disabled={busy || lines.length === 0}>{t('bill')}</Button>
        </div>
        <Button variant="primary" size="money" className="w-full mt-2.5" onClick={onSend} disabled={busy || lines.length === 0}>{t('send')}</Button>
      </div>
    </aside>
  )
}
