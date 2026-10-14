'use client'

import { useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { downloadExport, type ExportKind, type ExportParams } from '@/lib/services/core/exports'
import { toast } from '@/lib/stores/toastStore'

// Plan Y1: «Exportar CSV» con uno o varios archivos (por ejemplo ventas y pagos del mismo periodo).
export function ExportMenu({ options, params }: { options: { kind: ExportKind; label: string }[]; params: ExportParams | null }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  async function run(kind: ExportKind) {
    if (!params) return
    setOpen(false); setBusy(true)
    try { const name = await downloadExport(kind, params); toast({ title: `Descargado: ${name}` }) }
    catch (e) { toast({ title: e instanceof Error ? e.message : 'No se pudo exportar.', tone: 'danger' }) }
    finally { setBusy(false) }
  }
  if (options.length === 1) return <Button disabled={busy || !params} onClick={() => void run(options[0].kind)}><Icon name="download" size={18} />{options[0].label}</Button>
  return (
    <div className="relative">
      <Button aria-haspopup="menu" aria-expanded={open} disabled={busy || !params} onClick={() => setOpen((v) => !v)}><Icon name="download" size={18} />Exportar CSV</Button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-30 min-w-[220px] rounded-md border border-border bg-surface shadow-lg p-1">
          {options.map((o) => <button key={o.kind} role="menuitem" type="button" onClick={() => void run(o.kind)} className="w-full text-left px-3 h-10 rounded-sm text-[15px] hover:bg-muted">{o.label}</button>)}
        </div>
      )}
    </div>
  )
}
