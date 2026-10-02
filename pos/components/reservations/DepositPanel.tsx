'use client'

import { serverDate } from '@/lib/domain/time'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { StatusPill, type PillTone } from '@/components/kit/StatusPill'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatCop } from '@/lib/domain/money'
import { depositMessage, whatsappNumber, type DepositState } from '@/lib/domain/reservations'
import { markDepositPaid, setDeposit, type ReservationDetail } from '@/lib/services/reservations'

const TONE: Record<DepositState, PillTone> = { none: 'neutral', pending: 'progress', paid: 'success' }

// Anticipo de una reserva. Pendiente: el enlace de pago y tres formas de hacérselo llegar al cliente (copiar, WhatsApp,
// correo), más registrar un pago hecho por fuera o quitar el costo. Pagado: cuándo y con qué referencia.
// El enlace lo arma Odoo (`payUrl`); abre la página de pago del menú del restaurante, con su marca.
export function DepositPanel({ reservation, onChanged }: { reservation: ReservationDetail; onChanged: (next: ReservationDetail) => void }) {
  const t = useTranslations('reservations.detail')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  if (reservation.depositState === 'none') return null
  const link = reservation.payUrl
  const message = depositMessage({ customerName: reservation.customerName, date: reservation.date, label: reservation.label, people: reservation.people, amount: reservation.depositAmount }, reservation.restaurantName || 'el restaurante', link, (n) => `$ ${formatCop(n)}`)
  const phone = whatsappNumber(reservation.customerPhone)
  const run = async (action: () => Promise<ReservationDetail>) => {
    setBusy(true); setError('')
    try { onChanged(await action()) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch { setError(link) }
  }
  const active = reservation.state === 'confirmed' || reservation.state === 'seated'
  return (
    <section aria-label={t('deposit')} className="px-6 py-4 border-b border-border flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Icon name="banknote" size={18} />{t('deposit')}</h3>
        <span className="text-[18px] font-semibold text-ink tabular">{formatCop(reservation.depositAmount)}</span>
        <StatusPill tone={TONE[reservation.depositState]} icon={reservation.depositState === 'paid' ? 'check' : 'clock'} className="ml-auto">{t(`depositState.${reservation.depositState}`)}</StatusPill>
      </div>
      {reservation.depositState === 'paid' ? (
        <p className="text-[14px] text-soft">
          {reservation.depositPaidAt && t('depositPaidAt', { date: serverDate(reservation.depositPaidAt).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}
          {reservation.depositReference && <span className="block font-mono text-[13px] text-dim">{t('depositReference', { reference: reservation.depositReference })}</span>}
        </p>
      ) : !link ? <p role="alert" className="text-[14px] text-danger-ink">{t('linkUnavailable')}</p> : (
        <>
          <div>
            <p className="text-[14px] font-semibold text-ink">{t('shareTitle')}</p>
            <p className="text-[13px] leading-relaxed text-soft">{t('shareHint')}</p>
          </div>
          <div className="flex items-center gap-2 h-11 pl-3 pr-1 rounded-md border border-border bg-muted">
            <span className="flex-1 min-w-0 truncate font-mono text-[13px] text-soft" title={link}>{link}</span>
            <a href={link} target="_blank" rel="noopener noreferrer" className="h-9 px-3 rounded-sm flex items-center gap-1.5 text-[13px] font-semibold text-soft hover:bg-surface"><Icon name="expand" size={14} />{t('open')}</a>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button size="compact" variant={copied ? 'primary' : 'secondary'} onClick={() => void copy()}><Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? t('copied') : t('copy')}</Button>
            {phone
              ? <a href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="h-tap-min px-4 rounded-md border border-border bg-surface inline-flex items-center justify-center gap-2 text-[15px] font-bold text-ink hover:bg-muted"><Icon name="phone" size={16} />WhatsApp</a>
              : <span className="h-tap-min px-2 rounded-md border border-dashed border-border grid place-items-center text-center text-[12px] leading-tight text-dim">{t('noPhone')}</span>}
            <a href={`mailto:${encodeURIComponent(reservation.customerEmail)}?subject=${encodeURIComponent(t('emailSubject', { restaurant: reservation.restaurantName || '' }))}&body=${encodeURIComponent(message)}`} className="h-tap-min px-4 rounded-md border border-border bg-surface inline-flex items-center justify-center gap-2 text-[15px] font-bold text-ink hover:bg-muted"><Icon name="mail" size={16} />{t('email')}</a>
          </div>
          {active && <div className="flex items-center gap-4 text-[14px] font-semibold">
            <button type="button" disabled={busy} onClick={() => setConfirming(true)} className="text-primary disabled:opacity-40">{t('markPaid')}</button>
            <button type="button" disabled={busy} onClick={() => void run(() => setDeposit(reservation.id, 0))} className="text-soft disabled:opacity-40">{t('removeDeposit')}</button>
          </div>}
        </>
      )}
      {error && <p role="alert" className="text-[13px] text-danger-ink break-all">{error}</p>}
      <ConfirmDialog open={confirming} title={t('markPaid')} body={t('markPaidConfirm')} confirmLabel={t('markPaid')} cancelLabel={t('cancel')}
        onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); void run(() => markDepositPaid(reservation.id)) }} />
    </section>
  )
}
