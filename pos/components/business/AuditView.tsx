'use client'

import { useEffect, useState } from 'react'

import { PeriodPicker } from '@/components/business/PeriodPicker'
import { Chip } from '@/components/kit/Chip'
import { ExportMenu } from '@/components/kit/ExportMenu'
import { Modal } from '@/components/kit/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { ScrollTable } from '@/components/ui/ScrollTable'
import { TableSearch } from '@/components/ui/SortTh'
import { presetSpan, type DateSpan } from '@/lib/domain/business'
import { auditActions, listAudit, type AuditEntry } from '@/lib/services/core/audit'
import { listPeople, type CorePerson } from '@/lib/services/core/pos'

const PAGE = 50
const when = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

// Plan Y2: quién cambió qué y cuándo en la organización, con antes y después. Incluye lo que hizo ProjectApp (módulos,
// precios, soporte), marcado como tal.
export function AuditView({ restaurants }: { restaurants: { id: number; name: string }[] }) {
  const [span, setSpan] = useState<DateSpan>(() => presetSpan('last30'))
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [accountId, setAccountId] = useState<number | null>(null)
  const [action, setAction] = useState('')
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [people, setPeople] = useState<CorePerson[]>([])
  const [actions, setActions] = useState<{ key: string; name: string }[]>([])
  const [detail, setDetail] = useState<AuditEntry | null>(null)
  const params = { from: span.from, to: span.to, restaurant_id: restaurantId, account_id: accountId, action, q: query.trim() }
  const key = JSON.stringify(params)
  useEffect(() => { listPeople().then(setPeople).catch(() => setPeople([])); auditActions().then(setActions).catch(() => setActions([])) }, [])
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      listAudit({ ...params, limit: PAGE, offset: 0 }).then((r) => { if (alive) { setEntries(r.entries); setTotal(r.total); setError('') } })
        .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo leer el historial.') })
    }, 250)
    return () => { alive = false; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` resume los filtros
  }, [key])
  const more = () => void listAudit({ ...params, limit: PAGE, offset: entries?.length ?? 0 }).then((r) => setEntries((prev) => [...(prev ?? []), ...r.entries]))
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-[26px] font-bold">Historial de cambios</h1>
          <p className="mt-1 text-soft">Quién cambió precios, platos, inventario, descuentos, caja, equipo y permisos, y cuándo. También lo que hizo ProjectApp.</p></div>
        <ExportMenu options={[{ kind: 'historial', label: 'Exportar CSV' }]} params={params} />
      </div>
      <PeriodPicker onChange={setSpan} />
      <div className="flex flex-wrap items-end gap-3">
        {restaurants.length > 1 && <div className="flex flex-wrap gap-2"><Chip label="Todos" active={restaurantId === null} onClick={() => setRestaurantId(null)} />
          {restaurants.map((r) => <Chip key={r.id} label={r.name} active={restaurantId === r.id} onClick={() => setRestaurantId(r.id)} />)}</div>}
        <div className="w-56"><Select label="Persona" value={accountId ?? ''} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Todas</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        <div className="w-64"><Select label="Tipo de cambio" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Todos</option>{actions.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</Select></div>
        <TableSearch value={query} onChange={setQuery} placeholder="Buscar en el resumen" className="w-72 max-w-full" />
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!entries ? !error && <p role="status" className="text-soft">Leyendo el historial…</p>
        : entries.length === 0 ? <p className="text-soft">No hay cambios con estos filtros.</p> : (<>
          <ScrollTable label="el historial">
            <table aria-label="Historial de cambios" className="data-table text-[15px]">
              <thead><tr className="text-left text-soft border-b border-border"><th className="px-4 py-2">Fecha</th><th className="px-4 py-2">Local</th><th className="px-4 py-2">Quién</th><th className="px-4 py-2">Cambio</th><th className="px-4 py-2">Resumen</th></tr></thead>
              <tbody>{entries.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0 cursor-pointer hover:bg-muted" onClick={() => setDetail(e)}>
                  <td className="px-4 py-2">{when(e.at)}</td><td className="px-4 py-2">{e.restaurant?.name ?? 'Organización'}</td>
                  <td className="px-4 py-2">{e.actor.name}{e.actor.kind === 'platform' && <span className="ml-2 text-[12px] font-semibold text-primary">ProjectApp</span>}</td>
                  <td className="px-4 py-2">{e.action_name}</td><td className="px-4 py-2 cell-wrap max-w-[420px]">{e.summary}</td>
                </tr>))}</tbody>
            </table>
          </ScrollTable>
          <p className="text-[14px] text-soft">{entries.length} de {total}</p>
          {entries.length < total && <Button className="self-start" onClick={more}>Ver más</Button>}
        </>)}
      {detail && (
        <Modal open onClose={() => setDetail(null)} title={detail.action_name} size="center">
          <div className="p-6 flex flex-col gap-3 text-[15px]">
            <p>{detail.summary}</p>
            <p className="text-soft">{when(detail.at)} · {detail.actor.name} · {detail.restaurant?.name ?? 'Organización'}</p>
            <table aria-label="Antes y después" className="data-table text-[14px]">
              <thead><tr className="text-left text-soft border-b border-border"><th className="px-3 py-2">Dato</th><th className="px-3 py-2">Antes</th><th className="px-3 py-2">Después</th></tr></thead>
              <tbody>{[...new Set([...Object.keys(detail.before ?? {}), ...Object.keys(detail.after ?? {})])].map((k) => (
                <tr key={k} className="border-b border-border last:border-0"><td className="px-3 py-2 font-medium">{k}</td><td className="px-3 py-2 cell-wrap">{show(detail.before?.[k])}</td><td className="px-3 py-2 cell-wrap">{show(detail.after?.[k])}</td></tr>))}</tbody>
            </table>
          </div>
        </Modal>
      )}
    </section>
  )
}
