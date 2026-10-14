'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { CODE_LENGTH, RESEND_SECONDS } from '@/components/templates/generic/GenericCode'
import type { CodeProps } from '@/components/templates/types'

const pad = (n: number) => `0:${String(n).padStart(2, '0')}`
type Channel = 'email' | 'sms'

// Código · patrón «canal» (reutilizable por cualquier plantilla: solo tokens --t-*). Cabecera «Entrar sin contraseña» con «Elige por
// dónde te llega el código»; dos opciones de canal (Correo con el email, elegida con borde de acento, fondo suave y check; SMS con
// flecha → onOtherChannel); seis casillas mono de 60 px (pegar reparte el código); «Escribe el código cuando llegue…»; reenvío con
// cuenta atrás, ← atrás, error del store y CTA «Confirmar código» apagado hasta el sexto dígito. El celular no viene en CodeProps:
// la opción SMS dice «a tu celular» sin inventar un número.
export function ChannelCode({ email, onVerify, onResend, onOtherChannel, onBack, busy, error }: CodeProps) {
  const t = useTranslations('diner.account.code')
  const tc = useTranslations('diner.common')
  const tp = useTranslations('diner.templates.patterns.canal')
  const [channel, setChannel] = useState<Channel>('email')
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [left, setLeft] = useState(RESEND_SECONDS)
  const [resent, setResent] = useState(false)
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
  const choose = (c: Channel) => { setChannel(c); if (c === 'sms') onOtherChannel() }
  const resend = () => { onResend(); setLeft(RESEND_SECONDS); setResent(true) }
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (complete && !busy) onVerify(code) }
  const option = (on: boolean) => `w-full min-h-[60px] flex items-center justify-between gap-3 p-[15px] rounded-t-tarjeta text-left ${on ? 'border-2 border-t-acento bg-t-acento-suave' : 'border border-t-borde'}`
  const cell = (filled: boolean) => `h-[60px] w-full min-w-0 rounded-[10px] bg-t-fondo text-center font-t-mono text-[23px] text-t-tinta focus:outline-none focus:border-t-acento focus:border-2 ${filled ? 'border-2 border-t-acento' : 'border border-t-borde'}`
  return (
    <form onSubmit={submit} className="flex flex-col text-t-tinta border-b border-t-borde">
      <header className="px-5 py-[18px] border-b border-t-borde flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label={tc('back')} className="w-11 h-11 -m-1 shrink-0 rounded-[10px] border border-t-borde grid place-items-center text-[16px] text-t-tinta-suave">←</button>
        <div className="flex flex-col">
          <h1 className="t-title text-[18px] leading-[1.15]">{tp('title')}</h1>
          <span className="text-[14px] text-t-tinta-suave mt-[3px]">{tp('subtitle')}</span>
        </div>
      </header>
      <div role="radiogroup" aria-label={tp('channels')} className="px-5 pt-[18px] flex flex-col gap-2.5">
        <button type="button" role="radio" aria-checked={channel === 'email'} onClick={() => choose('email')} className={option(channel === 'email')}>
          <span className="flex flex-col min-w-0"><span className={`text-[15px] ${channel === 'email' ? 'font-medium' : ''}`}>{tp('email')}</span><span className="text-[13px] text-t-tinta-suave truncate">{email}</span></span>
          {channel === 'email' ? <span aria-hidden="true" className="w-[22px] h-[22px] shrink-0 rounded-full bg-t-acento text-t-acento-tinta grid place-items-center text-[12px] font-bold">✓</span> : <span aria-hidden="true" className="text-t-tinta-suave">→</span>}
        </button>
        <button type="button" role="radio" aria-checked={channel === 'sms'} onClick={() => choose('sms')} className={option(channel === 'sms')}>
          <span className="flex flex-col"><span className={`text-[15px] ${channel === 'sms' ? 'font-medium' : ''}`}>{tp('sms')}</span><span className="text-[13px] text-t-tinta-suave">{tp('smsHint')}</span></span>
          {channel === 'sms' ? <span aria-hidden="true" className="w-[22px] h-[22px] shrink-0 rounded-full bg-t-acento text-t-acento-tinta grid place-items-center text-[12px] font-bold">✓</span> : <span aria-hidden="true" className="text-t-tinta-suave">→</span>}
        </button>
        {channel === 'sms' && <p role="status" className="text-[13px] text-t-tinta-suave">{t('otherChannelHint')}</p>}
      </div>
      <div role="group" aria-label={t('digits')} className="px-5 pt-[15px] grid grid-cols-6 gap-[7px]">
        {digits.map((d, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el }} aria-label={t('digit', { n: i + 1 })} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={CODE_LENGTH} value={d} onChange={(e) => put(i, e.target.value)} onKeyDown={(e) => onKeyDown(i, e)} className={cell(d !== '')} />
        ))}
      </div>
      <div className="px-5 pt-[15px] pb-[18px] flex flex-col gap-3">
        <p className="text-[14px] leading-[1.45] text-t-tinta-suave">{tp('waiting')}</p>
        <div className="flex items-center justify-between gap-3">
          <button type="button" disabled={left > 0 || busy} onClick={resend} className="h-11 text-[14px] font-medium text-t-tinta-suave disabled:opacity-70">
            {left > 0 ? <span className="font-t-mono tabular">{t('resendIn', { time: pad(left) })}</span> : t('resend')}
          </button>
          {resent && <span role="status" className="text-[13px] text-free">{t('resent')}</span>}
        </div>
        <p className="text-[12px] text-t-tinta-terciaria">{t('once')} {t('demo')}</p>
        {error && <p role="alert" className="px-3.5 py-2.5 rounded-t-boton bg-busy-soft text-busy-ink text-[15px]">{error}</p>}
      </div>
      <div className="px-5 py-4 border-t border-t-borde bg-t-superficie">
        <button type="submit" disabled={!complete || busy} className="w-full h-14 rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold tracking-[-0.02em] disabled:bg-t-borde disabled:text-t-tinta-suave">{busy ? t('confirming') : t('confirm')}</button>
      </div>
    </form>
  )
}
