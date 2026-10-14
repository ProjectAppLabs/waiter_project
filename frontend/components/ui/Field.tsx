'use client'

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { useId } from 'react'

import { cn } from '@/lib/utils'

const CONTROL = 'h-tap-min px-3.5 rounded-[10px] border border-border bg-surface text-base text-ink focus:outline-2 focus:outline-brand-500 disabled:opacity-50'

// Une ids para aria-describedby; undefined si no hay ninguno, para que React no pinte el atributo vacío.
export const describedBy = (...ids: (string | null | undefined | false)[]): string | undefined => ids.filter(Boolean).join(' ') || undefined

// La ayuda va fuera del <label>, como hermana con id, y el control la referencia con aria-describedby: así el nombre
// accesible del campo es solo la etiqueta («Lema», no «Lema Aparece en… 0/60») y la ayuda se lee como descripción.
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string, hintId?: string) => ReactNode }) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-medium">{label}</label>
      {children(id, hintId)}
      {hint && <span id={hintId} className="text-[13px] text-soft">{hint}</span>}
    </div>
  )
}

export function TextInput({ label, hint, className, 'aria-describedby': extra, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  return <Field label={label} hint={hint}>{(id, hintId) => <input id={id} aria-describedby={describedBy(hintId, extra)} className={cn(CONTROL, className)} {...rest} />}</Field>
}

export function Select({ label, hint, className, children, 'aria-describedby': extra, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode }) {
  return <Field label={label} hint={hint}>{(id, hintId) => <select id={id} aria-describedby={describedBy(hintId, extra)} className={cn(CONTROL, className)} {...rest}>{children}</select>}</Field>
}

// Interruptor táctil de 48 px: el estado se lee en texto, no solo en color.
export function Toggle({ label, checked, onChange, onLabel, offLabel }: { label: string; checked: boolean; onChange: (v: boolean) => void; onLabel: string; offLabel: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className="h-tap-min px-1 pr-3.5 rounded-full border border-border bg-surface flex items-center gap-2.5 text-[15px]">
      <span className={cn('w-10 h-10 rounded-full grid place-items-center transition-colors', checked ? 'bg-free text-white' : 'bg-muted text-soft')} aria-hidden>{checked ? '✓' : '–'}</span>
      <span className="flex flex-col leading-tight text-left"><span className="font-medium">{label}</span><span className="text-[13px] text-soft">{checked ? onLabel : offLabel}</span></span>
    </button>
  )
}
