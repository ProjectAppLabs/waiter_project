'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import type { CodeProps } from '@/components/templates/types'

export const CODE_LENGTH = 6
export const RESEND_SECONDS = 38
const pad = (n: number) => `0:${String(n).padStart(2, '0')}`

// Código · patrón «casillas» (Cuenta 4a-2): ← y «Verifica que eres tú», texto con el correo, seis casillas en mono (pegar rellena
// las seis), «Reenviar en 0:38» y «Usar mi celular», avisos, y «Confirmar código» apagado hasta el sexto dígito.
export function GenericCode({ email, onVerify, onResend, onOtherChannel, onBack, busy, error }: CodeProps) {
  const t = useTranslations('diner.account.code')
  const tc = useTranslations('diner.common')
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [left, setLeft] = useState(RESEND_SECONDS)
  const [resent, setResent] = useState(false)
  const [otherChannel, setOtherChannel] = useState(false)
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const code = digits.join('')
  const complete = code.length === CODE_LENGTH

  useEffect(() => {
    if (left <= 0) return
    const timer = setInterval(() => setLeft((s) => s - 1), 1_000)
    return () => clearInterval(timer)
  }, [left])

  const put = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '')
    // Pegar (o autocompletar) un código entero en cualquier casilla lo reparte desde la primera.
    if (clean.length > 1) {
      const next = Array(CODE_LENGTH).fill('') as string[]
      clean.slice(0, CODE_LENGTH).split('').forEach((d, i) => { next[i] = d })
      setDigits(next)
      refs.current[Math.min(clean.length, CODE_LENGTH) - 1]?.focus()
      return
    }
    setDigits((prev) => { const next = [...prev]; next[index] = clean; return next })
    if (clean && index < CODE_LENGTH - 1) refs.current[index + 1]?.focus()
  }
  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) { e.preventDefault(); refs.current[index - 1]?.focus(); setDigits((prev) => { const next = [...prev]; next[index - 1] = ''; return next }) }
  }
  const resend = () => { onResend(); setLeft(RESEND_SECONDS); setResent(true) }
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (complete && !busy) onVerify(code) }
  const cell = (filled: boolean) => `h-[62px] w-full rounded-t-boton bg-t-superficie text-center font-t-mono text-[24px] text-t-tinta focus:outline-none focus:border-t-acento focus:border-2 ${filled ? 'border-2 border-t-acento' : 'border border-t-borde'}`
  return (
    <form onSubmit={submit} className="px-[18px] pt-[22px] pb-[18px] flex flex-col gap-4 text-t-tinta">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label={tc('back')} className="w-10 h-10 shrink-0 rounded-t-boton border border-t-borde bg-t-superficie grid place-items-center text-[18px]">←</button>
        <h1 className="t-title text-[18px] leading-tight">{t('title')}</h1>
      </div>
      <p className="text-[15px] text-t-tinta-suave">{t('sent', { email })}</p>
      <div role="group" aria-label={t('digits')} className="grid grid-cols-6 gap-2">
        {digits.map((d, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el }} aria-label={t('digit', { n: i + 1 })} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={CODE_LENGTH} value={d} onChange={(e) => put(i, e.target.value)} onKeyDown={(e) => onKeyDown(i, e)} className={cell(d !== '')} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" disabled={left > 0 || busy} onClick={resend} className="h-tap-min text-[14px] font-medium text-t-tinta-suave disabled:opacity-70">
          {left > 0 ? <span className="font-t-mono tabular">{t('resendIn', { time: pad(left) })}</span> : t('resend')}
        </button>
        <button type="button" onClick={() => { setOtherChannel(true); onOtherChannel() }} className="h-tap-min text-[14px] font-medium text-[#A06E2C]">{t('otherChannel')}</button>
      </div>
      {resent && <p role="status" className="text-[14px] text-free-ink">{t('resent')}</p>}
      {otherChannel && <p role="status" className="text-[14px] text-t-tinta-suave">{t('otherChannelHint')}</p>}
      <p className="px-3.5 py-2.5 rounded-t-boton bg-t-superficie border border-t-borde text-[13px] leading-snug text-t-tinta-suave">{t('keep')}</p>
      <p className="px-3.5 py-2.5 rounded-t-boton border border-t-borde text-[13px] leading-snug text-t-tinta-suave">{t('spam')}</p>
      <p className="text-[12px] text-t-tinta-terciaria">{t('once')} {t('demo')}</p>
      {error && <p role="alert" className="px-3.5 py-2.5 rounded-t-boton bg-busy-soft text-busy-ink text-[15px]">{error}</p>}
      <button type="submit" disabled={!complete || busy} className="h-tap rounded-t-boton bg-t-acento text-t-acento-tinta text-base font-bold disabled:bg-border disabled:text-ink-3">{busy ? t('confirming') : t('confirm')}</button>
    </form>
  )
}
