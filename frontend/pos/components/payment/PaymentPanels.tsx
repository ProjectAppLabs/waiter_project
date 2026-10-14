'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { NumericKeypad } from '@/components/kit/NumericKeypad'
import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'
import { amountOf, appendDigit, backspace, canPayCash, cashChange, formatCountdown, QUICK_AMOUNTS } from '@/lib/domain/paymentKit'
import { qrSvg } from '@/lib/domain/qr'

// Temporizador del kit ("Complete payment in 00h 24m 54s"): cuenta atrás viva contra la hora límite del cobro.
export function Countdown({ deadline }: { deadline: number }) {
  const t = useTranslations('payment')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  const left = deadline - now
  return (
    <div className="h-14 px-4 rounded-t-lg bg-muted border border-border flex items-center justify-between">
      <span className="text-[15px] text-soft">{t('completeIn')}</span>
      <span className="text-[14px] font-semibold text-danger-ink tabular-nums">{formatCountdown(left)}</span>
    </div>
  )
}

function TotalBox({ amount }: { amount: number }) {
  const t = useTranslations('payment')
  return (
    <div className="h-14 px-4 rounded-md border border-border bg-canvas flex items-center justify-between">
      <span className="text-[16px] text-ink">{t('totalPayment')}</span>
      <span className="text-[18px] font-bold text-ink tabular-nums">$ {formatCop(amount)}</span>
    </div>
  )
}

// Pestaña Efectivo: display, montos rápidos en COP, teclado del kit y "Pagar ahora".
export function CashPanel({ due, text, onText, onPay, busy }: { due: number; text: string; onText: (t: string) => void; onPay: (received: number) => void; busy: boolean }) {
  const t = useTranslations('payment')
  const received = text === '' ? 0 : amountOf(text)
  const ok = canPayCash(received, due)
  return (
    // El contenedor de arriba ya hace scroll: con `flex-1 min-h-0` este panel encogía por debajo de su
    // contenido y el teclado se desbordaba bajo el bloque siguiente, que se comía los toques (teclas muertas).
    <div className="flex flex-col items-center gap-4 px-6 py-5">
      <div className="text-center">
        <p className="text-[18px] font-semibold text-ink">{t('inputMoney')}</p>
        <p className="text-[14px] text-dim">{t('inputMoneyBody')}</p>
      </div>
      <p aria-label={t('amountLabel')} className="text-[34px] font-bold text-ink tabular-nums">
        <span className="text-soft">$</span>{text === '' ? <span className="text-dim">0</span> : formatCop(received)}
      </p>
      <div className="flex gap-2 flex-wrap justify-center">
        {QUICK_AMOUNTS.map((a) => (
          <button key={a} type="button" onClick={() => onText(String(a))}
            className="h-11 px-4 rounded-md border border-border bg-surface text-[15px] font-semibold text-ink tabular-nums">{formatCop(a)}</button>
        ))}
      </div>
      <NumericKeypad onDigit={(d) => onText(appendDigit(text, d))} onBackspace={() => onText(backspace(text))} />
      <div className="mt-auto w-full flex flex-col gap-2">
        {received > due && <p className="text-[14px] text-soft text-center">{t('change')} $ {formatCop(cashChange(received, due))}</p>}
        {text !== '' && !ok && <p role="alert" className="text-[14px] text-danger-ink text-center">{t('insufficient')}</p>}
        <Button variant="primary" size="money" className="w-full rounded-md" disabled={!ok || busy} onClick={() => onPay(received)}>{busy ? t('paying') : t('payNow')}</Button>
      </div>
    </div>
  )
}

// Pestaña Tarjeta: temporizador, total y "Confirmar pago"; luego el datáfono manual (lib/payments/terminal.ts).
export function CardPanel({ due, deadline, stage, onConfirm, onResult, busy }: {
  due: number; deadline: number; stage: 'idle' | 'terminal'; onConfirm: () => void; onResult: (approved: boolean, reference: string) => void; busy: boolean
}) {
  const t = useTranslations('payment')
  const [reference, setReference] = useState('')
  return (
    <div className="px-6 py-5">
      <Countdown deadline={deadline} />
      <div className="p-4 rounded-b-lg border-x border-b border-border bg-surface flex flex-col gap-4">
        {stage === 'idle' ? (
          <>
            <TotalBox amount={due} />
            <Button variant="primary" size="money" className="w-full rounded-md" disabled={busy} onClick={onConfirm}>{t('confirmPay')}</Button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Icon name="terminal" size={56} className="text-primary" />
              <p className="text-[18px] font-semibold text-ink">{t('edcTitle')}</p>
              <p className="text-[14px] text-dim">{t('edcBody', { amount: `$ ${formatCop(due)}` })}</p>
            </div>
            <TotalBox amount={due} />
            <label className="flex flex-col gap-1.5">
              <span className="text-[14px] text-soft">{t('voucher')}</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)}
                className="h-12 px-3.5 rounded-md border border-border bg-surface text-[15px] text-ink focus:outline-2 focus:outline-primary" />
            </label>
            <div className="flex gap-3">
              <Button variant="primary" className="flex-1 rounded-md" disabled={busy} onClick={() => onResult(true, reference.trim())}>{t('approved')}</Button>
              <Button variant="destructive" className="rounded-md" disabled={busy} onClick={() => onResult(false, '')}>{t('declined')}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Pestaña QR: el código se dibuja en el navegador (lib/domain/qr.ts); "Confirmar pago" verifica 2 s y cobra.
export function QrPanel({ due, deadline, company, payload, checking, onConfirm, busy }: {
  due: number; deadline: number; company: string; payload: string; checking: boolean; onConfirm: () => void; busy: boolean
}) {
  const t = useTranslations('payment')
  const svg = useMemo(() => { try { return qrSvg(payload) } catch { return '' } }, [payload])
  return (
    <div className="px-6 py-5">
      <Countdown deadline={deadline} />
      <div className="p-4 rounded-b-lg border-x border-b border-border bg-surface flex flex-col gap-4">
        <p className="text-center text-[17px] font-semibold text-ink">{company}</p>
        <div className="grid place-items-center min-h-[188px]">
          {checking
            ? <p className="flex flex-col items-center gap-2 text-[15px] font-semibold text-success-ink"><Icon name="loader" size={26} className="animate-spin" />{t('checking')}</p>
            /* El QR va siempre oscuro sobre blanco: invertido en modo oscuro los lectores no lo cogen. */
            : <span role="img" aria-label={t('methods.qr')} className="w-[188px] h-[188px] rounded-sm bg-white text-black [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />}
        </div>
        <TotalBox amount={due} />
        <p className="text-[13px] text-dim text-center">{t('qrHint')}</p>
        <Button variant="primary" size="money" className="w-full rounded-md" disabled={checking || busy} onClick={onConfirm}>{t('confirmPay')}</Button>
      </div>
    </div>
  )
}
