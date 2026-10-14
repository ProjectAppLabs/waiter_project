'use client'

import type { ReactNode } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { cn } from '@/lib/utils'

export const INPUT = 'h-11 w-full px-3.5 rounded-md border border-border bg-surface text-[15px] text-ink placeholder:text-dim outline-none focus:border-primary'
export const LABEL = 'text-[15px] font-semibold text-ink'

// Wizard de dos pasos del kit (Add New Dish / Add New Ingredients): pasos en columna a la izquierda y tarjeta
// con cabecera, cuerpo desplazable y botón principal abajo a la derecha. Vive aquí porque WizardSteps del kit es horizontal.
export function WizardFrame({ open, title, steps, current, onClose, paneTitle, paneAction, footer, children }: {
  open: boolean; title: string; steps: string[]; current: number; onClose: () => void; paneTitle: string; paneAction?: ReactNode; footer: ReactNode; children: ReactNode
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="wide">
      <div className="h-full flex bg-canvas">
        <ol className="w-[200px] shrink-0 p-4 flex flex-col gap-2">
          {steps.map((label, i) => {
            const state = i < current ? 'done' : i === current ? 'current' : 'pending'
            return (
              <li key={label} data-state={state} aria-current={state === 'current' ? 'step' : undefined}
                className={cn('h-10 px-2.5 rounded-md flex items-center gap-2.5 text-[15px] font-semibold', state === 'current' ? 'bg-surface border border-border text-ink' : state === 'done' ? 'text-ink' : 'text-soft')}>
                <span className={cn('w-6 h-6 rounded-full grid place-items-center text-[12px] font-semibold', state === 'current' ? 'bg-primary text-primary-ink' : state === 'done' ? 'border-2 border-primary text-primary' : 'bg-muted text-soft')}>
                  {state === 'done' ? <Icon name="check" size={13} /> : i + 1}
                </span>
                <span>{label}</span>
              </li>
            )
          })}
        </ol>
        <section className="flex-1 min-w-0 my-4 mr-4 bg-surface border border-border rounded-md flex flex-col overflow-hidden">
          <header className="h-14 px-4 flex items-center justify-between gap-4 border-b border-border shrink-0">
            <h3 className="text-[16px] font-semibold text-ink">{paneTitle}</h3>{paneAction}
          </header>
          <div className="flex-1 min-h-0 overflow-auto p-4">{children}</div>
          <footer className="px-4 py-3.5 border-t border-border shrink-0 flex items-center gap-3">{footer}</footer>
        </section>
      </div>
    </Modal>
  )
}

export function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="h-11 px-4 rounded-md bg-primary text-primary-ink text-[15px] font-semibold disabled:opacity-40">{children}</button>
}
