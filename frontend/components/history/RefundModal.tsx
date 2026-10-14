'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { Toggle } from '@/components/kit/Toggle'
import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'
import { allocate, allocated, everything, lineAmount, refundTotal, type Selection } from '@/lib/domain/refund'
import { uuid } from '@/lib/domain/uuid'
import { CoreError } from '@/lib/services/core/http'
import { createRefund, refundable, type Refundable, type RefundResult } from '@/lib/services/core/refunds'

const REASON_MIN = 5
const toNumber = (text: string) => Number(text.replace(/\D/g, '')) || 0

// Plan U1: devolver un pedido cobrado, todo o una parte. Se eligen los platos y cuántos, la propina, por qué métodos
// sale el dinero (sin pasar de lo pagado por cada uno), el motivo y si vuelve al inventario. El servidor recalcula y
// rechaza lo que no cuadre; si el pedido tenía factura, emite la nota crédito.
export function RefundModal({ orderId, number, onClose, onDone }: { orderId: number; number: string; onClose: () => void; onDone: (r: RefundResult) => void }) {
  const t = useTranslations('history.refund')
  const [data, setData] = useState<Refundable | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>({})
  const [tip, setTip] = useState(0)
  const [payments, setPayments] = useState<Record<number, number>>({})
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Una sola clave por ventana: si la respuesta se pierde y se confirma otra vez, el servidor no devuelve dos veces.
  const [requestKey] = useState(() => `refund-${uuid()}`)

  useEffect(() => {
    let alive = true
    refundable(orderId).then((r) => { if (alive) setData(r) }).catch((e) => { if (alive) setLoadError(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [orderId])

  const total = useMemo(() => (data ? refundTotal(data.lines, selection, tip) : 0), [data, selection, tip])
  // Al cambiar lo que se devuelve, el reparto vuelve a la propuesta: primero efectivo.
  useEffect(() => { if (data) setPayments(allocate(total, data.methods)) }, [data, total])

  const setQty = (lineId: number, qty: number) => setSelection((s) => ({ ...s, [lineId]: qty }))
  const all = () => { if (data) { setSelection(everything(data.lines)); setTip(data.tip) } }
  const fits = data?.methods.every((m) => (payments[m.method_id] ?? 0) <= m.refundable) ?? false
  const ready = total > 0 && allocated(payments) === total && fits && reason.trim().length >= REASON_MIN && !busy

  async function confirm() {
    if (!data || !ready) return
    setBusy(true); setError(null)
    try {
      const result = await createRefund(orderId, {
        lines: Object.entries(selection).filter(([, q]) => q > 0).map(([id, qty]) => ({ line_id: Number(id), qty })),
        tip, payments: Object.entries(payments).filter(([, a]) => a > 0).map(([id, amount]) => ({ method_id: Number(id), amount })),
        reason: reason.trim(), restock, request_key: requestKey,
      })
      onDone(result)
    } catch (e) {
      setError(e instanceof CoreError && e.code === 'unreachable' ? t('offline') : e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const footer = (
    <div className="flex flex-col gap-2">
      {error && <p role="alert" className="text-[14px] text-danger-ink">{error}</p>}
      <div className="flex items-center justify-between"><span className="text-[15px] text-soft">{t('total')}</span><span className="text-[20px] font-semibold text-ink tabular">$ {formatCop(total)}</span></div>
      <Button variant="destructive" className="w-full h-12" disabled={!ready} onClick={() => void confirm()}><Icon name="refresh" size={18} />{t('confirm', { amount: formatCop(total) })}</Button>
    </div>
  )

  return (
    <Modal open onClose={onClose} title={t('title', { number })} size="center" footer={data ? footer : undefined}>
      {loadError && <p role="alert" className="text-[14px] text-danger-ink">{loadError}</p>}
      {!data && !loadError && <p className="text-[14px] text-soft">{t('loading')}</p>}
      {data && (
        <div className="flex flex-col gap-5">
          {data.refunds.length > 0 && (
            <p className="text-[14px] text-soft">{t('previous', { amount: formatCop(data.refunds.reduce((a, r) => a + r.total, 0)) })}</p>
          )}
          <section aria-label={t('dishes')} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-ink">{t('dishes')}</h3>
              <button type="button" onClick={all} className="text-[14px] font-semibold text-primary">{t('all')}</button>
            </div>
            <ul className="rounded-md border border-border divide-y divide-border">
              {data.lines.map((l) => {
                const qty = selection[l.line_id] ?? 0
                return (
                  <li key={l.line_id} className="px-3 py-2 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-ink truncate">{l.name}</p>
                      <p className="text-[13px] text-soft">{l.refundable_qty > 0 ? t('available', { n: l.refundable_qty, of: l.qty }) : t('done')}</p>
                    </div>
                    <div className="flex items-center gap-2" role="group" aria-label={l.name}>
                      <button type="button" aria-label={t('less', { name: l.name })} disabled={qty <= 0} onClick={() => setQty(l.line_id, qty - 1)} className="w-9 h-9 rounded-sm border border-border grid place-items-center disabled:opacity-40"><Icon name="minus" size={16} /></button>
                      <span className="w-8 text-center tabular text-[16px] font-semibold">{qty}</span>
                      <button type="button" aria-label={t('more', { name: l.name })} disabled={qty >= l.refundable_qty} onClick={() => setQty(l.line_id, qty + 1)} className="w-9 h-9 rounded-sm border border-border grid place-items-center disabled:opacity-40"><Icon name="plus" size={16} /></button>
                    </div>
                    <span className="w-24 text-right tabular text-[15px]">$ {formatCop(lineAmount(l, qty))}</span>
                  </li>
                )
              })}
            </ul>
          </section>
          {data.tip > 0 && (
            <label className="flex flex-col gap-1 text-[15px] font-medium text-ink">{t('tip', { max: formatCop(data.tip) })}
              <input aria-label={t('tipLabel')} inputMode="numeric" value={tip ? formatCop(tip) : ''} onChange={(e) => setTip(Math.min(data.tip, toNumber(e.target.value)))} className="h-11 rounded-md border border-border bg-surface px-3 tabular" />
            </label>
          )}
          <section aria-label={t('methods')} className="flex flex-col gap-2">
            <h3 className="text-[15px] font-semibold text-ink">{t('methods')}</h3>
            {data.methods.map((m) => (
              <label key={m.method_id} className="flex items-center gap-3 text-[15px]">
                <span className="flex-1">{m.name} <span className="text-[13px] text-soft">{t('upTo', { amount: formatCop(m.refundable) })}</span></span>
                <input aria-label={m.name} inputMode="numeric" value={payments[m.method_id] ? formatCop(payments[m.method_id]) : ''}
                  onChange={(e) => setPayments((p) => ({ ...p, [m.method_id]: toNumber(e.target.value) }))} className="w-36 h-10 rounded-md border border-border bg-surface px-3 text-right tabular" />
              </label>
            ))}
            {total > 0 && allocated(payments) !== total && <p className="text-[13px] text-danger-ink">{t('mustMatch', { amount: formatCop(total) })}</p>}
            {!fits && <p className="text-[13px] text-danger-ink">{t('overMethod')}</p>}
            <p className="text-[13px] text-soft">{t('cardHint')}</p>
          </section>
          <label className="flex flex-col gap-1 text-[15px] font-medium text-ink">{t('reason')}
            <textarea aria-label={t('reason')} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="rounded-md border border-border bg-surface px-3 py-2 text-[15px]" />
          </label>
          <div className="flex items-center gap-3 text-[15px] text-ink"><Toggle checked={restock} onChange={setRestock} label={t('restock')} /><span>{t('restock')}</span></div>
          {data.credit_note && <p className="text-[13px] text-soft">{t('creditNote')}</p>}
        </div>
      )}
    </Modal>
  )
}
