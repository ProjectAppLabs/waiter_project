'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { formatOrderDate } from '@/components/tables/TableDetailModal'
import { Button } from '@/components/ui/Button'
import { orderCode, orderPrefix } from '@/lib/domain/tablesKit'
import type { OrderDetail } from '@/lib/services/tables'

interface Props { open: boolean; onClose: () => void; detail: OrderDetail; current: string; target: string; busy: boolean; onConfirm: () => void }

// Modal "Cambiar mesa" del kit (Detail Table/Change Table.png): pedido, cliente, mesa actual → mesa nueva, confirmar.
export function ChangeTableModal({ open, onClose, detail, current, target, busy, onConfirm }: Props) {
  const t = useTranslations('tables.change')
  const td = useTranslations('tables.detail')
  const prefix = orderPrefix(detail.serviceAt)
  const chip = (name: string) => <span className="w-10 h-10 rounded-sm bg-primary text-primary-ink grid place-items-center text-[15px] font-semibold">{name}</span>
  return (
    <Modal open={open} onClose={onClose} title={t('title')} footer={
      <div className="flex gap-3"><Button className="flex-1" onClick={onClose} disabled={busy}>{t('cancel')}</Button><Button variant="primary" className="flex-1" onClick={onConfirm} disabled={busy}>{t('confirm')}</Button></div>
    }>
      <div className="p-4 flex flex-col gap-4">
        <div className="h-9 px-3 rounded-sm bg-muted flex items-center justify-between text-[13px] text-soft">
          <span>{td('order')} <strong className="text-ink">{orderCode(prefix, detail.tracking, detail.id)}</strong> / <strong className="text-ink">{td(`type.${prefix}`)}</strong></span>
          <span>{formatOrderDate(detail.dateOrder)}</span>
        </div>
        <div className="text-center flex flex-col"><span className="text-[13px] text-dim">{td('customer')}</span><span className="text-[15px] font-semibold text-ink">{detail.customerName || td('noCustomer')}</span></div>
        <hr className="border-dashed border-border" />
        <div className="flex items-center justify-center gap-10 text-[13px] text-dim">
          <div className="flex flex-col items-center gap-2"><span>{t('current')}</span>{chip(current)}</div>
          <Icon name="arrowRight" size={22} className="text-primary mt-6" />
          <div className="flex flex-col items-center gap-2"><span>{t('new')}</span>{chip(target)}</div>
        </div>
      </div>
    </Modal>
  )
}
