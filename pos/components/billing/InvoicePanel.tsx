'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AccountingDetail } from '@/components/billing/AccountingDetail'
import { Card } from '@/components/kit/Card'
import { Icon } from '@/components/kit/Icon'
import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { StatusPill } from '@/components/kit/StatusPill'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { billingDate } from '@/lib/domain/billing'
import { formatCop } from '@/lib/domain/money'
import { CoreError } from '@/lib/services/core/http'
import { listCustomers, type Customer } from '@/lib/services/customers'
import { invoicePdfUrl, orderLines, reviewOrder, type BillingReview, type Invoice, type InvoiceableOrder, type OrderLine } from '@/lib/services/invoices'
import { cn } from '@/lib/utils'

export type Selection = { kind: 'order'; order: InvoiceableOrder } | { kind: 'invoice'; invoice: Invoice } | null
interface InvoicePanelProps { selection: Selection; onClose?: () => void; tableNumber: number | null; onIssue: (orderId: number, partnerId: number | null) => Promise<{ id: number; name: string }> }

const STATE_TONE = { draft: 'neutral', posted: 'info', cancel: 'danger' } as const

export function InvoicePanel({ selection, tableNumber, onIssue, onClose }: InvoicePanelProps) {
  const t = useTranslations('admin.billing')
  const pdfLink = (id: number) => <a href={invoicePdfUrl(id)} target="_blank" rel="noreferrer" className="h-tap rounded-md bg-brand-500 text-white flex items-center justify-center gap-2 text-base font-bold"><Icon name="printer" size={20} />{t('panel.pdf')}</a>
  return (
    <Card title={t('panel.title')} className="w-[360px] max-w-full shrink-0 overflow-hidden"
      action={onClose && <button type="button" aria-label={t('panel.close')} onClick={onClose} className="w-11 h-11 grid place-items-center rounded-md text-soft hover:bg-muted"><Icon name="close" size={20} /></button>}>
      {!selection && <KitEmptyState icon="billing" title={t('panel.empty')} body={t('panel.emptyBody')} />}
      {selection?.kind === 'invoice' && (
        <div className="h-full min-h-0 flex flex-col overflow-y-auto">
          <div className="shrink-0 p-5 flex items-center gap-3 border-b border-border">
            <span className="w-12 h-12 rounded-md bg-primary text-primary-ink grid place-items-center"><Icon name="billing" size={22} /></span>
            <div className="min-w-0"><p className="text-[16px] font-semibold text-ink truncate">{selection.invoice.partner || t('noCustomer')}</p><p className="text-[13px] text-soft">{t('panel.number')} <span className="font-semibold text-ink">{selection.invoice.name}</span></p></div>
            <span className="ml-auto text-[13px] text-soft text-right">{billingDate(selection.invoice.date)}</span>
          </div>
          <div className="p-5 flex flex-wrap gap-2">
            <StatusPill tone={STATE_TONE[selection.invoice.state as keyof typeof STATE_TONE] ?? 'neutral'}>{['draft', 'posted', 'cancel'].includes(selection.invoice.state) ? t(`state.${selection.invoice.state}`) : t('unknownState')}</StatusPill>
            <StatusPill tone={selection.invoice.paymentState === 'paid' ? 'success' : 'info'}>{t(`paymentState.${['not_paid', 'in_payment', 'paid', 'partial', 'reversed', 'blocked', 'invoicing_legacy'].includes(selection.invoice.paymentState) ? selection.invoice.paymentState : 'unknown'}`)}</StatusPill>
          </div>
          <AccountingDetail key={selection.invoice.id} invoiceId={selection.invoice.id} />
          <div className="mt-auto p-5 flex flex-col gap-4">
            <div className="rounded-md bg-muted p-4 flex justify-between items-baseline"><span className="text-[16px] text-soft">{t('panel.total')}</span><span className="text-[20px] font-semibold text-ink tabular">$ {formatCop(selection.invoice.total)}</span></div>
            {pdfLink(selection.invoice.id)}
          </div>
        </div>
      )}
      {selection?.kind === 'order' && <OrderPanel key={selection.order.id} order={selection.order} tableNumber={tableNumber} onIssue={onIssue} pdfLink={pdfLink} />}
    </Card>
  )
}

