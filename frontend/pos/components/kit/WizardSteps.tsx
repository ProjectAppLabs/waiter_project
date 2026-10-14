import { Icon } from '@/components/kit/Icon'
import { cn } from '@/lib/utils'

// Cabecera de pasos del kit (Reservation / Add New): hechos con check, actual en azul, pendientes en gris.
export function WizardSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-3">
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'pending'
        return (
          <li key={label} data-state={state} aria-current={state === 'current' ? 'step' : undefined}
            className={cn('flex items-center gap-2 h-10 px-3 rounded-md text-[15px] font-semibold whitespace-nowrap', state === 'current' ? 'bg-primary text-primary-ink' : state === 'done' ? 'text-primary' : 'text-dim')}>
            <span className={cn('w-6 h-6 rounded-full grid place-items-center text-[13px]', state === 'current' ? 'bg-surface/20' : state === 'done' ? 'bg-primary-soft' : 'bg-muted')}>
              {state === 'done' ? <Icon name="check" size={14} /> : i + 1}
            </span>
            <span>{label}</span>
            {i < steps.length - 1 && <Icon name="chevronRight" size={16} className="text-dim" />}
          </li>
        )
      })}
    </ol>
  )
}
