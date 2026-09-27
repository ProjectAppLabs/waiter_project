'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Chip } from '@/components/kit/Chip'
import { Icon } from '@/components/kit/Icon'
import { StatusPill } from '@/components/kit/StatusPill'
import { Toggle } from '@/components/kit/Toggle'
import { MapsLinkField, type MapsStatus } from '@/components/settings/MapsLinkField'
import { SaveBar, useSaveState } from '@/components/settings/SettingsForms'
import { Button } from '@/components/ui/Button'
import { Select, TextInput } from '@/components/ui/Field'
import { play, setStation, type SoundId, type Station } from '@/lib/audio/sounds'
import { ROLES, type Role } from '@/lib/domain/roles'
import { inviteUser, resendInvite, saveCompany, saveFloor, saveTable, setUserRole, type CompanyInfo, type FloorInfo, type PaymentMethodInfo, type TaxInfo, type UserInfo } from '@/lib/services/settings'

// Secciones de Configuración dibujadas con los componentes del kit (tarjetas, chips, píldoras, toggles).
// Marca y Plantilla del menú tienen su propio componente; umbrales y ROI usan ThresholdsForm.

const DENSITIES = ['compact', 'balanced', 'wide'] as const
const SOUNDS: SoundId[] = ['tap', 'ticket', 'listo', 'demora', 'critico', 'llama', 'cobro', 'error']
const readLocal = (key: string, fallback: string) => { try { return localStorage.getItem(key) ?? fallback } catch { return fallback } }
const writeLocal = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* sin almacenamiento: no pasa nada */ } }
const box = 'rounded-md border border-border p-4 flex flex-col gap-3'

export function CompanyForm({ initial }: { initial: CompanyInfo }) {
  const t = useTranslations('pos.settings.restaurant')
  const [c, setC] = useState(initial)
  const [state, save] = useSaveState()
  // La ubicación entra como enlace de Google Maps; en Odoo se guardan latitud y longitud como siempre.
  const [maps, setMaps] = useState<MapsStatus>('empty')
  const initialPoint = c.waiter_latitude && c.waiter_longitude ? { lat: Number(c.waiter_latitude), lng: Number(c.waiter_longitude) } : null
  const [start] = useState(initialPoint && Number.isFinite(initialPoint.lat) && Number.isFinite(initialPoint.lng) ? initialPoint : null)
  const field = (key: keyof CompanyInfo, label: string) => <TextInput key={key} label={label} value={String(c[key] ?? '')} onChange={(e) => setC((v) => ({ ...v, [key]: e.target.value }))} />
  const mapsBlocks = maps === 'resolving' || maps === 'invalid' || maps === 'noPoint' || maps === 'unreachable'
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-4">{field('name', t('name'))}{field('vat', t('vat'))}{field('phone', t('phone'))}{field('email', t('email'))}{field('street', t('street'))}{field('city', t('city'))}</div>
      <p className="text-sm text-soft">{t('addressHint')}</p>
      <MapsLinkField initial={start} onChange={(point, status) => { setMaps(status); if (status === 'found' || status === 'empty') setC((v) => ({ ...v, waiter_latitude: point ? String(point.lat) : '', waiter_longitude: point ? String(point.lng) : '' })) }} />
      <SaveBar state={state} onSave={() => save(() => saveCompany(c))} disabled={!c.name.trim() || mapsBlocks} />
    </div>
  )
}

