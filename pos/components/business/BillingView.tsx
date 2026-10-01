'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { InvoicePanel, type Selection } from '@/components/billing/InvoicePanel'
import { BillingSettings } from '@/components/billing/BillingSettings'
import { Card } from '@/components/kit/Card'
import { Icon } from '@/components/kit/Icon'
import { Chip } from '@/components/kit/Chip'
import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { ListSkeleton } from '@/components/kit/Skeleton'
import { StatusPill } from '@/components/kit/StatusPill'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { ScrollTable } from '@/components/ui/ScrollTable'
import { Select } from '@/components/ui/Select'
import { billingDate } from '@/lib/domain/billing'
import { formatCop } from '@/lib/domain/money'
import { getInvoice, invoiceOrder, listInvoices, listPaidOrders, type Invoice, type InvoiceableOrder } from '@/lib/services/invoices'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { cn } from '@/lib/utils'

type Tab = 'pending' | 'invoices'
const PAGE_SIZE = 20

const STATE_TONE = { draft: 'neutral', posted: 'info', cancel: 'danger' } as const

export function BillingView() {
  const t = useTranslations('admin.billing')
  const catalog = useCatalogStore((s) => s.catalog)
  const [tab, setTab] = useState<Tab>('pending')
  const [query, setQuery] = useState('')
  const [methodId, setMethodId] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [orders, setOrders] = useState<InvoiceableOrder[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [settledKey, setSettledKey] = useState('')
  const [error, setError] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [selection, setSelection] = useState<Selection>(null)
  const requestKey = JSON.stringify([tab, query, methodId, page, refresh])
  const loading = settledKey !== requestKey
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      setError(false)
      const filters = { offset: page * PAGE_SIZE, query }
      const work = tab === 'pending'
        ? listPaidOrders(PAGE_SIZE + 1, { ...filters, pendingOnly: true, paymentMethodId: methodId }).then((rows) => { if (alive) setOrders(rows.slice(0, PAGE_SIZE)); return rows.length })
        : listInvoices(PAGE_SIZE + 1, filters).then((rows) => { if (alive) setInvoices(rows.slice(0, PAGE_SIZE)); return rows.length })
      void work.then((count) => { if (alive) setHasMore(count > PAGE_SIZE) }).catch(() => { if (alive) setError(true) }).finally(() => { if (alive) setSettledKey(requestKey) })
    }, 200)
    return () => { alive = false; clearTimeout(timer) }
  }, [tab, query, methodId, page, refresh, requestKey])
  const resetSelection = () => { setPage(0); setSelection(null) }
  const changeTab = (next: Tab) => { setTab(next); setQuery(''); setMethodId(null); resetSelection() }
  const tableNumberOf = (id: number | null) => id === null ? null : catalog?.tables.find((tb) => tb.id === id)?.number ?? null
  const count = tab === 'pending' ? orders.length : invoices.length
  const cell = 'px-4 py-4 align-middle'
  const headers = tab === 'pending' ? ['order', 'customer', 'payment', 'total', 'action'] : ['number', 'customer', 'state', 'total', 'action']
  return (
    <>
      <PageHeader title={t('title')}>
        <Chip label={t('tabs.pending')} active={tab === 'pending'} onClick={() => changeTab('pending')} />
        <Chip label={t('tabs.invoices')} active={tab === 'invoices'} onClick={() => changeTab('invoices')} />
      </PageHeader>
      <div className="px-5 pb-4 shrink-0 space-y-2">
        <details className="group rounded-lg border border-border bg-surface/70 px-4 py-3 text-[13px] text-soft">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center gap-2 font-semibold text-ink"><Icon name="chevronDown" size={18} className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />{t('dian.title')} <span className="font-normal text-soft">· {t('dian.status')}</span></summary>
          <div className="pt-3 grid gap-2 max-w-4xl leading-relaxed">
            <p>{t('dian.current')}</p><p>{t('dian.rule')}</p><p>{t('dian.customer')}</p>
            <a href="https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0227_2025.htm" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{t('dian.source')}</a>
          </div>
        </details>
      </div>
      <div className="px-5 pb-4 flex flex-wrap items-end gap-3 shrink-0">
        <SearchInput value={query} onChange={(value) => { setQuery(value); resetSelection() }} placeholder={t('search')} className="w-[320px] max-w-full" />
        {tab === 'pending' && <label className="flex items-center gap-2 text-[13px] text-soft"><span className="shrink-0">{t('cols.payment')}</span>
          <span className="w-[200px]"><Select value={methodId ?? ''} onChange={(e) => { setMethodId(e.target.value ? Number(e.target.value) : null); resetSelection() }}>
            <option value="">{t('allMethods')}</option>
            {catalog?.paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
          </Select></span>
        </label>}
        {catalog?.settings?.configId && <BillingSettings key={catalog.settings.configId} configId={catalog.settings.configId} onSaved={() => { setSelection(null); setRefresh((n) => n + 1) }} />}
        <Button size="compact" onClick={() => setRefresh((n) => n + 1)} disabled={loading} className="ml-auto">{t('refresh')}</Button>
      </div>
      <div className="flex-1 min-h-0 flex gap-4 px-5 pb-5">
        <Card className="flex-1 min-w-0 overflow-hidden">
          <div className="h-full min-h-0 flex flex-col">
            <div className="px-4 py-3 border-b border-border shrink-0">
              <h2 className="font-semibold text-ink">{t(tab === 'pending' ? 'pendingTitle' : 'invoicesTitle')}</h2>
              <p className="mt-1 text-[13px] text-soft">{t(tab === 'pending' ? 'pendingHint' : 'invoicesHint')}</p>
            </div>
            {loading ? <ListSkeleton rows={5} /> : error ? <div role="alert" className="p-5 text-danger-ink">{t('loadError')}</div> : count === 0 ? <KitEmptyState icon="billing" title={t('emptyResults')} body={t('emptyHint')} /> : (
              <ScrollTable label="las ventas" className="flex-1 min-h-0" boxClassName="flex-1 min-h-0 overflow-y-auto">
                <table className="data-table text-left text-[14px]">
                  <caption className="sr-only">{t(tab === 'pending' ? 'pendingTitle' : 'invoicesTitle')}</caption>
                  <thead className="sticky top-0 z-10 bg-surface text-soft text-[12px]">
                    <tr>{headers.map((key) => <th key={key} scope="col" className="px-4 py-3 border-b border-border font-semibold">{t(`cols.${key}`)}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {tab === 'pending' && orders.map((order) => (
                      <tr key={order.id} className={cn(selection?.kind === 'order' && selection.order.id === order.id ? 'bg-primary-soft' : 'hover:bg-muted/50')}>
                        <td className={cell}><p className="font-semibold text-ink">{order.reference || `#${order.id}`}</p><p className="mt-1 text-[12px] text-soft">{billingDate(order.date, true)}</p></td>
                        <td className={cell}><p className="text-ink">{order.partnerName || t('noCustomer')}</p><p className="mt-1 text-[12px] text-soft">{tableNumberOf(order.tableId) !== null ? t('tableName', { number: tableNumberOf(order.tableId)! }) : order.tableId !== null ? t('tableAssigned') : t('noTable')}</p></td>
                        <td className={cell}><p className="text-ink">{order.payments.map((p) => p.method).join(' + ') || t('unknownPayment')}</p>{order.payments.length > 1 && <p className="mt-1 text-[12px] text-soft">{t('mixedPayment')}</p>}</td>
                        <td className={cn(cell, 'font-semibold text-ink tabular whitespace-nowrap')}>$&nbsp;{formatCop(order.total)}</td>
                        <td className={cell}><Button size="compact" aria-label={t('reviewOrder', { reference: order.reference || String(order.id) })} aria-pressed={selection?.kind === 'order' && selection.order.id === order.id} onClick={() => setSelection({ kind: 'order', order })}>{t('review')}</Button></td>
                      </tr>
                    ))}
                    {tab === 'invoices' && invoices.map((invoice) => (
                      <tr key={invoice.id} className={cn(selection?.kind === 'invoice' && selection.invoice.id === invoice.id ? 'bg-primary-soft' : 'hover:bg-muted/50')}>
                        <td className={cell}><p className="font-semibold text-ink">{invoice.name}</p>{invoice.type === 'out_refund' && <p className="text-xs text-soft">{t('creditNote')}</p>}<p className="mt-1 text-[12px] text-soft">{billingDate(invoice.date)}</p></td>
                        <td className={cn(cell, 'text-ink')}>{invoice.partner || t('noCustomer')}</td>
                        <td className={cell}><StatusPill tone={STATE_TONE[invoice.state as keyof typeof STATE_TONE] ?? 'neutral'}>{['draft', 'posted', 'cancel'].includes(invoice.state) ? t(`state.${invoice.state}`) : t('unknownState')}</StatusPill><p className="mt-1 text-[12px] text-soft">{t(`paymentState.${['not_paid', 'in_payment', 'paid', 'partial', 'reversed', 'blocked', 'invoicing_legacy'].includes(invoice.paymentState) ? invoice.paymentState : 'unknown'}`)}</p></td>
                        <td className={cn(cell, 'font-semibold text-ink tabular whitespace-nowrap')}>$ {formatCop(invoice.type === 'out_refund' ? -invoice.total : invoice.total)}</td>
                        <td className={cell}><Button size="compact" aria-label={t('viewInvoice', { name: invoice.name })} onClick={() => setSelection({ kind: 'invoice', invoice })}>{t('view')}</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            )}
            <div className="mt-auto shrink-0 px-4 py-3 border-t border-border flex items-center justify-between gap-3 text-[13px] text-soft">
              <span>{t('page', { page: page + 1 })}{!loading && !error ? ` · ${t('rows', { count })}` : ''}</span>
              <div className="flex gap-2"><Button size="compact" disabled={loading || page === 0} onClick={() => { setPage((n) => n - 1); setSelection(null) }}>{t('previous')}</Button><Button size="compact" disabled={loading || error || !hasMore} onClick={() => { setPage((n) => n + 1); setSelection(null) }}>{t('next')}</Button></div>
            </div>
          </div>
        </Card>
        {selection && <InvoicePanel selection={selection} onClose={() => setSelection(null)} tableNumber={selection.kind === 'order' ? tableNumberOf(selection.order.tableId) : null}
          onIssue={async (orderId, partnerId) => {
            const id = await invoiceOrder(orderId, partnerId)
            setRefresh((n) => n + 1)
            const invoice = await getInvoice(id).catch(() => null)
            return { id, name: invoice?.name ?? String(id) }
          }} />}
      </div>
    </>
  )
}
