'use client'

import { useEffect, useState } from 'react'

import { Modal } from '@/components/kit/Modal'
import { Button } from '@/components/ui/Button'
import { Select, TextInput } from '@/components/ui/Field'
import { formatCop } from '@/lib/domain/money'
import { grantCredits, organizationCredits, type OrganizationCredits } from '@/lib/services/core/platform'
import { UNIT_LABELS } from './PriceBookView'

const KIND = { recarga: 'Recarga pagada', cortesia: 'Cortesía', consumo: 'Consumo' } as const
const when = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

// Plan X: el saldo de recargas del cliente por unidad y sus movimientos. Quien administra puede dar saldo de cortesía
// con un motivo; queda en el historial.
export function OrganizationCreditsPanel({ slug, canEdit }: { slug: string; canEdit: boolean }) {
  const [data, setData] = useState<OrganizationCredits | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [granting, setGranting] = useState(false)
  useEffect(() => {
    let alive = true
    organizationCredits(slug).then((d) => { if (alive) setData(d) }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo leer el saldo.') })
    return () => { alive = false }
  }, [slug])
  return (
    <section aria-label="Recargas" className="rounded-lg border border-border p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">Recargas</h2>
        {canEdit && <Button size="compact" onClick={() => setGranting(true)}>Dar saldo de cortesía</Button>}
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      {!data ? !error && <p role="status" className="text-soft">Leyendo el saldo…</p> : (<>
        {data.balances.length === 0 ? <p className="text-soft">Sin saldo de recargas.</p>
          : <ul aria-label="Saldo de recargas" className="flex flex-wrap gap-3">{data.balances.map((b) => (
            <li key={`${b.module}.${b.unit}`} className="rounded-md bg-muted px-3 py-2 text-[15px]"><span className="text-soft">{b.unit_name}: </span><strong className="tabular">{b.balance.toLocaleString('es-CO')}</strong></li>))}</ul>}
        {data.movements.length > 0 && (
          <table aria-label="Movimientos de recargas" className="data-table text-[14px]">
            <thead><tr className="text-left text-soft border-b border-border"><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Movimiento</th><th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Detalle</th></tr></thead>
            <tbody>{data.movements.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0"><td className="px-3 py-2">{when(m.at)}</td><td className="px-3 py-2">{KIND[m.kind]}</td>
                <td className="px-3 py-2 text-right tabular">{m.quantity > 0 ? '+' : ''}{m.quantity.toLocaleString('es-CO')}</td><td className="px-3 py-2 text-right tabular">{m.amount ? `$ ${formatCop(m.amount)}` : '—'}</td>
                <td className="px-3 py-2 cell-wrap">{m.reference}{m.actor && <span className="text-dim"> · {m.actor.name}</span>}</td></tr>))}</tbody>
          </table>
        )}
      </>)}
      {granting && <GrantModal onClose={() => setGranting(false)} onSave={async (body) => {
        setError(''); setNotice('')
        try { setData(await grantCredits(slug, body)); setGranting(false); setNotice('Saldo de cortesía agregado.') } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo dar el saldo.') }
      }} />}
    </section>
  )
}

function GrantModal({ onClose, onSave }: { onClose: () => void; onSave: (b: { module: string; unit: string; quantity: number; reason: string }) => Promise<void> }) {
  const [what, setWhat] = useState('asistente_whatsapp.pedido_asistente')
  const [quantity, setQuantity] = useState(''), [reason, setReason] = useState('')
  const [module, unit] = what.split('.')
  const ok = Number(quantity) > 0 && reason.trim().length >= 3
  return (
    <Modal open onClose={onClose} title="Saldo de cortesía" size="center"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!ok} onClick={() => void onSave({ module, unit, quantity: Number(quantity), reason: reason.trim() })}>Dar saldo</Button></>}>
      <div className="p-6 flex flex-col gap-4">
        <Select label="Qué" value={what} onChange={(e) => setWhat(e.target.value)}>{Object.entries(UNIT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <TextInput label="Cantidad" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <TextInput label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Compensación por la caída del 3 de octubre" />
      </div>
    </Modal>
  )
}
