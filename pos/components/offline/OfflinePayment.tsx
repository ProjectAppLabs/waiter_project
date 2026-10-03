'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Modal } from '@/components/kit/Modal'
import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'
import { newRequestKey, useOutboxStore, type OrderRef } from '@/lib/offline/outbox'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { cn } from '@/lib/utils'

// Plan U2: cobrar sin conexión. Solo efectivo o datáfono manual (el datáfono aprueba por su lado); QR y pagos en línea
// necesitan red. El pago se envía al volver la red por el saldo que diga el servidor, y luego se cierra el pedido.
export function OfflinePayment({ order, total, label, onClose, onPaid }: { order: OrderRef; total: number; label: string; onClose: () => void; onPaid: () => void }) {
  const t = useTranslations('pos.offline.pay')
  const methods = useCatalogStore((s) => s.catalog?.paymentMethods ?? []).filter((m) => m.type !== 'pay_later')
  const cash = methods.find((m) => m.type === 'cash') ?? null
  const card = methods.find((m) => m.type === 'bank') ?? null
  const [kind, setKind] = useState<'cash' | 'card'>(cash ? 'cash' : 'card')
  const [received, setReceived] = useState('')
  const [reference, setReference] = useState('')
  const given = Number(received.replace(/\D/g, '')) || 0
  const method = kind === 'cash' ? cash : card
  const ready = method !== null && (kind === 'card' ? reference.trim().length > 0 : given >= total)
  function confirm() {
    if (!method || !ready) return
    const outbox = useOutboxStore.getState()
    outbox.enqueue({ kind: 'payment', order, methodId: method.id, amount: 'balance', received: kind === 'cash' ? given : null, reference: kind === 'card' ? reference.trim() : '', requestKey: newRequestKey(), label })
    outbox.enqueue({ kind: 'pay', order, label })
    onPaid()
  }
  return (
    <Modal open onClose={onClose} title={t('title')} size="center"
      footer={<Button variant="primary" className="w-full h-12" disabled={!ready} onClick={confirm}>{t('confirm')}</Button>}>
      <p className="text-[14px] text-soft">{t('hint')}</p>
      <p className="mt-3 flex items-center justify-between text-[16px]"><span>{t('total')}</span><strong className="tabular">$ {formatCop(total)}</strong></p>
      <div role="tablist" aria-label={t('method')} className="mt-4 grid grid-cols-2 gap-2">
        {([['cash', cash], ['card', card]] as const).map(([k, m]) => (
          <button key={k} role="tab" type="button" aria-selected={kind === k} disabled={!m} onClick={() => setKind(k)}
            className={cn('h-11 rounded-md border text-[15px] font-semibold disabled:opacity-40', kind === k ? 'border-primary bg-primary-soft text-primary' : 'border-border text-ink')}>{t(k)}</button>
        ))}
      </div>
      {kind === 'cash' ? (
        <label className="mt-4 flex flex-col gap-2 text-[15px] font-medium">{t('received')}
          <input aria-label={t('received')} inputMode="numeric" value={received} onChange={(e) => setReceived(e.target.value)} className="h-12 rounded-md border border-border bg-surface px-4 text-[18px] tabular" />
          {given >= total && <span className="text-[15px] text-success-ink">{t('change', { amount: formatCop(given - total) })}</span>}
        </label>
      ) : (
        <label className="mt-4 flex flex-col gap-2 text-[15px] font-medium">{t('reference')}
          <input aria-label={t('reference')} value={reference} onChange={(e) => setReference(e.target.value)} className="h-12 rounded-md border border-border bg-surface px-4 text-[16px]" />
        </label>
      )}
    </Modal>
  )
}
