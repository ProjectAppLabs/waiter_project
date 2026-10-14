'use client'

import { formatCop } from '@/lib/domain/money'
import { cn } from '@/lib/utils'

// Importe en pesos del kit (Payment / Cash / Pay.png): "$" y el número grande. El input es real (se puede escribir
// o rellenar en E2E) y el teclado numérico del kit lo alimenta desde fuera con onDigit / onBackspace.
export function AmountInput({ label, value, onChange, disabled = false, className }: { label: string; value: string; onChange: (digits: string) => void; disabled?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 text-ink', className)}>
      <span aria-hidden className="text-[36px] font-semibold text-soft">$</span>
      <input type="text" inputMode="numeric" aria-label={label} placeholder="0" value={value === '' ? '' : formatCop(Number(value))} disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
        className="w-[240px] bg-transparent text-[36px] font-semibold tabular text-center outline-none placeholder:text-dim border-b-2 border-border focus:border-primary disabled:opacity-60" />
    </div>
  )
}

export const pushDigit = (value: string, d: string) => (value + d).replace(/^0+(?=\d)/, '').slice(0, 12)
export const popDigit = (value: string) => value.slice(0, -1)
