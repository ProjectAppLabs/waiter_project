'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import type { FloorDocument } from '@/lib/domain/floorPlan'
import { initials, sameStaff, toggleStaff, unassigned, type Assignments, type ZoneStaff } from '@/lib/domain/zoneStaff'
import type { PosEmployee } from '@/lib/services/employees'
import { cn } from '@/lib/utils'

export interface StaffSave { assignments: Assignments; alsoUsual: boolean }

// Reparto de meseros por zona. Una tarjeta por zona con su color y sus mesas; cada empleado es una ficha que se
// enciende o se apaga (puede estar en varias zonas). Con la caja cerrada edita el reparto habitual del piso; con la
// caja abierta ajusta solo el turno, y una casilla permite dejarlo también como habitual.
export function ZoneStaffModal({ plan, floorName, staff, employees, shiftOpen, busy, error, onClose, onSave, onReset }: {
  plan: FloorDocument; floorName: string; staff: ZoneStaff; employees: PosEmployee[]; shiftOpen: boolean; busy: boolean; error: string
  onClose: () => void; onSave: (save: StaffSave) => void; onReset: () => void
}) {
  const t = useTranslations('tables.zoneStaff')
  const roles = useTranslations('pos.nav.roles')
  const [draft, setDraft] = useState<Assignments>(staff.assignments)
  const [alsoUsual, setAlsoUsual] = useState(false)
  // Meseros primero: son a quienes se reparte casi siempre.
  const people = [...employees].sort((a, b) => Number(a.role !== 'waiter') - Number(b.role !== 'waiter'))
  const free = unassigned(people, draft)
  const dirty = !sameStaff(draft, staff.assignments) || (alsoUsual && !sameStaff(draft, staff.plan))
  return (
    <Modal open onClose={onClose} title={t('title', { floor: floorName })} size="medium"
      footer={
        <div className="flex flex-wrap items-center gap-3">
          {shiftOpen && (
            <label className="flex items-center gap-2 text-sm text-soft min-h-11">
              <input type="checkbox" className="w-5 h-5 accent-[var(--kit-primary)]" checked={alsoUsual} onChange={(e) => setAlsoUsual(e.target.checked)} />{t('alsoUsual')}
            </label>
          )}
          <button type="button" onClick={onClose} disabled={busy} className="ml-auto h-11 px-5 rounded-md border border-border text-ink font-medium">{t('cancel')}</button>
          <button type="button" onClick={() => onSave({ assignments: draft, alsoUsual })} disabled={busy || !dirty}
            className="h-11 px-5 rounded-md bg-primary text-primary-ink font-semibold disabled:opacity-50">{t('save')}</button>
        </div>
      }>
      <div className="p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-soft flex-1 min-w-64">{t(!shiftOpen ? 'introClosed' : staff.source === 'shift' ? 'introShift' : 'introPlan')}</p>
          {shiftOpen && staff.source === 'shift' && (
            <button type="button" onClick={onReset} disabled={busy} className="h-10 px-3 rounded-md border border-border text-sm font-medium text-ink flex items-center gap-2">
              <Icon name="undo" size={16} />{t('reset')}
            </button>
          )}
        </div>
        {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
        {employees.length === 0 ? <p className="text-sm text-soft">{t('noEmployees')}</p> : (
          <>
            <ul className={cn('grid gap-3', plan.zones.length > 1 && 'sm:grid-cols-2')}>
              {plan.zones.map((z) => {
                const ids = draft[z.id] ?? []
                return (
                  <li key={z.id} role="group" aria-label={z.name} className="rounded-lg border border-border overflow-hidden flex flex-col">
                    <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: z.color + '1f', borderBottom: `2px solid ${z.color}` }}>
                      <span aria-hidden className="w-3 h-3 rounded-full" style={{ backgroundColor: z.color }} />
                      <span className="font-semibold text-ink">{z.name}</span>
                      <span className="ml-auto text-xs text-soft">{t('tables', { count: plan.tables.filter((tb) => tb.zone === z.id).length })}</span>
                    </div>
                    <div className="p-3 flex flex-wrap gap-2">
                      {people.map((e) => {
                        const on = ids.includes(e.id)
                        return (
                          <button key={e.id} type="button" aria-pressed={on} aria-label={t('toggle', { name: e.name, zone: z.name })}
                            onClick={() => setDraft((a) => toggleStaff(a, z.id, e.id))}
                            className={cn('h-11 pl-1.5 pr-3 rounded-full border flex items-center gap-2 text-sm font-medium transition-colors',
                              on ? 'bg-primary border-primary text-primary-ink' : 'bg-surface border-border text-soft hover:text-ink hover:border-ink/30')}>
                            <span aria-hidden className={cn('w-8 h-8 rounded-full grid place-items-center text-xs font-semibold', on ? 'bg-primary-ink/20' : 'bg-muted text-ink')}>
                              {on ? <Icon name="check" size={16} /> : initials(e.name)}
                            </span>
                            {e.name}
                            {/* En pantalla táctil no hay tooltip: quien no es mesero lleva su rol a la vista. */}
                            {e.role && e.role !== 'waiter' && <span className={cn('text-xs font-normal', on ? 'opacity-80' : 'text-soft')}>{roles(e.role)}</span>}
                          </button>
                        )
                      })}
                    </div>
                    {ids.length === 0 && <p className="px-4 pb-3 text-xs text-soft">{t('nobody')}</p>}
                  </li>
                )
              })}
            </ul>
            <p className="text-sm text-soft">
              <span className="font-medium text-ink">{t('free')}: </span>
              {free.length ? `${free.map((e) => e.name).join(', ')}. ${t('freeHint')}` : t('everyoneBusy')}
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}