export function FloorsForm({ floors, configId, onChanged }: { floors: FloorInfo[]; configId: number; onChanged: () => Promise<void> }) {
  const t = useTranslations('admin.settings.floors')
  const ts = useTranslations('admin.common')
  const [newFloor, setNewFloor] = useState('')
  const [drafts, setDrafts] = useState<Record<number, { number: number; seats: number; active: boolean }>>({})
  const draft = (id: number, base: { number: number; seats: number; active: boolean }) => drafts[id] ?? base
  const edit = (id: number, base: { number: number; seats: number; active: boolean }, patch: Partial<{ number: number; seats: number; active: boolean }>) => setDrafts((x) => ({ ...x, [id]: { ...draft(id, base), ...patch } }))
  return (
    <div className="flex flex-col gap-4">
      {floors.map((f) => (
        <section key={f.id} aria-label={f.name} className={box}>
          <div className="flex items-center gap-3"><span className="w-10 h-10 rounded-md bg-primary-soft text-primary grid place-items-center"><Icon name="grid" size={20} /></span><span className="text-[16px] font-semibold text-ink">{f.name}</span><span className="ml-auto text-[13px] text-soft">{t('tables', { n: f.tables.length })}</span></div>
          <div className="flex flex-col gap-2">
            {f.tables.map((tb) => {
              const d = draft(tb.id, tb)
              return (
                <div key={tb.id} className="grid grid-cols-[120px_120px_1fr_auto] gap-3 items-end rounded-md bg-muted p-3">
                  <TextInput label={t('number')} type="number" value={d.number} onChange={(e) => edit(tb.id, tb, { number: Number(e.target.value) })} className="tabular" />
                  <TextInput label={t('seats')} type="number" value={d.seats} onChange={(e) => edit(tb.id, tb, { seats: Number(e.target.value) })} className="tabular" />
                  <div className="flex items-center gap-3 h-tap-min"><Toggle checked={d.active} onChange={(v) => edit(tb.id, tb, { active: v })} label={`${t('active')} ${t('table', { n: d.number })}`} /><span className="text-[15px] text-ink">{t('active')}</span></div>
                  <Button size="compact" variant={drafts[tb.id] ? 'primary' : 'secondary'} disabled={!drafts[tb.id]} onClick={async () => { await saveTable(tb.id, f.id, d); await onChanged(); setDrafts((x) => { const { [tb.id]: _omit, ...rest } = x; void _omit; return rest }) }}>{ts('save')}</Button>
                </div>
              )
            })}
          </div>
          <Button size="compact" className="self-start" onClick={async () => { await saveTable(null, f.id, { number: Math.max(0, ...f.tables.map((x) => x.number)) + 1, seats: 4, active: true }); await onChanged() }}><Icon name="plus" size={18} />{t('newTable')}</Button>
        </section>
      ))}
      <div className="flex items-end gap-3 max-w-md"><TextInput label={t('floorName')} value={newFloor} onChange={(e) => setNewFloor(e.target.value)} /><Button variant="primary" disabled={!newFloor.trim()} onClick={async () => { await saveFloor(null, newFloor.trim(), configId); setNewFloor(''); await onChanged() }}><Icon name="plus" size={18} />{t('newFloor')}</Button></div>
    </div>
  )
}

export function PaymentMethodsList({ methods }: { methods: PaymentMethodInfo[] }) {
  const t = useTranslations('admin.settings.payments')
  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <p className="text-[14px] text-soft">{t('hint')}</p>
      {methods.map((m) => (
        <div key={m.id} className="flex items-center gap-3 rounded-md border border-border p-3 text-[15px]">
          <span className="w-10 h-10 rounded-md bg-primary-soft text-primary grid place-items-center"><Icon name={m.type === 'cash' ? 'money' : m.type === 'bank' ? 'card' : 'user'} size={20} /></span>
          <span className="font-semibold text-ink">{m.name}</span><span className="ml-auto text-soft">{t(`type.${m.type as 'cash' | 'bank' | 'pay_later'}`)}</span>
        </div>
      ))}
    </div>
  )
}

export function TaxesList({ taxes }: { taxes: TaxInfo[] }) {
  const t = useTranslations('admin.settings.taxes')
  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <p className="text-[14px] text-soft">{t('hint')}</p>
      {taxes.map((x) => (
        <div key={x.id} className="flex items-center gap-3 rounded-md border border-border p-3 text-[15px]">
          <span className="w-10 h-10 rounded-md bg-primary-soft text-primary grid place-items-center"><Icon name="percentage" size={20} /></span>
          <span className="font-semibold text-ink">{x.name}</span><span className="ml-auto text-soft tabular">{x.amount}%</span>
        </div>
      ))}
    </div>
  )
}

