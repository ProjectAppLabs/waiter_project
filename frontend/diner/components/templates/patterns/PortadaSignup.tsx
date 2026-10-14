'use client'

import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'

import type { SignupProps } from '@/components/templates/types'
import { useDinerStore } from '@/lib/stores/dinerStore'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Este patrón no pide el nombre (dos campos: correo y celular); experience lo exige, así que se deriva del correo («camila.r@…» → «Camila R»).
const nameFromEmail = (email: string) => email.split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ').slice(0, 60) || email.slice(0, 60)

// Registro · patrón «portada» (reutilizable por cualquier plantilla; solo tokens --t-*). Portada centrada: el porcentaje en el acento, título
// en la voz de la plantilla «Tu primera vez en {marca}» y frase; solo Correo (foco en el acento) y Celular (+57); una casilla de política de
// datos; caja «Sin contraseña: te enviamos un código cada vez que entres.»; CTA «Crear cuenta y aplicar N%» y «Ya tengo cuenta». Como en
// experience una cuenta ya verificada vuelve por el mismo camino, «Ya tengo cuenta» lleva el foco al correo y lo explica; «Seguir sin
// registrarme» (onSkip) queda visible porque saltar el registro siempre es posible (flujos base, Cuenta 4a).
export function PortadaSignup({ onSubmit, onSkip, busy, error, discountPct }: SignupProps) {
  const t = useTranslations('diner.account.signup')
  const tp = useTranslations('diner.templates.portada')
  const brand = useDinerStore((s) => s.entry?.contexto.marca.nombre ?? '')
  const [correo, setCorreo] = useState('')
  const [celular, setCelular] = useState('')
  const [aceptaDatos, setAceptaDatos] = useState(false)
  const [hint, setHint] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const valid = EMAIL.test(correo.trim()) && aceptaDatos
  const field = 'h-[52px] w-full rounded-[10px] bg-t-superficie border border-t-borde px-3.5 text-base text-t-tinta placeholder:text-t-tinta-terciaria focus:outline-none focus:border-2 focus:border-t-acento'
  const label = 'text-[14px] font-medium text-t-tinta-suave'
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (valid && !busy) onSubmit({ nombre: nameFromEmail(correo.trim()), correo: correo.trim(), celular: celular.replace(/\D/g, ''), aceptaDatos, novedades: false })
  }
  return (
    <form onSubmit={submit} className="flex flex-col text-t-tinta">
      <header className="px-5 pt-7 pb-[22px] text-center border-b border-t-borde">
        <span className="text-[34px] font-bold leading-none tracking-[-0.03em] text-t-acento">{t('pct', { pct: discountPct })}</span>
        <h1 className="t-title text-[23px] leading-[1.1] mt-2">{brand ? tp('title', { brand }) : tp('titleNoBrand')}</h1>
        <p className="mt-2 text-[15px] leading-[1.45] text-t-tinta-suave">{tp('phrase')}</p>
      </header>
      <div className="px-5 py-[18px] flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5"><span className={label}>{t('email')}</span><input ref={emailRef} name="correo" type="email" inputMode="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} className={field} /></label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="portada-celular" className={label}>{t('phone')}</label>
          <div className="flex gap-2">
            <span aria-hidden="true" className="h-[52px] px-3 rounded-[10px] bg-t-superficie border border-t-borde grid place-items-center font-t-mono text-[15px] text-t-tinta-suave">+57</span>
            <input id="portada-celular" name="celular" type="tel" inputMode="tel" autoComplete="tel-national" value={celular} onChange={(e) => setCelular(e.target.value)} className={field} />
          </div>
        </div>
        <label className="flex items-center gap-[11px] h-tap-min">
          <input type="checkbox" className="sr-only" checked={aceptaDatos} onChange={(e) => setAceptaDatos(e.target.checked)} />
          <span aria-hidden="true" className={`w-6 h-6 shrink-0 rounded-[7px] grid place-items-center text-[13px] font-bold ${aceptaDatos ? 'bg-t-acento text-t-acento-tinta' : 'border border-t-borde bg-t-superficie'}`}>{aceptaDatos ? '✓' : ''}</span>
          <span className="text-[14px] text-t-tinta-suave">{t('acceptData')}</span>
        </label>
        <p className="px-[15px] py-[13px] rounded-t-tarjeta bg-t-superficie border border-t-borde text-[14px] leading-[1.45] text-t-tinta-suave">{tp('noPassword')}</p>
        {hint && <p role="status" className="text-[14px] text-t-tinta-suave">{tp('haveAccountHint')}</p>}
        {error && <p role="alert" className="px-3.5 py-2.5 rounded-t-boton bg-busy-soft text-busy-ink text-[15px]">{error}</p>}
      </div>
      <div className="px-5 py-4 border-t border-t-borde bg-t-superficie flex flex-col">
        <button type="submit" disabled={!valid || busy} className="h-14 rounded-t-boton bg-t-acento text-t-acento-tinta t-title text-[19px] leading-[1.1] disabled:opacity-50">{busy ? t('submitting') : t('submit', { pct: discountPct })}</button>
        <div className="mt-2 flex items-center justify-center gap-4">
          <button type="button" onClick={() => { setHint(true); emailRef.current?.focus() }} className="h-tap-min text-[14px] text-t-tinta-suave">{tp('haveAccount')}</button>
          <button type="button" onClick={onSkip} className="h-tap-min text-[14px] text-t-tinta-suave">{tp('skip')}</button>
        </div>
      </div>
    </form>
  )
}
