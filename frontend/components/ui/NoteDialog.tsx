'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/Button'

// Diálogo de texto táctil: notas de línea ("sin cebolla") y nota general a cocina. Reemplaza al prompt del navegador.
export function NoteDialog({ title, initial, onSave, onCancel }: { title: string; initial: string; onSave: (note: string) => void; onCancel: () => void }) {
  const ui = useTranslations('pos.ui')
  const [value, setValue] = useState(initial)
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 grid place-items-center bg-overlay/60 p-6">
      <form onSubmit={(e) => { e.preventDefault(); onSave(value.trim()) }} className="w-[520px] rounded-[18px] bg-surface p-6 flex flex-col gap-4 shadow-xl">
        <span className="text-[19px] font-bold">{title}</span>
        <textarea aria-label={title} autoFocus value={value} onChange={(e) => setValue(e.target.value)} rows={3} maxLength={200}
          className="px-3.5 py-3 rounded-[10px] border border-border bg-surface text-lg focus:outline-2 focus:outline-brand-500" />
        <div className="flex gap-2.5"><Button type="submit" variant="primary" className="flex-1">{ui('save')}</Button><Button type="button" onClick={onCancel}>{ui('cancel')}</Button></div>
      </form>
    </div>
  )
}
