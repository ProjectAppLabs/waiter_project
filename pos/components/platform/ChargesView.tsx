'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Chip } from '@/components/kit/Chip'
import { Modal } from '@/components/kit/Modal'
import { StatusPill } from '@/components/kit/StatusPill'
import { Button } from '@/components/ui/Button'
import { Select, TextInput } from '@/components/ui/Field'
import { RowMenu } from '@/components/ui/RowMenu'
import { ScrollTable } from '@/components/ui/ScrollTable'
import { SortTh, TableSearch } from '@/components/ui/SortTh'
import { money } from '@/components/platform/OrganizationsView'
import { useTableView, type Sorters } from '@/lib/hooks/useTableView'
import { billingRules, chargeOrg, listCharges, payCharge, saveBillingRules, voidCharge, type BillingRules, type Charge, type ChargeMethod, type ChargeState, type ChargesSummary } from '@/lib/services/core/platform'
import { usePlatformStore } from '@/lib/stores/platformStore'

export const CHARGE_STATE: Record<ChargeState, { label: string; tone: 'success' | 'progress' | 'danger' | 'neutral' }> = {
  pending: { label: 'Por pagar', tone: 'progress' }, overdue: { label: 'Vencida', tone: 'danger' }, paid: { label: 'Pagada', tone: 'success' }, void: { label: 'Anulada', tone: 'neutral' },
}
const METHODS: [ChargeMethod, string][] = [['transferencia', 'Transferencia'], ['nequi', 'Nequi'], ['efectivo', 'Efectivo'], ['otro', 'Otro']]
type Filter = 'all' | ChargeState
const FILTERS: [Filter, string][] = [['all', 'Todas'], ['overdue', 'Vencidas'], ['pending', 'Por pagar'], ['paid', 'Pagadas'], ['void', 'Anuladas']]

