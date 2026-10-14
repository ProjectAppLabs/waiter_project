'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { SignupProps } from '@/components/templates/types'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Registro · patrón «beneficios» (reutilizable por cualquier plantilla: solo tokens --t-*). Cabecera «Crear cuenta» con «Tres razones,
// ninguna de marketing»; tres tarjetas de beneficio (la primera «{pct}% de descuento hoy» sobre acento suave con la cifra en acento;
// las otras dos con check gris: tarjeta guardada, alergias a la comanda); formulario mínimo y casilla de datos; CTA «Crear cuenta y
// aplicar {pct}%» y «Seguir sin registrarme». El marco solo pide el correo; el registro de experience exige también el nombre
// (services/account.py), así que se pide un nombre corto en vez de inventarlo. No pide celular ni contraseña; novedades va en falso.
export function BenefitsSignup({ onSubmit, onSkip, busy, error, discountPct }: SignupProps) {
  const t = useTranslations('diner.account.signup')
  const tp = useTranslations('diner.templates.patterns.beneficios')
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [aceptaDatos, setAceptaDatos] = useState(false)
  const valid = nombre.trim().length > 1 && EMAIL.test(correo.trim()) && aceptaDatos
  const field = 'h-[52px] w-full rounded-[10px] bg-t-fondo border border-t-borde px-3.5 text-base text-t-tinta placeholder:text-t-tinta-terciaria focus:border-t-acento focus:border-2 focus:outline-none'
  const label = 'text-[14px] font-medium text-t-tinta-suave'
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (valid && !busy) onSubmit({ nombre: nombre.trim(), correo: correo.trim(), celular: '', aceptaDatos, novedades: false }) }
  return (
    <form onSubmit={submit} className="flex flex-col text-t-tinta border-b border-t-borde">
      <header className="px-5 py-[18px] border-b border-t-borde flex flex-col">
        <h1 className="t-title text-[19px] leading-[1.15]">{tp('title')}</h1>
        <span className="text-[14px] text-t-tinta-suave mt-[3px]">{tp('subtitle')}</span>
      </header>
      <ul className="px-5 pt-[18px] flex flex-col gap-2.5">
        <li className="flex items-center gap-[11px] px-3.5 py-[13px] rounded-t-tarjeta bg-t-acento-suave">
          <span className="text-[24px] font-bold tracking-[-0.03em] text-t-acento">{t('pct', { pct: discountPct })}</span>
          <span className="text-[14px] leading-snug text-pending-ink">{tp('discountToday')}</span>
        </li>
        {(['savedCard', 'allergies'] as const).map((k) => (
          <li key={k} className="flex items-center gap-[11px] px-3.5 py-[13px] rounded-t-tarjeta bg-t-superficie">
            <span aria-hidden="true" className="w-[26px] h-[26px] shrink-0 rounded-full bg-t-borde grid place-items-center text-[13px]">✓</span>
            <span className="text-[14px] text-t-tinta-suave">{tp(k)}</span>
          </li>
        ))}
      </ul>
      <div className="px-5 pt-3.5 pb-[18px] flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5"><span className={label}>{t('name')}</span><input name="nombre" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} className={field} /></label>
        <label className="flex flex-col gap-1.5"><span className={label}>{t('email')}</span><input name="correo" type="email" inputMode="email" autoComplete="email" value={correo} onChange={(e) => setCorreo(e.target.value)} className={field} /></label>
        <label className="flex items-center gap-[11px] h-11">
          <input type="checkbox" className="sr-only" checked={aceptaDatos} onChange={(e) => setAceptaDatos(e.target.checked)} />
          <span aria-hidden="true" className={`w-6 h-6 shrink-0 rounded-[7px] grid place-items-center text-[13px] font-bold ${aceptaDatos ? 'bg-t-acento text-t-acento-tinta' : 'border border-t-borde bg-t-fondo'}`}>{aceptaDatos ? '✓' : ''}</span>
          <span className="text-[14px] text-t-tinta-suave">{t('acceptData')}</span>
        </label>
        {error && <p role="alert" className="px-3.5 py-2.5 rounded-t-boton bg-busy-soft text-busy-ink text-[15px]">{error}</p>}
      </div>
      <div className="px-5 py-4 border-t border-t-borde bg-t-superficie flex flex-col">
        <button type="submit" disabled={!valid || busy} className="h-14 rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold tracking-[-0.02em] disabled:opacity-50">{busy ? t('submitting') : t('submit', { pct: discountPct })}</button>
        <button type="button" onClick={onSkip} className="mt-[11px] h-11 text-[14px] text-t-tinta-suave">{t('skip')}</button>
      </div>
    </form>
  )
}
