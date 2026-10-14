'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { ZoneStaffModal, type StaffSave } from '@/components/tables/ZoneStaffModal'
import type { FloorDocument } from '@/lib/domain/floorPlan'
import { EMPTY_STAFF, staffNames, zonesWithoutStaff, type ZoneStaff } from '@/lib/domain/zoneStaff'
import { useIdentity } from '@/lib/hooks/useIdentity'
import { listPosEmployees, type PosEmployee } from '@/lib/services/employees'
import { assignZoneStaff, assignZones, readZoneStaff } from '@/lib/services/floorPlan'
import { useAuthStore } from '@/lib/stores/authStore'
import { toast } from '@/lib/stores/toastStore'
import { useOrderStore } from '@/lib/stores/orderStore'

// Barra de zonas de un piso: filtra el plano por zona y abre el reparto de meseros. El reparto habitual vive en el
// piso y se prepara con la caja cerrada; el turno abierto lo hereda y puede ajustarlo solo para sí. `onStaff` entrega
// los nombres por zona para rotular el plano. Un piso sin zonas le explica al administrador cómo crearlas en vez de
// esconder la opción sin decir por qué.
export function FloorZones({ plan, floorName, configId, onFilter, onStaff }: {
  plan: FloorDocument; floorName: string; configId: number; onFilter: (ids: number[] | null) => void; onStaff?: (names: Record<string, string[]>) => void
}) {
  const t = useTranslations('tables.zoneStaff')
  const session = useAuthStore((s) => s.session), employee = useAuthStore((s) => s.employee)
  const { role } = useIdentity()
  const calls = useOrderStore((s) => s.calls)
  const [staff, setStaff] = useState<ZoneStaff>(EMPTY_STAFF)
  const [employees, setEmployees] = useState<PosEmployee[]>([])
  const [editing, setEditing] = useState(false), [filter, setFilter] = useState('all'), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const sessionId = session?.id ?? null, floorId = plan.id, hasZones = plan.zones.length > 0

  const load = useCallback(async () => { if (floorId) setStaff(await readZoneStaff(floorId, sessionId)) }, [floorId, sessionId])
  useEffect(() => {
    if (!floorId || !hasZones) return
    let alive = true
    const tick = () => readZoneStaff(floorId, sessionId).then((s) => { if (alive) setStaff(s) }).catch(() => { if (alive) setError(t('loadFailed')) })
    void tick()
    void listPosEmployees(configId).then((e) => { if (alive) setEmployees(e) }).catch(() => undefined)
    // Con el turno abierto otro administrador puede cambiar el reparto desde otro terminal.
    const timer = sessionId ? setInterval(() => void tick(), 10000) : null
    return () => { alive = false; if (timer) clearInterval(timer) }
  }, [floorId, sessionId, configId, hasZones, t])

  const mine = employee?.id ?? 0
  useEffect(() => {
    if (filter === 'all') { onFilter(null); return }
    const zones = filter === 'mine' ? plan.zones.filter((z) => (staff.assignments[z.id] ?? []).includes(mine)).map((z) => z.id) : [filter]
    onFilter(plan.tables.filter((tb) => zones.includes(tb.zone)).flatMap((tb) => (tb.id === null ? [] : [tb.id])))
  }, [filter, staff.assignments, mine, plan, onFilter])

  const names = useMemo(() => staffNames(plan.zones, staff.assignments, employees), [plan.zones, staff.assignments, employees])
  useEffect(() => { onStaff?.(names) }, [names, onStaff])

  if (!hasZones) {
    if (role !== 'admin') return null
    return (
      <p className="border-t border-border pt-4 text-[13px] leading-relaxed text-soft flex items-start gap-2">
        <Icon name="zone" size={18} className="shrink-0" />{t('noZones')}
      </p>
    )
  }

  async function open() {
    setError('')
    try { setEmployees(await listPosEmployees(configId)); await load(); setEditing(true) } catch { setError(t('employeesFailed')) }
  }
  async function run(work: () => Promise<unknown>, done: string) {
    setBusy(true)
    try { await work(); await load(); setEditing(false); setError(''); toast({ title: done, tone: 'success' }) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const save = ({ assignments, alsoUsual }: StaffSave) => run(async () => {
    if (!floorId) return
    // «También como habitual»: se guarda en el piso y el turno vuelve a heredarlo (null), en vez de quedarse con una
    // copia propia que dejaría de seguir los cambios futuros del reparto habitual.
    if (!sessionId || alsoUsual) await assignZoneStaff(configId, floorId, assignments)
    if (sessionId) await assignZones(sessionId, floorId, alsoUsual ? null : assignments)
  }, t('saved'))
  const reset = () => run(async () => { if (sessionId && floorId) await assignZones(sessionId, floorId, null) }, t('resetDone'))

  const inView = (zone: string) => filter === 'all' || (filter === 'mine' ? (staff.assignments[zone] ?? []).includes(mine) : zone === filter)
  const zoneCalls = plan.tables.filter((tb) => calls.some((c) => c.tableId === tb.id) && inView(tb.zone)).length
  const missing = zonesWithoutStaff(plan.zones, staff.assignments).length
  return (
    <section className="border-t border-border pt-4 text-sm" aria-label={t('bar')}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-2 text-soft">{t('filter')}
          <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">{t('all')}</option>
            {employee && <option value="mine">{t('mine')}</option>}
            {plan.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </Select>
        </label>
        <span className="text-soft">{t('calls', { count: zoneCalls })}</span>
        {role === 'admin' && (
          <Button type="button" size="compact" onClick={() => void open()} className="w-full h-auto! min-h-tap-min py-3 flex-wrap">
            <span className="flex min-w-0 items-center gap-2"><Icon name="users" size={20} className="shrink-0" /><span>{t('open')}</span></span>
            {missing > 0 && <span className="px-2 py-0.5 rounded-full bg-progress-soft text-progress-ink text-xs font-semibold">{t('missing', { count: missing })}</span>}
          </Button>
        )}
      </div>
      {error && !editing && <p role="alert" className="text-danger-ink py-2">{error}</p>}
      {editing && <ZoneStaffModal plan={plan} floorName={floorName} staff={staff} employees={employees} shiftOpen={sessionId !== null} busy={busy} error={error}
        onClose={() => { setEditing(false); setError('') }} onSave={(s) => void save(s)} onReset={() => void reset()} />}
    </section>
  )
}