function OrderPanel({ order, tableNumber, onIssue, pdfLink }: { order: InvoiceableOrder; tableNumber: number | null; onIssue: InvoicePanelProps['onIssue']; pdfLink: (id: number) => React.ReactNode }) {
  const t = useTranslations('admin.billing')
  const [lines, setLines] = useState<OrderLine[]>([])
  const [loadingLines, setLoadingLines] = useState(true)
  const [linesError, setLinesError] = useState(false)
  const [customersError, setCustomersError] = useState(false)
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [partnerId, setPartnerId] = useState<number | null>(order.partnerId)
  const [issued, setIssued] = useState<{ id: number; name: string } | null>(order.invoiceId ? { id: order.invoiceId, name: '' } : null)
  const [review, setReview] = useState<{ partnerId: number | null; data: BillingReview } | null>(null)
  const [reviewError, setReviewError] = useState(false)
  const [reviewAttempt, setReviewAttempt] = useState(0)
  const [saveError, setSaveError] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')
  useEffect(() => {
    let alive = true
    void orderLines(order.id).then((rows) => { if (alive) setLines(rows) }).catch(() => { if (alive) setLinesError(true) }).finally(() => { if (alive) setLoadingLines(false) })
    return () => { alive = false }
  }, [order.id])
  useEffect(() => {
    let alive = true
    const h = setTimeout(() => { void listCustomers(query).then((rows) => { if (alive) { setCustomers(rows.slice(0, 6)); setCustomersError(false) } }).catch(() => { if (alive) setCustomersError(true) }) }, 250)
    return () => { alive = false; clearTimeout(h) }
  }, [query])
  useEffect(() => {
    let alive = true
    void reviewOrder(order.id, partnerId).then((data) => {
      if (alive) { setReview({ partnerId, data }); setReviewError(false) }
    }).catch(() => { if (alive) setReviewError(true) })
    return () => { alive = false }
  }, [order.id, partnerId, reviewAttempt])
  const currentReview = review?.partnerId === partnerId ? review.data : null
  const ready = Boolean(currentReview?.ready && !reviewError)
  async function issue() {
    if (!ready || loadingLines || linesError || state === 'saving') return
    setState('saving')
    try { setIssued(await onIssue(order.id, partnerId)); setState('idle') } catch (error) { setSaveError(error instanceof CoreError ? error.message : t('panel.saveError')); setState('error') }
  }
  const tip = currentReview?.tip ?? order.tip ?? 0
  const subtotal = order.total - order.tax - tip
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="shrink-0 p-5 flex items-center gap-3 border-b border-border">
        <span className="w-12 h-12 rounded-md bg-primary text-primary-ink grid place-items-center text-[16px] font-semibold">{tableNumber ?? <Icon name="receipt" size={22} />}</span>
        <div className="min-w-0"><p className="text-[16px] font-semibold text-ink truncate">{partnerId === null ? t('panel.generalName') : customers.find((c) => c.id === partnerId)?.name || order.partnerName}</p><p className="text-[13px] text-soft">{t('panel.order')} <span className="font-semibold text-ink">{order.reference || order.id}</span></p></div>
        <span className="ml-auto text-[13px] text-soft text-right">{billingDate(order.date)}</span>
      </div>
      <div className="pb-2">
        <p className="px-5 pt-4 pb-2 text-[15px] font-semibold text-ink">{t('panel.details')}</p>
        {loadingLines && <p role="status" className="px-5 py-2 text-sm text-soft">{t('panel.loadingLines')}</p>}
        {linesError && <p role="alert" className="px-5 py-2 text-sm text-danger-ink">{t('panel.linesError')}</p>}
        <ul className="px-5">
          {lines.map((l) => (
            <li key={l.id} className="py-2.5 border-b border-border flex items-start justify-between gap-3 text-[15px]">
              <div className="min-w-0"><p className="font-medium text-ink truncate">{l.name}</p><p className="text-[13px] text-soft tabular">$ {formatCop(l.unit)}{l.discount > 0 && <span> · −{l.discount}%</span>}</p></div>
              <div className="text-right shrink-0"><p className="text-[13px] text-soft">× {l.qty}</p><p className="font-semibold text-ink tabular">$ {formatCop(l.total)}</p></div>
            </li>
          ))}
        </ul>
        {order.payments?.length > 0 && <section className="px-5 pt-4 text-[13px]">
          <h3 className="font-semibold text-ink">{t('panel.payment')}</h3>
          <dl className="mt-2 flex flex-col gap-1">{order.payments.map((payment) => <div key={payment.methodId} className="flex justify-between gap-2 text-soft"><dt>{payment.method}</dt><dd className="tabular">$ {formatCop(payment.amount)}</dd></div>)}</dl>
        </section>}
        {!issued && (
          <section aria-label={t('panel.customer')} className="p-5 flex flex-col gap-2">
            <p className="text-[15px] font-semibold text-ink">{t('panel.customer')}</p>
            <p className="text-[13px] text-soft">{t('panel.customerHint')}</p>
            {customersError && <p role="alert" className="text-sm text-danger-ink">{t('panel.customersError')}</p>}
            <SearchInput value={query} onChange={setQuery} placeholder={t('panel.searchCustomer')} />
            <div role="radiogroup" aria-label={t('panel.customer')} className="flex flex-col gap-1.5">
              <button type="button" role="radio" aria-checked={partnerId === null} disabled={state === 'saving'} onClick={() => { setPartnerId(null); setReviewError(false); setState('idle') }}
                className={cn('p-3.5 rounded-md border text-left text-[14px]', partnerId === null ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-ink')}>
                <span className="block font-semibold">{t('panel.generalName')}</span><span className="block text-xs text-soft mt-1">{t('panel.generalHint')}</span>
              </button>
              {customers.length === 0 && <span className="text-[14px] text-soft">{t('panel.noCustomers')} · <Link href="/clientes" className="text-primary font-semibold">{t('panel.goCustomers')}</Link></span>}
              {customers.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={partnerId === c.id} disabled={state === 'saving'} onClick={() => { setPartnerId(c.id); setReviewError(false); setState('idle') }}
                  className={cn('h-11 px-3.5 rounded-md border text-left text-[15px] flex justify-between items-center', partnerId === c.id ? 'border-primary bg-primary-soft text-primary font-semibold' : 'border-border bg-surface text-ink')}>
                  <span className="truncate">{c.name}</span><span className="tabular text-soft text-[13px]">{c.vat || '—'}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="shrink-0 p-5 flex flex-col gap-3 border-t border-border">
        <div className="rounded-md bg-muted p-4 flex flex-col gap-1.5 text-[15px]">
          <div className="flex justify-between text-soft"><span>{t('panel.subtotal')}</span><span className="tabular text-ink">$ {formatCop(subtotal)}</span></div>
          <div className="flex justify-between text-soft"><span>{t('panel.tax')}</span><span className="tabular text-ink">$ {formatCop(order.tax)}</span></div>
          <div className="flex justify-between text-soft"><span>{t('panel.tip')}</span><span className="tabular text-ink">$ {formatCop(tip)}</span></div>
          <div className="flex justify-between items-baseline pt-2 border-t border-dashed border-border"><span className="text-[16px] text-soft">{t('panel.total')}</span><span className="text-[20px] font-semibold text-ink tabular">$ {formatCop(order.total)}</span></div>
        </div>
        {!issued && <section className="rounded-lg border border-border p-3 space-y-2 text-sm" aria-label={t('panel.reviewTitle')}>
          <h3 className="font-semibold text-ink">{t('panel.reviewTitle')}</h3>
          {reviewError ? <div role="alert" className="text-danger-ink">{t('panel.reviewError')}<Button size="compact" className="mt-2" onClick={() => { setReview(null); setReviewError(false); setReviewAttempt((n) => n + 1) }}>{t('refresh')}</Button></div> : !currentReview ? <p className="text-soft">{t('panel.reviewLoading')}</p> : <>
            <p className="text-soft">{currentReview.company} · {currentReview.journal || t('panel.noJournal')}</p>
            {currentReview.ready ? <p className="text-success-ink">{t('panel.reviewReady')}</p> : <ul className="list-disc pl-4 space-y-1 text-danger-ink">{currentReview.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
          </>}
        </section>}
        <p className="text-[12px] leading-relaxed text-soft">{t('panel.accountingHint')}</p>
        {issued?.name && <p role="status" className="text-[14px] text-success-ink">{t('panel.issued', { name: issued.name })}</p>}
        {state === 'error' && <p role="alert" className="text-[14px] text-danger-ink">{saveError}</p>}
        {issued && <AccountingDetail key={issued.id} invoiceId={issued.id} />}
        {issued ? pdfLink(issued.id) : <Button variant="primary" size="money" onClick={issue} disabled={!ready || state === 'saving' || loadingLines || linesError}><Icon name="billing" size={20} />{state === 'saving' ? t('panel.issuing') : t('panel.issue')}</Button>}
      </div>
    </div>
  )
}
