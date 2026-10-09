'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { StatusPill } from '@/components/kit/StatusPill'
import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { billingDate } from '@/lib/domain/billing'
import { formatCop } from '@/lib/domain/money'
import { accountingDetail, type AccountingDetail as Detail } from '@/lib/services/invoices'

export function AccountingDetail({ invoiceId }: { invoiceId: number }) {
  const t = useTranslations('admin.billing.accounting')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    void accountingDetail(invoiceId).then((data) => { if (alive) setDetail(data) }).catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [invoiceId, attempt])
  if (error) return <div role="alert" className="p-5 text-sm text-danger-ink">{t('loadError')}<Button size="compact" className="mt-2" onClick={() => { setError(false); setDetail(null); setAttempt((n) => n + 1) }}>{t('retry')}</Button></div>
  if (!detail) return <p role="status" className="px-5 py-3 text-sm text-soft">{t('loading')}</p>
  const money = (value: number, currency = detail.currency) => `${currency} ${formatCop(value)}`
  return <section className="px-5 pb-5 space-y-4" aria-label={t('title')}>
    <div className="space-y-2">
      <StatusPill tone={detail.ready ? 'success' : 'progress'}>{t(detail.ready ? 'checked' : 'needsReview')}</StatusPill>
      <p className="text-xs text-soft leading-relaxed">{t('scope')}</p>
      {detail.issues.length > 0 && <ul className="list-disc pl-4 text-sm text-danger-ink space-y-1">{detail.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
    </div>
    <dl className="text-sm space-y-2">
      {[['company', detail.company], ['journal', detail.journal], ['date', billingDate(detail.date)], ['origin', detail.origin || '—'], ...(detail.original ? [['original', detail.original]] : [])].map(([key, value]) => <div key={key}><dt className="text-soft">{t(key)}</dt><dd className="text-ink break-words">{value}</dd></div>)}
    </dl>
    <dl className="rounded-md bg-muted p-4 text-sm space-y-2">
      {/* `untaxed` del servidor ya deja la propina fuera de la base (va aparte y sin impuestos): no se resta otra vez. */}
      <div className="flex justify-between gap-2"><dt>{t('netSales')}</dt><dd className="tabular">{money(detail.untaxed)}</dd></div>
      {detail.taxes.map((tax) => <div key={tax.id} className="flex justify-between gap-2 text-soft"><dt>{tax.name}</dt><dd className="tabular whitespace-nowrap">{money(tax.amount)}</dd></div>)}
      <div className="flex justify-between gap-2"><dt>{t('tax')}</dt><dd className="tabular">{money(detail.tax)}</dd></div>
      <div className="flex justify-between gap-2"><dt>{t('tip')}</dt><dd className="tabular">{money(detail.tip)}</dd></div>
      <div className="flex justify-between gap-2 border-t border-border pt-2 font-semibold"><dt>{t('total')}</dt><dd className="tabular">{money(detail.total)}</dd></div>
      <div className="flex justify-between gap-2 text-soft"><dt>{t('residual')}</dt><dd className="tabular">{money(detail.residual)}</dd></div>
    </dl>
    <details className="group rounded-lg border border-border p-3">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="chevronDown" size={18} className="shrink-0 group-open:rotate-180" />{t('entries')}</summary>
      <p className="text-xs text-soft mt-2">{t('entryCurrency', { currency: detail.companyCurrency })}</p>
      <ul className="divide-y divide-border mt-2">{detail.lines.map((line) => <li key={line.id} className="py-3 text-xs space-y-1">
        <p className="font-semibold text-ink">{line.account}</p><p className="text-soft break-words">{line.label}</p>
        <div className="flex justify-between gap-2 tabular"><span>{t('debit')} {formatCop(line.debit)}</span><span>{t('credit')} {formatCop(line.credit)}</span></div>
      </li>)}</ul>
      <dl className="border-t border-border pt-3 text-sm tabular space-y-1"><div className="flex justify-between"><dt>{t('debit')}</dt><dd>{money(detail.debit, detail.companyCurrency)}</dd></div><div className="flex justify-between"><dt>{t('credit')}</dt><dd>{money(detail.credit, detail.companyCurrency)}</dd></div></dl>
    </details>
    <div className="border-t border-border pt-3 text-sm"><p className="font-semibold text-soft">{t('dianPending')}</p><p className="text-xs text-soft mt-1">{t('dianHint')}</p></div>
  </section>
}
