'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { AmountInput, popDigit, pushDigit } from '@/components/cash/AmountInput'
import { Chip } from '@/components/kit/Chip'
import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { NumericKeypad } from '@/components/kit/NumericKeypad'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { formatCop } from '@/lib/domain/money'

interface RegisterCardProps { openSince: string; expectedCash: number | null; onClose: () => void; onMove: (type: 'in' | 'out', amount: number, reason: string) => Promise<void> }

// Tarjeta de caja del kit: icono, "abierta desde", efectivo esperado y acciones. Entrada / salida abre un modal centrado
// con el teclado numérico del kit (Payment / Cash / Pay.png).
export function RegisterCard({ openSince, expectedCash, onClose, onMove }: RegisterCardProps) {
  const t = useTranslations('cash')
  const [moving, setMoving] = useState(false)
  const [type, setType] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [done, setDone] = useState(false)
  async function apply() {
    await onMove(type, Number(amount), reason)
    setDone(true); setAmount(''); setReason(''); setMoving(false)
  }
  return (
    <section aria-label={t('card.title')} className="rounded-lg bg-surface border border-border text-ink p-5 flex items-center gap-8">
      <span className="w-12 h-12 rounded-md bg-primary-soft text-primary grid place-items-center shrink-0"><Icon name="cash" size={24} /></span>
      <div className="flex flex-col gap-0.5"><span className="text-[13px] text-soft">{t('card.title')}</span><span className="text-[16px] font-semibold">{t('card.openSince', { time: openSince })}</span></div>
      <div className="flex flex-col gap-0.5"><span className="text-[13px] text-soft">{t('card.expectedCash')}</span><span className="text-[24px] font-semibold tabular leading-none">{expectedCash === null ? '—' : `$ ${formatCop(expectedCash)}`}</span></div>
      <div className="ml-auto flex items-center gap-3">
        {done && <span role="status" className="text-[13px] text-success-ink">{t('move.done')}</span>}
        <Button onClick={() => setMoving(true)}><Icon name="arrowUp" size={18} />{t('card.moves')}</Button>
        <Button variant="primary" onClick={onClose}><Icon name="lock" size={18} />{t('card.close')}</Button>
      </div>
      <Modal open={moving} onClose={() => setMoving(false)} title={t('move.title')} size="center"
        footer={<Button variant="primary" className="w-full" disabled={!amount || Number(amount) <= 0 || !reason.trim()} onClick={apply}>{t('move.apply')}</Button>}>
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="flex gap-2">
            <Chip label={t('move.in')} icon="arrowUp" active={type === 'in'} onClick={() => setType('in')} />
            <Chip label={t('move.out')} icon="arrowDown" active={type === 'out'} onClick={() => setType('out')} />
          </div>
          <p className="text-[13px] text-soft text-center">{t('move.inputBody')}</p>
          <AmountInput label={t('move.amount')} value={amount} onChange={setAmount} />
          <NumericKeypad onDigit={(d) => setAmount((v) => pushDigit(v, d))} onBackspace={() => setAmount(popDigit)} />
          <div className="w-full"><TextInput label={t('move.reason')} placeholder={t('move.reasonPlaceholder')} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
      </Modal>
    </section>
  )
}
