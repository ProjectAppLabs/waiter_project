'use client'

import { cn } from '@/lib/utils'

// Interruptor del kit (Account Setting / Notification.png): pista azul cuando está activo.
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cn('relative shrink-0 w-12 h-7 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-border')}>
      {/* left-0 es obligatorio: sin él la bolita parte de su posición estática, que el centrado del botón
          empuja al medio, y apagada se ve casi tan a la derecha como encendida. */}
      <span className={cn('absolute top-1 left-0 w-5 h-5 rounded-full bg-surface shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  )
}
