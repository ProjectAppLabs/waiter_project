'use client'

import { imageUrl } from '@/lib/services/pantry'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'
import { additionNames, lineSubtotal, type CartLine, type CartTotals, type CustomerInfo } from '@/lib/domain/orderWizard'

interface Props { info: CustomerInfo; tableNumber: number | null; lines: CartLine[]; totals: CartTotals; busy: boolean; error: string | null; onConfirm: () => void }

function Row({ icon, label, children }: { icon: KitIcon; label: string; children: ReactNode }) {
  return (
    <div className="py-4 border-b border-border">
      <dt className="flex items-center gap-2 text-[15px] text-soft"><Icon name={icon} size={17} />{label}</dt>
      <dd className="mt-1 text-[16px] font-semibold text-ink">{children}</dd>
    </div>
  )
}

// Paso 4 del kit (Customer Informations.png): tarjetas de plato con nota/adición y xN, datos del cliente y totales.
export function SummaryStep({ info, tableNumber, lines, totals, busy, error, onConfirm }: Props) {
  const t = useTranslations('orders.create')
  return (
    <div className="h-full p-4">
      <div className="h-full bg-surface border border-border rounded-lg flex flex-col overflow-hidden">
        <header className="h-[70px] px-5 flex items-center gap-2 border-b border-border shrink-0">
          <Icon name="user" size={20} className="text-soft" /><h1 className="text-[18px] font-semibold text-ink">{t('summaryTitle')}</h1>
        </header>

        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 flex flex-col border-r border-border">
            <ul className="flex-1 min-h-0 overflow-auto p-5 grid grid-cols-2 auto-rows-min gap-4">
              {lines.map((line) => (
                <li key={line.uuid} className="rounded-md border border-border overflow-hidden flex flex-col">
                  <div className="p-3 flex items-start gap-3">
                    <span className="w-[80px] h-[60px] rounded-sm bg-muted overflow-hidden grid place-items-center text-dim shrink-0">
                      {line.hasImage
                        ? <img src={imageUrl(line.templateId)} alt={t('photo', { name: line.name })} className="w-full h-full object-cover" />
                        : <Icon name="photo" size={20} />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-ink truncate">{line.name}</p>
                      {line.note && <p className="text-[13px] text-dim truncate">{t('note')} {line.note}</p>}
                      {line.options.length > 0 && <p className="text-[13px] text-dim truncate">{t('addition')} {additionNames(line)}</p>}
                    </div>
                  </div>
                  <div className="px-3 py-2.5 border-t border-border flex items-center justify-between">
                    <span className="text-[15px] font-semibold text-ink tabular-nums">$ {formatCop(lineSubtotal(line))}</span>
                    <span className="h-7 px-2.5 rounded-sm border border-border text-[13px] font-semibold text-soft grid place-items-center">x{line.qty}</span>
                  </div>
                </li>
              ))}
            </ul>
            <dl className="shrink-0 border-t border-border bg-canvas px-6 py-4 flex flex-col gap-2 text-[15px]">
              <div className="flex justify-between"><dt className="text-soft">{t('subtotal')}</dt><dd className="text-ink tabular-nums">$ {formatCop(totals.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-soft">{totals.taxNames.length ? t('taxNamed', { name: totals.taxNames.join(' · ') }) : t('tax')}</dt><dd className="text-ink tabular-nums">$ {formatCop(totals.tax)}</dd></div>
              <div className="pt-2 border-t border-dashed border-border flex justify-between items-baseline"><dt className="font-semibold text-ink">{t('totalPayment')}</dt><dd className="text-[22px] font-bold text-ink tabular-nums">$ {formatCop(totals.total)}</dd></div>
            </dl>
          </div>

          <div className="w-[420px] shrink-0 flex flex-col">
            <dl className="flex-1 min-h-0 overflow-auto px-6">
              <Row icon="orders" label={t('summaryOrderType')}>{t(`types.${info.type}`)}</Row>
              {info.type === 'dineIn' && <Row icon="tables" label={t('tableNumber')}>{tableNumber === null ? '—' : t('tableLabel', { n: tableNumber })}</Row>}
              <Row icon="hash" label={t('peopleLabel')}>{info.people}</Row>
              <Row icon="user" label={t('customerName')}>{info.name.trim() || '—'}</Row>
              <Row icon="babyChair" label={t('babyChair')}>{info.babyChair ? t('yes') : t('no')}</Row>
              {info.type === 'delivery' && <Row icon="mapPin" label={t('summaryDelivery')}>{info.address}</Row>}
              {info.type === 'delivery' && <Row icon="phone" label={t('summaryPhone')}>{info.phone}</Row>}
            </dl>
            <div className="shrink-0 p-6 flex flex-col gap-3">
              {error && <p role="alert" className="text-[14px] text-danger-ink">{error}</p>}
              <Button variant="primary" className="w-full rounded-md" disabled={busy || lines.length === 0} onClick={onConfirm}>
                {busy ? t('creating') : info.type === 'dineIn' ? t('createAndSend') : t('continueToPayment')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