// Contrato M: las cuentas de cobro mensuales de cada cliente. ProjectApp registra a mano el pago recibido; con mora, la
// organización se suspende sola y se reactiva al pagar.
export function ChargesView() {
  const admin = usePlatformStore((s) => s.user?.role === 'admin')
  const [rows, setRows] = useState<Charge[] | null>(null)
  const [summary, setSummary] = useState<ChargesSummary | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [paying, setPaying] = useState<Charge | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let alive = true
    listCharges().then((r) => { if (alive) { setRows(r.charges); setSummary(r.summary); setError('') } }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudieron leer los cobros.') })
    return () => { alive = false }
  }, [version])
  const table = useTableView((rows ?? []).filter((c) => filter === 'all' || c.state === filter), {
    org: (c) => chargeOrg(c).name, period: (c) => c.period, amount: (c) => c.amount, due: (c) => c.due_date, state: (c) => CHARGE_STATE[c.state].label, paid: (c) => c.paid_at,
  } as Sorters<Charge>, (c) => `${chargeOrg(c).name} ${chargeOrg(c).slug} ${c.period} ${c.reference}`, { key: 'due', dir: 'desc' })
  const act = async (run: () => Promise<unknown>, done: string) => {
    setError(''); setNotice('')
    try { await run(); setNotice(done); setVersion((v) => v + 1) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar.') }
  }
  return (
    <section className="flex flex-col gap-5">
      <div><h1 className="text-[26px] font-bold">Cobros</h1><p className="mt-1 text-soft">La cuenta de cobro de cada mes por cliente. Registra aquí el pago recibido; la mora suspende sola al cliente y el pago lo reactiva.</p></div>
      {summary && (
        <ul aria-label="Resumen de cobros" className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {([['Por pagar', summary.pending], ['Vencido', summary.overdue], ['Recibido este mes', summary.paid_this_month]] as const).map(([k, v]) => (
            <li key={k} className={`rounded-lg border p-4 ${k === 'Vencido' && v > 0 ? 'border-danger bg-danger-soft' : 'border-border bg-surface'}`}><p className="text-[13px] text-soft">{k}</p><p className="mt-1 text-[20px] font-bold tabular">{money(v)}</p></li>))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <TableSearch value={table.query} onChange={table.setQuery} placeholder="Buscar cliente o referencia" className="w-72 max-w-full" />
        {FILTERS.map(([f, label]) => <Chip key={f} label={label} count={(rows ?? []).filter((c) => f === 'all' || c.state === f).length} active={filter === f} onClick={() => setFilter(f)} />)}
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      {rows === null ? !error && <p role="status" className="text-soft">Cargando cobros…</p> : rows.length === 0 ? <p className="text-soft">Todavía no hay cuentas de cobro. Se generan solas el día 1 de cada mes.</p> : (
        <ScrollTable label="los cobros">
          <table aria-label="Cobros" className="data-table text-[15px]">
            <thead><tr className="text-left text-soft border-b border-border">
              {([['org', 'Cliente', 'left'], ['period', 'Mes', 'left'], ['amount', 'Valor', 'right'], ['due', 'Vence', 'left'], ['state', 'Estado', 'left'], ['paid', 'Pago', 'left']] as const)
                .map(([k, h, a]) => <SortTh key={k} label={h} sortKey={k} sort={table.sort} onSort={table.toggle} align={a} />)}<th /></tr></thead>
            <tbody>{table.view.map((c) => {
              const org = chargeOrg(c)
              return (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3"><Link href={`/plataforma/clientes/${org.slug}`} className="font-semibold hover:text-primary">{org.name}</Link></td>
                  <td className="px-4 py-3 tabular">{c.period}</td>
                  <td className="px-4 py-3 text-right tabular"><div>{money(c.amount)}</div>
                    {/* Plan W: el detalle de la cuenta, línea por línea (mensualidad por local y uso). */}
                    {(c.lines?.length ?? 0) > 0 && <ul aria-label={`Detalle ${c.period}`} className="mt-1 text-[12px] text-dim text-right">{c.lines!.map((l, i) => <li key={i}>{l.concept}: {l.quantity} × {money(l.unit_price)}</li>)}</ul>}</td>
                  <td className="px-4 py-3 tabular">{c.due_date}</td>
                  <td className="px-4 py-3"><StatusPill tone={CHARGE_STATE[c.state].tone}>{CHARGE_STATE[c.state].label}</StatusPill></td>
                  <td className="px-4 py-3 text-soft">{c.paid_at ? <>{new Date(c.paid_at).toLocaleDateString('es-CO', { dateStyle: 'medium' })}<div className="text-[13px] text-dim">{c.method} {c.reference && `· ${c.reference}`}</div></> : '—'}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-2">
                    {(c.state === 'pending' || c.state === 'overdue') && <Button size="compact" onClick={() => setPaying(c)}>Registrar pago</Button>}
                    {admin && c.state !== 'paid' && c.state !== 'void' && <RowMenu label={`Más acciones del cobro ${c.period} de ${org.name}`} items={[{ label: 'Anular cuenta', onSelect: () => { const notes = window.prompt('¿Por qué se anula esta cuenta de cobro?') ?? ''; if (notes.trim()) void act(() => voidCharge(c.id, notes.trim()), 'Cuenta anulada.') } }]} />}
                  </div></td>
                </tr>)
            })}</tbody>
          </table>
        </ScrollTable>
      )}
      {admin && <BillingRulesForm />}
      {paying && <PayModal charge={paying} onClose={() => setPaying(null)} onPaid={(msg) => { setPaying(null); setNotice(msg); setVersion((v) => v + 1) }} />}
    </section>
  )
}

function PayModal({ charge, onClose, onPaid }: { charge: Charge; onClose: () => void; onPaid: (message: string) => void }) {
  const [method, setMethod] = useState<ChargeMethod>('transferencia')
  const [reference, setReference] = useState(''), [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const org = chargeOrg(charge)
  const save = async () => {
    setBusy(true); setError('')
    try { await payCharge(charge.id, { method, reference: reference.trim(), notes: notes.trim() }); onPaid(`Pago de ${org.name} (${charge.period}) registrado.`) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar el pago.') } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Registrar pago · ${org.name} · ${charge.period}`} size="center"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={busy} onClick={() => void save()}>Registrar {money(charge.amount)}</Button></>}>
      <div className="p-6 flex flex-col gap-4">
        <Select label="Medio de pago" value={method} onChange={(e) => setMethod(e.target.value as ChargeMethod)}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <TextInput label="Referencia" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Número de la transferencia o comprobante" />
        <TextInput label="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {charge.state === 'overdue' && <p className="text-[14px] text-soft">Si el cliente está suspendido por mora y no tiene otras cuentas vencidas, se reactiva al registrar el pago.</p>}
        {error && <p role="alert" className="text-danger">{error}</p>}
      </div>
    </Modal>
  )
}

const UNIT_PRICES: [string, string, string][] = [
  ['asistente_menu.mensaje_ia', 'Asistente en el menú, por mensaje ($)', 'Cada respuesta del asistente del menú. En 0 no se cobra.'],
  ['asistente_whatsapp.pedido_asistente', 'Asistente de WhatsApp, por pedido ($)', 'Cada pedido cerrado por el asistente de WhatsApp.'],
]

function BillingRulesForm() {
  const [rules, setRules] = useState<BillingRules | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  useEffect(() => { billingRules().then(setRules).catch(() => setError('No se pudieron leer las reglas de cobro.')) }, [])
  if (!rules) return error ? <p role="alert" className="text-danger">{error}</p> : null
  type NumericRule = Exclude<keyof BillingRules, 'unit_prices'>
  const field = (key: NumericRule, label: string, hint: string) => (
    <TextInput label={label} hint={hint} type="number" min={0} value={rules[key]} onChange={(e) => setRules({ ...rules, [key]: Number(e.target.value) })} />)
  return (
    <section aria-label="Reglas de cobro" className="rounded-lg border border-border p-5 flex flex-col gap-4">
      <h2 className="text-[18px] font-semibold">Reglas de cobro</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {field('billing_day', 'Día de cobro', 'Día del mes en que vence la cuenta, antes del plazo.')}
        {field('grace_days', 'Días de plazo', 'Días después del día de cobro para pagar.')}
        {field('suspend_after_days', 'Suspender tras', 'Días de mora antes de suspender al cliente.')}
        {field('reminder_days', 'Recordar antes', 'Días antes del vencimiento para avisar al dueño.')}
      </div>
      {/* Plan W: lo que se cobra por uso, por unidad. En cero no se cobra (no sale línea en la cuenta). */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {UNIT_PRICES.map(([key, label, hint]) => (
          <TextInput key={key} label={label} hint={hint} type="number" min={0} value={rules.unit_prices?.[key] ?? 0}
            onChange={(e) => setRules({ ...rules, unit_prices: { ...rules.unit_prices, [key]: Number(e.target.value) } })} />
        ))}
      </div>
      <div className="flex items-center gap-3"><Button onClick={() => { setError(''); setNotice(''); void saveBillingRules(rules).then((r) => { setRules(r); setNotice('Reglas guardadas.') }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudieron guardar.')) }}>Guardar reglas</Button>
        {notice && <span role="status" className="text-success-ink">{notice}</span>}{error && <span role="alert" className="text-danger">{error}</span>}</div>
    </section>
  )
}
