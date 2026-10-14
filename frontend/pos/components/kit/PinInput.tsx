import { cn } from '@/lib/utils'

// Seis casillas del kit; el valor real va en un input oculto para lectores de pantalla y E2E.
export function PinInput({ value, length = 6, label }: { value: string; length?: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <input type="password" readOnly value={value} aria-label={label} className="sr-only" />
      <div className="flex gap-3" aria-hidden="true">
        {Array.from({ length }, (_, i) => (
          <span key={i} data-testid="pin-box" data-filled={i < value.length ? 'true' : 'false'}
            className={cn('w-12 h-12 rounded-md border grid place-items-center', i < value.length ? 'border-primary' : 'border-border')}>
            {i < value.length && <span className="w-2.5 h-2.5 rounded-full bg-ink" />}
          </span>
        ))}
      </div>
    </div>
  )
}