export function UsersForm({ users, onChanged }: { users: UserInfo[]; onChanged: () => Promise<void> }) {
  const t = useTranslations('admin.settings.users')
  const roles = useTranslations('pos.nav.roles')
  const [u, setU] = useState<{ name: string; email: string; role: Role }>({ name: '', email: '', role: 'waiter' })
  const [resent, setResent] = useState<number | null>(null)
  const [state, save] = useSaveState()
  return (
    <div className="flex flex-col gap-4">
      <section aria-label={t('list')} className={box}>
        <p className="text-[15px] font-semibold text-ink">{t('list')}</p>
        {users.map((x) => (
          <div key={x.id} className="flex items-center gap-3 rounded-md bg-muted p-3 text-[15px]">
            <span className="w-10 h-10 rounded-md bg-surface border border-border text-ink grid place-items-center"><Icon name="user" size={20} /></span>
            <div className="min-w-0"><p className="font-semibold text-ink truncate">{x.name}</p><p className="text-[13px] text-soft truncate">{x.login} · {t('lastLogin')}: {x.lastLogin ? x.lastLogin.slice(0, 10) : t('never')}</p></div>
            <span className="ml-auto flex items-center gap-3">
              <StatusPill tone={x.activated ? 'success' : 'progress'}>{x.activated ? t('active') : t('pending')}</StatusPill>
              {!x.activated && <Button size="compact" onClick={async () => { await resendInvite(x.id); setResent(x.id) }}>{resent === x.id ? t('resent') : t('resend')}</Button>}
              <select aria-label={`${t('role')}: ${x.name}`} value={x.role} onChange={async (e) => { await setUserRole(x.id, e.target.value as Role); await onChanged() }} className="h-tap-min px-3 rounded-[10px] border border-border bg-surface text-[15px] text-ink">
                {ROLES.map((r) => <option key={r} value={r}>{roles(r)}</option>)}
              </select>
            </span>
          </div>
        ))}
      </section>
      <section aria-label={t('invite')} className={box}>
        <p className="text-[15px] font-semibold text-ink">{t('invite')}</p>
        <div className="grid grid-cols-3 gap-4">
          <TextInput label={t('name')} value={u.name} onChange={(e) => setU((v) => ({ ...v, name: e.target.value }))} />
          <TextInput label={t('email')} type="email" value={u.email} onChange={(e) => setU((v) => ({ ...v, email: e.target.value }))} hint={t('emailHint')} />
          <Select label={t('role')} hint={t('roleHint')} value={u.role} onChange={(e) => setU((v) => ({ ...v, role: e.target.value as Role }))}>{ROLES.map((r) => <option key={r} value={r}>{roles(r)}</option>)}</Select>
        </div>
        <SaveBar state={state} onSave={() => save(async () => { await inviteUser(u); setU({ name: '', email: '', role: 'waiter' }); await onChanged() })} disabled={!u.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)} />
      </section>
    </div>
  )
}

export function DisplayForm() {
  const t = useTranslations('admin.settings.display')
  const [density, setDensity] = useState(() => readLocal('waiter.density', 'wide'))
  const [station, setSt] = useState<Station>(() => readLocal('waiter.station', 'tablet') as Station)
  useEffect(() => { document.documentElement.dataset.density = density; writeLocal('waiter.density', density) }, [density])
  useEffect(() => { setStation(station); writeLocal('waiter.station', station) }, [station])
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <Select label={t('density')} value={density} onChange={(e) => setDensity(e.target.value)}>{DENSITIES.map((d) => <option key={d} value={d}>{t(d)}</option>)}</Select>
        <Select label={t('station')} value={station} onChange={(e) => setSt(e.target.value as Station)}><option value="kds">{t('kds')}</option><option value="tablet">{t('tablet')}</option><option value="caja">{t('caja')}</option></Select>
      </div>
      <div className={box}>
        <p className="text-[15px] font-semibold text-ink">{t('sounds')}</p>
        <div className="flex flex-wrap gap-2">{SOUNDS.map((id) => <Chip key={id} label={`${t('test')}: ${id}`} icon="volume" onClick={() => play(id)} />)}</div>
      </div>
      <p className="text-[13px] text-soft">{t('localHint')}</p>
    </div>
  )
}
