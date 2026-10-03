'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

import { PrintableReceipt } from '@/components/pay/PrintableReceipt'
import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { PageTitle } from '@/components/ui/PageHeader'
import { formatCop } from '@/lib/domain/money'
import { provisionalCount } from '@/lib/offline/count'
import { useEmergencyOrders, type EmergencyOrder } from '@/lib/offline/emergency'
import { useOutboxStore } from '@/lib/offline/outbox'
import { printReceipt } from '@/lib/print/settings'
import { closingData } from '@/lib/services/cashRegister'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import type { ReceiptData } from '@/lib/stores/orderStore'

const precheck = (o: EmergencyOrder, company: string): ReceiptData => ({
  company, tableNumber: o.tableNumber ?? 0, reference: o.number, at: Date.parse(o.createdAt),
  lines: o.lines.map((l) => ({ uuid: l.uuid, name: l.name, qty: l.qty, unitPrice: l.unitPrice, total: l.total })),
  subtotal: o.total - o.tax, tax: o.tax, tip: 0, total: o.total, payments: [], change: 0,
})

// Plan V: los pedidos de la caja sin conexión, con su número provisional y, ya sincronizados, el del servidor; la
// precuenta de cada uno y el arqueo provisional de la caja.
export default function EmergenciaPage() {
  const t = useTranslations('pos.offline.page')
  const company = useCatalogStore((s) => s.catalog?.company.name ?? '')
  const session = useAuthStore((s) => s.session)
  const orders = useEmergencyOrders((s) => s.orders)
  const entries = useOutboxStore((s) => s.entries)
  const [base, setBase] = useState<number | null>(null)
  const [printing, setPrinting] = useState<ReceiptData | 'count' | null>(null)
  useEffect(() => { useEmergencyOrders.getState().hydrate() }, [])
  // El efectivo esperado según el servidor la última vez que respondió (guardado para leerlo sin red).
  useEffect(() => { if (session) void closingData(session.id).then((c) => setBase(c.expectedCash)).catch(() => setBase(null)) }, [session])
  const today = new Date().toLocaleDateString('en-CA')
  const list = useMemo(() => orders.filter((o) => o.createdAt.slice(0, 10) >= today || !o.serverId).slice().reverse(), [orders, today])
  const count = provisionalCount(base ?? 0, entries, session?.id ?? null)
  useEffect(() => {
    if (!printing) return
    const frame = requestAnimationFrame(() => { printReceipt(); setPrinting(null) })
    return () => cancelAnimationFrame(frame)
  }, [printing])

  const row = (label: string, value: number, strong = false) => (
    <div className={strong ? 'flex justify-between text-[17px] font-semibold text-ink' : 'flex justify-between text-[15px] text-soft'}><span>{label}</span><span className="tabular">$ {formatCop(value)}</span></div>
  )
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
      <div className="flex items-center gap-4"><PageTitle>{t('title')}</PageTitle>
        <Link href="/pedidos/nuevo" className="ml-auto h-11 px-4 rounded-md bg-primary text-primary-ink text-[15px] font-bold inline-flex items-center gap-2"><Icon name="plus" size={18} />{t('new')}</Link></div>
      <p className="text-[14px] text-soft">{t('hint')}</p>
      <section aria-label={t('orders')} className="rounded-lg border border-border bg-surface">
        {list.length === 0 ? <p className="p-4 text-soft">{t('empty')}</p> : (
          <ul className="divide-y divide-border">
            {list.map((o) => (
              <li key={o.uuid} className="p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-[160px]">
                  <p className="text-[16px] font-semibold text-ink">{o.number}{o.serverNumber && <span className="text-soft font-normal"> → {o.serverNumber}</span>}</p>
                  <p className="text-[13px] text-soft">{o.tableNumber !== null ? t('table', { n: o.tableNumber }) : o.customer || t('takeout')}</p>
                </div>
                <span className="text-[15px] tabular">$ {formatCop(o.total)}</span>
                <span className="text-[13px] font-semibold px-2 h-6 rounded-sm grid place-items-center bg-muted text-ink">{t(o.serverId ? 'synced' : o.paid ? 'paid' : 'open')}</span>
                <div className="ml-auto flex gap-2">
                  <Button size="compact" onClick={() => setPrinting(precheck(o, company))}><Icon name="printer" size={16} />{t('precheck')}</Button>
                  {!o.paid && !o.serverId && <Link href={`/pedidos/${o.localId}/agregar`} className="h-9 px-3 rounded-md border border-border text-[14px] font-semibold inline-flex items-center gap-1"><Icon name="plus" size={16} />{t('round')}</Link>}
                  {!o.paid && !o.serverId && <Link href={`/pago/${o.localId}`} className="h-9 px-3 rounded-md bg-primary text-primary-ink text-[14px] font-semibold inline-flex items-center gap-1"><Icon name="money" size={16} />{t('charge')}</Link>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label={t('count')} className="rounded-lg border border-border bg-surface p-4 flex flex-col gap-2 max-w-xl">
        <h2 className="text-[17px] font-semibold text-ink">{t('count')}</h2>
        <p className="text-[13px] text-soft">{t('countHint')}</p>
        {row(t('base'), count.base)}
        {row(t('cashSales'), count.cashSales)}
        {row(t('cashIn'), count.cashIn)}
        {row(t('cashOut'), -count.cashOut)}
        {row(t('expected'), count.expected, true)}
        {row(t('otherSales'), count.otherSales)}
        <Button className="self-start mt-2" onClick={() => setPrinting('count')}><Icon name="printer" size={18} />{t('printCount')}</Button>
      </section>
      {printing && printing !== 'count' && <PrintableReceipt data={printing} />}
      {printing === 'count' && (
        <div aria-hidden className="receipt fixed -left-[9999px] top-0 w-[320px]">
          <p><strong>{company}</strong></p><p>{t('countTitle')} · {new Date().toLocaleString('es-CO')}</p>
          <p>{t('base')}: $ {formatCop(count.base)}</p><p>{t('cashSales')}: $ {formatCop(count.cashSales)}</p>
          <p>{t('cashIn')}: $ {formatCop(count.cashIn)}</p><p>{t('cashOut')}: $ {formatCop(count.cashOut)}</p>
          <p><strong>{t('expected')}: $ {formatCop(count.expected)}</strong></p><p>{t('otherSales')}: $ {formatCop(count.otherSales)}</p>
          <p>{t('countFoot')}</p>
        </div>
      )}
    </div>
  )
}
