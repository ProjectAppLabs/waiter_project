'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { CODE_LENGTH, RESEND_SECONDS } from '@/components/templates/generic/GenericCode'
import type { CodeProps } from '@/components/templates/types'

const pad = (n: number) => `0:${String(n).padStart(2, '0')}`

// Código · patrón «revisaCorreo» (reutilizable por cualquier plantilla; solo tokens --t-*). Cabecera centrada con el sobre en un círculo,
// «Revisa tu correo» en la voz de la plantilla y el correo debajo; seis casillas de 60 px en mono (la activa con borde de 2 px en el acento;
// pegar rellena las seis); «Reenviar en 0:38» centrado; caja con borde «El código sirve una sola vez…»; «Confirmar código» apagado hasta el
// sexto dígito. Este patrón no dibuja otro canal (onOtherChannel no se usa); «Corregir mi correo» vuelve al registro (onBack).
export function RevisaCorreoCode({ email, onVerify, onResend, onBack, busy, error }: CodeProps) {
  const t = useTranslations('diner.account.code')
  const tr = useTranslations('diner.templates.revisaCorreo')
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
  const resend = () => { onResend(); setLeft(RESEND_SECONDS); setResent(true) }
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (complete && !busy) onVerify(code) }
  const cell = (filled: boolean) => `h-[60px] w-full min-w-0 rounded-[10px] bg-t-superficie text-center font-t-mono text-[23px] text-t-tinta focus:outline-none focus:border-2 focus:border-t-acento ${filled ? 'border-2 border-t-acento' : 'border border-t-borde'}`
  return (
    <form onSubmit={submit} className="flex flex-col text-t-tinta">
      <header className="px-5 pt-[26px] pb-5 text-center border-b border-t-borde">
        <span aria-hidden="true" className="mx-auto mb-3 w-14 h-14 rounded-full bg-t-superficie grid place-items-center text-[22px]">✉</span>
        <h1 className="t-title text-[22px] leading-[1.1]">{tr('title')}</h1>
        <p className="mt-1.5 text-[15px] leading-[1.45] text-t-tinta-suave">{email}</p>
      </header>
      <div className="px-5 py-[18px] flex flex-col gap-[15px]">
        <div role="group" aria-label={t('digits')} className="grid grid-cols-6 gap-[7px]">
          {digits.map((d, i) => (
            <input key={i} ref={(el) => { refs.current[i] = el }} aria-label={t('digit', { n: i + 1 })} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={CODE_LENGTH} value={d} onChange={(e) => put(i, e.target.value)} onKeyDown={(e) => onKeyDown(i, e)} className={cell(d !== '')} />
          ))}
        </div>
        <button type="button" disabled={left > 0 || busy} onClick={resend} className="self-center h-tap-min text-[15px] text-t-tinta-suave disabled:opacity-100">
          {left > 0 ? <span className="font-t-mono tabular">{t('resendIn', { time: pad(left) })}</span> : t('resend')}
        </button>
        {resent && <p role="status" className="text-center text-[14px] text-free">{t('resent')}</p>}
        <p className="px-[15px] py-[13px] rounded-t-tarjeta border border-t-borde text-[14px] leading-[1.45] text-t-tinta-suave">{tr('once')}</p>
        <p className="text-center text-[12px] text-t-tinta-terciaria">{t('demo')}</p>
        {error && <p role="alert" className="px-3.5 py-2.5 rounded-t-boton bg-busy-soft text-busy-ink text-[15px]">{error}</p>}
      </div>
      <div className="px-5 py-4 border-t border-t-borde bg-t-superficie flex flex-col">
        <button type="submit" disabled={!complete || busy} className="h-14 rounded-t-boton bg-t-acento text-t-acento-tinta t-title text-[19px] leading-[1.1] disabled:bg-t-borde disabled:text-t-tinta-suave">{busy ? t('confirming') : t('confirm')}</button>
        <button type="button" onClick={onBack} className="mt-2 self-center h-tap-min text-[14px] text-t-tinta-suave">{tr('fixEmail')}</button>
      </div>
    </form>
  )
}
