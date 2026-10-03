'use client'

import { useEffect, useState } from 'react'

import { Modal } from '@/components/kit/Modal'
import { StatusPill } from '@/components/kit/StatusPill'
import { Toggle } from '@/components/kit/Toggle'
import { Button } from '@/components/ui/Button'
import { Select, TextInput } from '@/components/ui/Field'
import { ScrollTable } from '@/components/ui/ScrollTable'
import { CoreError } from '@/lib/services/core/http'
import { changeOrganizationModules, organizationModules, organizationUsage, type CatalogModule, type ModuleChange, type ModuleSource, type ModuleState,
  type OrganizationModules as Modules, type OrganizationUsage } from '@/lib/services/core/platform'

const SOURCE: Record<ModuleSource, string> = { plan: 'Del plan', organization: 'Excepción de la organización', restaurant: 'Excepción del local' }
const message = (e: unknown) => {
  if (e instanceof CoreError) {
    const names = (e.detail.dependents ?? e.detail.missing) as string[] | undefined
    return names?.length ? `${e.message} (${names.join(', ')})` : e.message
  }
  return e instanceof Error ? e.message : 'No se pudo guardar.'
}

// Plan W4: los módulos de un cliente. La plantilla del plan manda; encima, excepciones de la organización y de cada
// local (la del local gana). Solo los administradores de la plataforma cambian algo; los errores de dependencias se
// muestran tal como llegan del servidor.
export function OrganizationModulesPanel({ slug, canEdit }: { slug: string; canEdit: boolean }) {
  const [data, setData] = useState<Modules | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [details, setDetails] = useState<{ module: CatalogModule; state: ModuleState; restaurantId: number | null } | null>(null)
  useEffect(() => {
    let alive = true
    organizationModules(slug).then((d) => { if (alive) setData(d) }).catch((e: unknown) => { if (alive) setError(message(e)) })
    return () => { alive = false }
  }, [slug])
  async function apply(change: ModuleChange, done: string) {
    setBusy(true); setError(''); setNotice('')
    try { setData(await changeOrganizationModules(slug, change)); setNotice(done) } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  if (!data) return <section aria-label="Módulos" className="rounded-lg border border-border p-5">{error ? <p role="alert" className="text-danger">{error}</p> : <p role="status" className="text-soft">Leyendo los módulos…</p>}</section>
  const stateOf = (list: ModuleState[], key: string) => list.find((m) => m.key === key)
  const cell = (m: CatalogModule, state: ModuleState | undefined, restaurantId: number | null, place: string) => {
    if (!state) return <td className="px-3 py-2 text-dim">—</td>
    const locked = m.required || !m.available || !canEdit || busy
    const exception = state.source === (restaurantId === null ? 'organization' : 'restaurant')
    return (
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Toggle checked={state.active} label={`${m.name} · ${place}`} onChange={(active) => { if (!locked) void apply({ key: m.key, active, restaurant_id: restaurantId }, `${m.name}: ${active ? 'activo' : 'apagado'} en ${place}.`) }} />
          <span className="text-[12px] text-dim">{SOURCE[state.source]}</span>
        </div>
        {(state.ends || state.price !== null) && <p className="text-[12px] text-dim">{state.ends && `Hasta ${state.ends}`}{state.price !== null && ` · $ ${state.price.toLocaleString('es-CO')}`}</p>}
        {canEdit && !m.required && m.available && (
          <div className="flex gap-2 mt-1">
            <button type="button" className="text-[12px] text-primary font-semibold" onClick={() => setDetails({ module: m, state, restaurantId })}>Vigencia y cupos</button>
            {exception && <button type="button" className="text-[12px] text-soft font-semibold" onClick={() => void apply({ key: m.key, restaurant_id: restaurantId, clear: true }, `${m.name} vuelve a lo del plan en ${place}.`)}>Quitar excepción</button>}
          </div>
        )}
      </td>
    )
  }
  return (
    <section aria-label="Módulos" className="rounded-lg border border-border p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-[17px] font-semibold">Módulos</h2>
          <p className="text-[14px] text-soft">Lo que manda el plan, con excepciones para la organización o para un local. Apagar un módulo no borra sus datos.</p></div>
        <div className="w-56"><Select label="Plan" value={data.plan} disabled={!canEdit || busy} onChange={(e) => void apply({ plan: e.target.value }, 'Plan cambiado.')}>
          {data.plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</Select></div>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      <ScrollTable label="los módulos">
        <table aria-label="Módulos por local" className="data-table text-[14px]">
          <thead><tr className="text-left text-soft border-b border-border"><th className="px-3 py-2">Módulo</th><th className="px-3 py-2">Organización</th>
            {data.restaurants.map((r) => <th key={r.id} className="px-3 py-2">{r.name}</th>)}</tr></thead>
          <tbody>{data.catalog.map((m) => (
            <tr key={m.key} className="border-b border-border last:border-0 align-top">
              <td className="px-3 py-2"><div className="font-semibold">{m.name}</div>
                {m.required && <StatusPill tone="info">Siempre activo</StatusPill>}{!m.available && <StatusPill tone="progress">Próximamente</StatusPill>}
                {m.depends.length > 0 && <p className="text-[12px] text-dim">Requiere: {m.depends.map((d) => data.catalog.find((c) => c.key === d)?.name ?? d).join(', ')}</p>}</td>
              {cell(m, stateOf(data.organization, m.key), null, 'la organización')}
              {data.restaurants.map((r) => <td key={r.id} className="p-0">{cell(m, stateOf(r.modules, m.key), r.id, r.name)}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </ScrollTable>
      {details && <DetailsModal {...details} onClose={() => setDetails(null)} onSave={(change) => { setDetails(null); void apply(change, `${details.module.name}: vigencia y cupos guardados.`) }} />}
    </section>
  )
}

function DetailsModal({ module, state, restaurantId, onClose, onSave }: { module: CatalogModule; state: ModuleState; restaurantId: number | null; onClose: () => void; onSave: (c: ModuleChange) => void }) {
  const [ends, setEnds] = useState(state.ends ?? '')
  const [price, setPrice] = useState(state.price === null ? '' : String(state.price))
  const [notes, setNotes] = useState(state.notes ?? '')
  const [limits, setLimits] = useState<Record<string, string>>(() => Object.fromEntries(module.units.map((u) => [u, state.limits?.[u] === undefined ? '' : String(state.limits[u])])))
  const save = () => {
    const parsed = Object.fromEntries(Object.entries(limits).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]))
    onSave({ key: module.key, active: state.active, restaurant_id: restaurantId, ends: ends || null, price: price === '' ? null : Number(price), notes, limits: Object.keys(parsed).length ? parsed : null })
  }
  return (
    <Modal open onClose={onClose} title={`${module.name} · vigencia y cupos`} size="center"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Guardar</Button></>}>
      <div className="p-6 flex flex-col gap-4">
        <TextInput label="Vence el" hint="Después de esta fecha vuelve a mandar el plan." type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
        <TextInput label="Precio especial ($)" hint="Vacío: el del plan." type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
        {module.units.map((u) => <TextInput key={u} label={`Cupo de ${u.replaceAll('_', ' ')}`} hint="Vacío: sin cupo." type="number" min={0} value={limits[u]} onChange={(e) => setLimits({ ...limits, [u]: e.target.value })} />)}
        <TextInput label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  )
}

const thisMonth = () => new Date().toISOString().slice(0, 7)

// Plan W3: el consumo del cliente en un mes, por módulo, unidad y local.
export function OrganizationUsagePanel({ slug }: { slug: string }) {
  const [period, setPeriod] = useState(thisMonth)
  const [data, setData] = useState<OrganizationUsage | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    organizationUsage(slug, period).then((d) => { if (alive) { setData(d); setError('') } }).catch((e: unknown) => { if (alive) setError(message(e)) })
    return () => { alive = false }
  }, [slug, period])
  const rows = data?.period === period ? data.rows : null
  return (
    <section aria-label="Consumo del mes" className="rounded-lg border border-border p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-[17px] font-semibold">Consumo del mes</h2>
        <div className="w-48"><TextInput label="Mes" type="month" value={period} onChange={(e) => setPeriod(e.target.value || thisMonth())} /></div>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!rows ? !error && <p role="status" className="text-soft">Leyendo el consumo…</p>
        : rows.length === 0 ? <p className="text-soft">Sin consumo registrado en este mes.</p> : (
          <table aria-label="Consumo" className="data-table text-[14px]">
            <thead><tr className="text-left text-soft border-b border-border"><th className="px-3 py-2">Módulo</th><th className="px-3 py-2">Unidad</th><th className="px-3 py-2">Local</th><th className="px-3 py-2 text-right">Cantidad</th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0"><td className="px-3 py-2">{r.module_name}</td><td className="px-3 py-2">{r.unit_name}</td>
                <td className="px-3 py-2">{r.restaurant_name ?? 'Organización'}</td><td className="px-3 py-2 text-right tabular">{r.quantity.toLocaleString('es-CO')}</td></tr>))}</tbody>
          </table>
        )}
    </section>
  )
}
