'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { AmountInput, popDigit, pushDigit } from '@/components/cash/AmountInput'
import { Modal } from '@/components/kit/Modal'
import { NumericKeypad } from '@/components/kit/NumericKeypad'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { cashDifference, needsNote } from '@/lib/domain/cash'
import { cashSettings } from '@/lib/services/business'
import { formatCop } from '@/lib/domain/money'
import type { ClosingData, CloseResult } from '@/lib/services/cashRegister'
import { cn } from '@/lib/utils'

const TONE = { ok: 'text-success-ink', warn: 'text-progress-ink', busy: 'text-danger-ink' }

interface CloseRegisterModalProps { data: ClosingData; onClose: () => void; onConfirm: (counted: number, notes: string) => Promise<CloseResult>; canForce?: boolean; onForce?: () => Promise<CloseResult> }

// Cierre de caja como modal ancho del kit: resumen del turno a la izquierda (como "Order Details" del pago) y el
// efectivo contado con el teclado numérico a la derecha (Payment / Cash / Pay.png).
export function CloseRegisterModal({ data, onClose, onConfirm, canForce = false, onForce }: CloseRegisterModalProps) {
  const t = useTranslations('cash.close')
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [state, setState] = useState<'idle' | 'closing' | 'closed' | 'failed'>('idle')
  const [message, setMessage] = useState('')
  const [tolerance, setTolerance] = useState<number | undefined>(undefined)
  useEffect(() => { let alive = true; cashSettings().then((s) => { if (alive) setTolerance(s.tolerance) }).catch(() => undefined); return () => { alive = false } }, [])
  const diff = counted === '' ? null : cashDifference(data.expectedCash, Number(counted), tolerance)
  const missingNote = needsNote(data.expectedCash, counted === '' ? null : Number(counted), notes)
  const blocked = data.draftOrders > 0
  const locked = state === 'closed' || state === 'closing'
  async function confirm() {
    setState('closing')
    const result = await onConfirm(Number(counted), notes)
    setMessage(result.message)
    setState(result.successful ? 'closed' : 'failed')
  }
  const row = (label: string, amount: number, muted = false) => <div className={cn('flex justify-between text-[15px]', muted && 'text-soft')}><span>{label}</span><span className="tabular">{formatCop(amount)}</span></div>
  return (
    <Modal open onClose={onClose} title={t('title')} size="wide">
      <div className="h-full flex">
        <section className="w-[420px] shrink-0 border-r border-border p-6 overflow-y-auto flex flex-col gap-4">
          <div><p className="text-[13px] text-soft">{t('summary')}</p><p className="text-[16px] font-semibold text-ink">{t('orders', { n: data.ordersCount, amount: formatCop(data.ordersTotal) })}</p></div>
          {blocked && <p role="alert" className="rounded-sm bg-danger-soft text-danger-ink px-3.5 py-3 text-[14px]">{t('drafts', { n: data.draftOrders })}</p>}
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-soft">{t('byMethod')}</p>
            {row(`${t('cash')} · ${t('opening', { amount: formatCop(data.openingCash) })}`, data.cashPayments)}
            {data.otherMethods.map((m) => <div key={m.id}>{row(`${m.name} · ${m.count}`, m.amount)}</div>)}
          </div>
          {data.cashMoves.length > 0 && <div className="flex flex-col gap-2"><p className="text-[13px] text-soft">{t('moves')}</p>{data.cashMoves.map((m, i) => <div key={i}>{row(m.name, m.amount, true)}</div>)}</div>}
          <div className="rounded-md bg-muted p-4 flex flex-col gap-1"><span className="text-[13px] text-soft">{t('expected')}</span><span className="text-[24px] font-semibold tabular text-ink">$ {formatCop(data.expectedCash)}</span></div>
          {/* Si la caja no cuadra, la nota es obligatoria: el dueño la lee en los cuadres y en el aviso. */}
          <TextInput label={diff && diff.amount !== 0 ? t(diff.amount < 0 ? 'notesShort' : 'notesOver', { amount: formatCop(Math.abs(diff.amount)) }) : t('notes')}
            value={notes} onChange={(e) => setNotes(e.target.value)} disabled={locked} required={!!diff && diff.amount !== 0}
            hint={missingNote ? t('notesRequired') : undefined} />
        </section>
        <section className="flex-1 min-w-0 p-6 flex flex-col items-center gap-3">
          <p className="text-[18px] font-semibold text-ink">{t('countedTitle')}</p>
          <p className="text-[13px] text-soft">{t('countedBody')}</p>
          <AmountInput label={t('counted')} value={counted} onChange={setCounted} disabled={locked} />
          <div className="h-6 w-[300px] flex justify-between text-[15px]">{diff && <><span className="text-soft">{t('difference')}</span><span className={cn('tabular font-semibold', TONE[diff.tone])}>{diff.amount > 0 ? '+' : ''}{formatCop(diff.amount)}</span></>}</div>
          <NumericKeypad disabled={locked} onDigit={(d) => setCounted((v) => pushDigit(v, d))} onBackspace={() => setCounted(popDigit)} />
          <div className="mt-auto w-full max-w-[420px] flex flex-col gap-2">
            {state === 'closed' && <p role="status" className="text-[14px] text-success-ink text-center">{t('closed')}</p>}
            {state === 'failed' && <p role="alert" className="text-[14px] text-danger-ink text-center">{t('failed', { message })}</p>}
            {state === 'failed' && canForce && onForce && (
              <><p className="text-[13px] text-soft text-center">{t('forceHint')}</p>
                <Button variant="destructive" onClick={async () => { const r = await onForce(); setMessage(r.message); setState(r.successful ? 'closed' : 'failed') }}>{t('force')}</Button></>
            )}
            {state !== 'closed' && <Button variant="primary" size="money" className="w-full" onClick={confirm} disabled={blocked || counted === '' || missingNote || state === 'closing'}>{state === 'closing' ? t('closing') : t('confirm')}</Button>}
          </div>
        </section>
      </div>
    </Modal>
  )
}
