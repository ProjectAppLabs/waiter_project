'use client'

import { Button } from '@/components/ui/Button'

interface ConfirmDialogProps {
  open: boolean; title: string; body: string; confirmLabel: string; cancelLabel: string
  destructive?: boolean; onConfirm: () => void; onCancel: () => void
}

export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, destructive = false, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay/60 p-6" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-lg bg-surface border border-border p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="text-2xl font-bold">{title}</h2>
        <p className="text-base text-soft leading-relaxed">{body}</p>
        {/* gap-4 = 16 px: la destructiva/principal nunca va pegada a cancelar. */}
        <div className="flex gap-4 justify-end pt-2">
          <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}
