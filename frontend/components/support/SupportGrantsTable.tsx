'use client'

import { StatusPill } from '@/components/kit/StatusPill'
import { ScrollTable } from '@/components/ui/ScrollTable'
import { SUPPORT_STATE, supportWhen, type SupportGrant } from '@/lib/services/core/support'

const TONE = { pedido: 'progress', vigente: 'success', revocado: 'neutral', vencido: 'neutral' } as const

// Plan Y4: los accesos de soporte de una organización; la misma tabla en la consola del dueño y en la ficha del cliente.
export function SupportGrantsTable({ grants, actions }: { grants: SupportGrant[]; actions?: (g: SupportGrant) => React.ReactNode }) {
  if (!grants.length) return <p className="text-soft">Todavía no hay accesos de soporte.</p>
  return (
    <ScrollTable label="los accesos de soporte">
      <table aria-label="Accesos de soporte" className="data-table text-[15px]">
        <thead><tr className="text-left text-soft border-b border-border">{['Estado', 'Motivo', 'Pidió', 'Aprobó', 'Desde', 'Hasta', ''].map((h, i) => <th key={i} className="px-4 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{grants.map((g) => (
          <tr key={g.id} className="border-b border-border last:border-0">
            <td className="px-4 py-2"><StatusPill tone={TONE[g.state]}>{SUPPORT_STATE[g.state]}</StatusPill></td>
            <td className="px-4 py-2 cell-wrap max-w-[320px]">{g.reason || '—'}</td>
            <td className="px-4 py-2">{g.requested_by?.name ?? '—'}</td><td className="px-4 py-2">{g.approved_by?.name ?? '—'}</td>
            <td className="px-4 py-2">{supportWhen(g.since)}</td><td className="px-4 py-2">{g.state === 'pedido' ? `${g.hours} h al aprobar` : supportWhen(g.until)}</td>
            <td className="px-4 py-2"><div className="flex justify-end gap-2">{actions?.(g)}</div></td>
          </tr>))}</tbody>
      </table>
    </ScrollTable>
  )
}
