'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { SignupProps } from '@/components/templates/types'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Registro · patrón «banner5» (Cuenta 4a-1): banda con el 5 %, Nombre / Correo / Celular (+57), dos casillas (la de novedades
// va sin marcar por ley), «Crear cuenta y aplicar 5%» y «Seguir sin registrarme». Sin contraseña.
export function GenericSignup({ onSubmit, onSkip, busy, error, discountPct }: SignupProps) {
  const t = useTranslations('diner.account.signup')
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [celular, setCelular] = useState('')
  const [aceptaDatos, setAceptaDatos] = useState(false)
  const [novedades, setNovedades] = useState(false)
  const valid = nombre.trim().length > 1 && EMAIL.test(correo.trim()) && aceptaDatos
  const field = 'h-[52px] w-full rounded-t-boton bg-t-superficie border border-t-borde px-3.5 text-base text-t-tinta placeholder:text-t-tinta-terciaria focus:border-t-acento focus:outline-none'
  const label = 'text-[14px] font-medium text-t-tinta-suave'
  const box = (on: boolean) => `w-[26px] h-[26px] shrink-0 rounded-[7px] grid place-items-center text-[14px] font-bold ${on ? 'bg-t-acento text-t-acento-tinta' : 'border border-t-borde bg-t-superficie'}`
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (valid && !busy) onSubmit({ nombre: nombre.trim(), correo: correo.trim(), celular: celular.replace(/\D/g, ''), aceptaDatos, novedades }) }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 pb-[18px] text-t-tinta">
      <div className="mx-[18px] mt-[22px] rounded-t-tarjeta bg-t-acento-suave px-4 py-4 flex items-baseline gap-3">
        <span className="text-[32px] font-bold leading-none text-[#A06E2C]">{t('pct', { pct: discountPct })}</span>
        <span className="text-[15px] text-[#6B4A05]">{t('banner')}</span>
      </div>
      <div className="px-[18px] flex flex-col gap-3">
        <label className="flex flex-col gap-1.5"><span className={label}>{t('name')}</span><input name="nombre" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} className={field} /></label>
        <label className="flex flex-col gap-1.5"><span className={label}>{t('email')}</span><input name="correo" type="email" inputMode="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} className={field} /></label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="signup-celular" className={label}>{t('phone')}</label>
          <div className="flex gap-2">
            <span aria-hidden="true" className="h-[52px] px-3 rounded-t-boton bg-t-superficie border border-t-borde grid place-items-center font-t-mono text-[15px] text-t-tinta-suave">+57</span>
            <input id="signup-celular" name="celular" type="tel" inputMode="tel" autoComplete="tel-national" value={celular} onChange={(e) => setCelular(e.target.value)} className={field} />
          </div>
        </div>
        <label className="flex items-center gap-3 h-tap-min">
          <input type="checkbox" className="sr-only" checked={aceptaDatos} onChange={(e) => setAceptaDatos(e.target.checked)} />
          <span aria-hidden="true" className={box(aceptaDatos)}>{aceptaDatos ? '✓' : ''}</span>
          <span className="text-[15px]">{t('acceptData')}</span>
        </label>
        <label className="flex items-center gap-3 h-tap-min">
          <input type="checkbox" className="sr-only" checked={novedades} onChange={(e) => setNovedades(e.target.checked)} />
          <span aria-hidden="true" className={box(novedades)}>{novedades ? '✓' : ''}</span>
          <span className="text-[15px]">{t('news')}</span>
        </label>
        {/* Sobre tokens: en las pieles oscuras (C1, C4) el fondo fijo claro dejaba el texto gris ilegible. */}
        <p className="px-3.5 py-2.5 rounded-t-boton bg-t-superficie border border-t-borde text-[13px] leading-snug text-t-tinta-suave">{t('notice')}</p>
        {error && <p role="alert" className="px-3.5 py-2.5 rounded-t-boton bg-busy-soft text-busy-ink text-[15px]">{error}</p>}
        <button type="submit" disabled={!valid || busy} className="h-tap rounded-t-boton bg-t-acento text-t-acento-tinta text-base font-bold disabled:opacity-50">{busy ? t('submitting') : t('submit', { pct: discountPct })}</button>
        <button type="button" onClick={onSkip} className="h-tap-min text-[14px] font-medium text-t-tinta-suave">{t('skip')}</button>
      </div>
    </form>
  )
}
