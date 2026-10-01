'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { StatusPill } from '@/components/kit/StatusPill'
import { useOrg } from '@/components/organization/OrgContext'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Select, TextInput } from '@/components/ui/Field'
import { hoursToTime, shiftLabel, timeToHours } from '@/lib/domain/employees'
import { restaurantRule, validAssignment } from '@/lib/domain/restaurant'
import type { AccountRole } from '@/lib/domain/roles'
import { suggestUsername, validUsername } from '@/lib/domain/slug'
import { deactivatePerson, invitePerson, listPeople, resendInvite, updatePerson, type Person, type PersonValues } from '@/lib/services/team'
import { useAuthStore } from '@/lib/stores/authStore'

const ROLES: AccountRole[] = ['waiter', 'cashier', 'admin', 'owner']
const STATUS: Record<Person['status'], { label: string; tone: 'success' | 'progress' | 'neutral' }> = {
  active: { label: 'Activa', tone: 'success' }, pending: { label: 'Invitación pendiente', tone: 'progress' }, no_account: { label: 'Sin cuenta', tone: 'neutral' },
}

// Plan P: el equipo de toda la organización. Cada persona entra con su usuario o su correo y su contraseña; el dueño la da
// de alta aquí (le llega un código por correo para poner su contraseña), le cambia rol, restaurantes, turno o correo, le
// reenvía la invitación (sirve también para restablecer la contraseña) y la desactiva sin borrar su historial.
// Meseros y cajeros trabajan en un solo restaurante y solo entran durante su turno; el encargado lleva uno o varios.
export function TeamView() {
  const roles = useTranslations('pos.nav.roles')
  const { restaurants } = useOrg()
  const myUid = useAuthStore((s) => s.user?.uid ?? null)
  const [people, setPeople] = useState<Person[] | null>(null)
  const [editing, setEditing] = useState<Person | 'new' | null>(null)
  const [leaving, setLeaving] = useState<Person | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)
  useEffect(() => {
    let alive = true
    listPeople().then((p) => { if (alive) { setPeople(p); setError('') } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo leer el equipo.') })
    return () => { alive = false }
  }, [version])
  const names = (ids: number[]) => ids.map((id) => restaurants.find((r) => r.id === id)?.name).filter(Boolean).join(' · ')
  const act = async (run: () => Promise<unknown>, done: string) => {
    setError(''); setNotice('')
    try { await run(); setNotice(done); reload() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar.') }
  }

  return (
    <section className="max-w-4xl flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-[26px] font-bold">Equipo</h1>
          <p className="mt-1 text-soft">Cada persona entra con su usuario o su correo. Meseros y cajeros trabajan en un solo restaurante y solo durante su turno.</p></div>
        <Button variant="primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} />Nueva persona</Button>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      <ul aria-label="Personas" className="flex flex-col gap-2">
        {people === null ? <li className="text-soft">Cargando…</li> : people.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{p.name}{p.username && <span className="ml-2 font-mono text-[13px] text-soft">{p.username}</span>}</p>
              <p className="text-[13px] text-soft truncate">
                {p.role ? roles(p.role) : 'Sin rol'} · {restaurantRule(p.role) === 'all' ? 'Todos los restaurantes' : names(p.configIds) || 'Sin restaurante'}
                {(p.role === 'waiter' || p.role === 'cashier') && ` · ${shiftLabel(p.shift, 'Sin turno: entra a cualquier hora')}`}
              </p>
            </div>
            <StatusPill tone={STATUS[p.status].tone}>{STATUS[p.status].label}</StatusPill>
            <div className="flex flex-wrap gap-2">
              <Button size="compact" onClick={() => setEditing(p)} disabled={p.status === 'no_account'}>Editar</Button>
              <Button size="compact" disabled={p.status === 'no_account' || !p.email}
                onClick={() => void act(() => resendInvite(p.id), p.status === 'pending' ? `Invitación reenviada a ${p.email}.` : `Enviamos a ${p.email} un código para restablecer la contraseña.`)}>
                {p.status === 'pending' ? 'Reenviar invitación' : 'Restablecer contraseña'}</Button>
              {p.userId !== myUid && <Button size="compact" variant="ghost" disabled={p.status === 'no_account'} onClick={() => setLeaving(p)}>Desactivar</Button>}
            </div>
          </li>
        ))}
      </ul>
      {editing && <PersonModal person={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
        onSaved={(message) => { setEditing(null); setNotice(message); setError(''); reload() }} />}
      <ConfirmDialog open={!!leaving} title={`¿Desactivar a ${leaving?.name}?`} destructive confirmLabel="Desactivar" cancelLabel="Cancelar"
        body="No podrá volver a entrar. Su historial (pedidos, cobros y turnos) se conserva con su nombre."
        onCancel={() => setLeaving(null)} onConfirm={() => { const p = leaving; setLeaving(null); if (p) void act(() => deactivatePerson(p.id), `${p.name} quedó desactivada.`) }} />
    </section>
  )
}

function PersonModal({ person, onClose, onSaved }: { person: Person | null; onClose: () => void; onSaved: (message: string) => void }) {
  const roles = useTranslations('pos.nav.roles')
  const { restaurants } = useOrg()
  const owner = useAuthStore((s) => s.user?.role === 'owner')
  const [name, setName] = useState(person?.name ?? '')
  const [username, setUsername] = useState(person?.username ?? '')
  const [usernameTouched, setUsernameTouched] = useState(!!person)
  const [email, setEmail] = useState(person?.email ?? '')
  const [role, setRole] = useState<AccountRole>(person?.role ?? 'waiter')
  const [ids, setIds] = useState<number[]>(person?.configIds ?? (restaurants.length === 1 ? [restaurants[0].id] : []))
  const [start, setStart] = useState(hoursToTime(person?.shift?.from)), [end, setEnd] = useState(hoursToTime(person?.shift?.to))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const rule = restaurantRule(role)
  const shifted = role === 'waiter' || role === 'cashier'
  const onName = (value: string) => { setName(value); if (!usernameTouched) setUsername(suggestUsername(value)) }
  const onRole = (value: AccountRole) => { setRole(value); if (restaurantRule(value) === 'one') setIds((v) => v.slice(0, 1)) }
  const toggle = (id: number) => setIds((v) => (rule === 'one' ? [id] : v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))
  // Turno a medias no vale: o las dos horas o ninguna (sin turno = sin restricción horaria).
  const shiftOk = !shifted || (start === '' && end === '') || (start !== '' && end !== '' && start !== end)
  const valid = name.trim() && validUsername(username) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && validAssignment(role, rule === 'all' ? [] : ids) && shiftOk

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const values: PersonValues = {
      name: name.trim(), username, email: email.trim().toLowerCase(), role, configIds: rule === 'all' ? [] : ids,
      shiftStart: shifted ? timeToHours(start) : null, shiftEnd: shifted ? timeToHours(end) : null,
    }
    try {
      if (person) {
        await updatePerson(person.id, { name: values.name, email: values.email, role, configIds: values.configIds, shiftStart: values.shiftStart, shiftEnd: values.shiftEnd })
        onSaved(`Guardamos los cambios de ${values.name}.`)
      } else {
        const { invite_sent: sent } = await invitePerson(values)
        onSaved(sent === false
          ? `Creamos a ${values.name}, pero el correo no salió. Revisa el servidor de correo y usa «Reenviar invitación».`
          : `Invitamos a ${values.name}: le llegó a ${values.email} un código para poner su contraseña.`)
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.') } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title={person ? `Editar a ${person.name}` : 'Nueva persona'} size="center">
      <form className="p-5 flex flex-col gap-4" onSubmit={(e) => void save(e)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput label="Nombre" required value={name} onChange={(e) => onName(e.target.value)} />
          <TextInput label="Usuario" required value={username} disabled={!!person} autoCapitalize="none" spellCheck={false}
            onChange={(e) => { setUsernameTouched(true); setUsername(e.target.value.toLowerCase()) }}
            hint={person ? 'Con él entra y firma su historial: no se cambia.' : 'Minúsculas, números y puntos. Único en toda la organización.'} />
          <TextInput label="Correo" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} hint="Aquí le llega el código para poner o recuperar su contraseña." />
          <Select label="Rol" value={role} onChange={(e) => onRole(e.target.value as AccountRole)}>
            {ROLES.filter((r) => r !== 'owner' || owner).map((r) => <option key={r} value={r}>{roles(r)}</option>)}
          </Select>
        </div>
        {rule !== 'all' && (
          <fieldset className="flex flex-col gap-2"><legend className="text-[15px] font-medium mb-1">{rule === 'one' ? 'Restaurante donde trabaja' : 'Restaurantes que lleva'}</legend>
            {restaurants.map((r) => (
              <label key={r.id} className="min-h-tap-min flex items-center gap-3 rounded-md border border-border px-3">
                <input type={rule === 'one' ? 'radio' : 'checkbox'} name="restaurantes" className="w-5 h-5 accent-primary" checked={ids.includes(r.id)} onChange={() => toggle(r.id)} />{r.name}
              </label>
            ))}
          </fieldset>
        )}
        {shifted && (
          <fieldset className="flex flex-col gap-2"><legend className="text-[15px] font-medium mb-1">Turno</legend>
            <div className="grid grid-cols-2 gap-4">
              <TextInput label="Entra" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              <TextInput label="Sale" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <p className="text-[13px] text-soft">Solo podrá entrar durante su turno, con el margen del restaurante. Si sale después de medianoche, pon la hora del día siguiente. Sin turno, entra a cualquier hora.</p>
          </fieldset>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={busy || !valid}>{busy ? 'Guardando…' : person ? 'Guardar' : 'Invitar'}</Button></div>
      </form>
    </Modal>
  )
}
