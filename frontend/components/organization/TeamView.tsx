'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Chip } from '@/components/kit/Chip'
import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { StatusPill } from '@/components/kit/StatusPill'
import { useOrg } from '@/components/organization/OrgContext'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { RowMenu } from '@/components/ui/RowMenu'
import { ScrollTable } from '@/components/ui/ScrollTable'
import { SortTh, TableSearch } from '@/components/ui/SortTh'
import { filterRows, nextSort, sortRows, type Sorters, type TableSort } from '@/lib/hooks/useTableView'
import { Select, TextInput } from '@/components/ui/Field'
import { hoursToTime, shiftLabel, timeToHours } from '@/lib/domain/employees'
import { restaurantRule, validAssignment } from '@/lib/domain/restaurant'
import { COLLAPSE_FROM, groupPeople } from '@/lib/domain/team'
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
    <section className="max-w-5xl flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-[26px] font-bold">Equipo</h1>
          <p className="mt-1 text-soft">Cada persona entra con su usuario o su correo. Meseros y cajeros trabajan en un solo restaurante y solo durante su turno.</p></div>
        <Button variant="primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} />Nueva persona</Button>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      <PeopleTable people={people} roles={roles} names={names} myUid={myUid} onEdit={setEditing} onLeave={setLeaving}
        onResend={(p) => void act(() => resendInvite(p.id), p.status === 'pending' ? `Invitación reenviada a ${p.email}.` : `Enviamos a ${p.email} un código para restablecer la contraseña.`)} />
      {editing && <PersonModal person={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
        onSaved={(message) => { setEditing(null); setNotice(message); setError(''); reload() }} />}
      <ConfirmDialog open={!!leaving} title={`¿Desactivar a ${leaving?.name}?`} destructive confirmLabel="Desactivar" cancelLabel="Cancelar"
        body="No podrá volver a entrar. Su historial (pedidos, cobros y turnos) se conserva con su nombre."
        onCancel={() => setLeaving(null)} onConfirm={() => { const p = leaving; setLeaving(null); if (p) void act(() => deactivatePerson(p.id), `${p.name} quedó desactivada.`) }} />
    </section>
  )
}

type RoleFilter = 'all' | 'admin' | 'cashier' | 'waiter' | 'pending'
const ROLE_FILTERS: [RoleFilter, string][] = [['all', 'Todos'], ['admin', 'Encargados'], ['cashier', 'Cajeros'], ['waiter', 'Meseros'], ['pending', 'Invitación pendiente']]

// Plan R: el equipo en una tabla agrupada por restaurante, pensada para muchas personas: buscador, filtros por rol con su
// conteo, grupos que se pliegan (cerrados de entrada desde COLLAPSE_FROM personas; se abren solos al buscar o filtrar) y
// las acciones de cada fila en «Editar» más un menú «⋯» para que la tabla no crezca a lo ancho.
function PeopleTable({ people, roles, names, myUid, onEdit, onLeave, onResend }: {
  people: Person[] | null; roles: (r: AccountRole) => string; names: (ids: number[]) => string; myUid: number | null
  onEdit: (p: Person) => void; onLeave: (p: Person) => void; onResend: (p: Person) => void
}) {
  const { restaurants } = useOrg()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<RoleFilter>('all')
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [sort, setSort] = useState<TableSort | null>(null)
  if (people === null) return <p className="text-soft">Cargando…</p>
  const q = query.trim()
  const passes = (p: Person, f: RoleFilter) => f === 'all' || (f === 'pending' ? p.status === 'pending' : p.role === f)
  const shown = filterRows(people.filter((p) => passes(p, filter)), q, (p) => `${p.name} ${p.username ?? ''} ${p.email ?? ''}`)
  // Al tocar una cabecera se ordena dentro de cada grupo (el restaurante sigue mandando); sin orden, encargado primero.
  const sorters: Sorters<Person> = {
    name: (p) => p.name, role: (p) => (p.role ? roles(p.role) : null), restaurants: (p) => names(p.configIds),
    shift: (p) => p.shift?.from ?? null, status: (p) => STATUS[p.status].label,
  }
  const groups = groupPeople(shown, restaurants).map((g) => ({ ...g, people: sortRows(g.people, sort, sorters) }))
  // Abierto por omisión si son pocos o si se está buscando o filtrando; el dueño puede abrir o cerrar cada grupo.
  const openByDefault = people.length < COLLAPSE_FROM || !!q || filter !== 'all'
  const isOpen = (key: string) => toggled[key] ?? openByDefault
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <TableSearch value={query} onChange={setQuery} placeholder="Buscar persona" className="w-72 max-w-full" />
        {ROLE_FILTERS.map(([f, label]) => <Chip key={f} label={label} count={people.filter((p) => passes(p, f)).length} active={filter === f} onClick={() => setFilter(f)} />)}
      </div>
      {groups.length === 0 ? <p className="text-soft">Nadie coincide con la búsqueda.</p> : (
        <ScrollTable label="el equipo">
          <table aria-label="Personas" className="data-table text-[15px]">
            <thead><tr className="text-left text-soft border-b border-border">
              {([['name', 'Persona'], ['role', 'Rol'], ['restaurants', 'Restaurantes'], ['shift', 'Turno'], ['status', 'Estado']] as const)
                .map(([k, h]) => <SortTh key={k} label={h} sortKey={k} sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />)}<th /></tr></thead>
            {groups.map((g) => (
              <tbody key={g.key}>
                <tr className="border-y border-border">
                  {/* La fila del grupo ocupa todo el ancho: no puede quedarse fija como la primera columna, así que lo fijo es
                      su título (si no, al desplazar de lado quedaba una franja vacía). */}
                  <th colSpan={6} className="group-row p-0 text-left">
                    <button type="button" aria-expanded={isOpen(g.key)} onClick={() => setToggled((t) => ({ ...t, [g.key]: !isOpen(g.key) }))}
                      className="sticky left-0 h-11 px-4 inline-flex items-center gap-2 text-[14px] font-semibold text-ink">
                      <Icon name={isOpen(g.key) ? 'chevronDown' : 'chevronRight'} size={18} />{g.title}
                      <span className="ml-1 px-2 rounded-md bg-surface text-soft text-[13px] tabular">{g.people.length}</span>
                    </button>
                  </th>
                </tr>
                {isOpen(g.key) && g.people.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5"><div className="font-semibold">{p.name}</div>{p.username && <div className="font-mono text-[13px] text-soft">{p.username}</div>}</td>
                    <td className="px-4 py-2.5">{p.role ? roles(p.role) : 'Sin rol'}</td>
                    <td className="px-4 py-2.5">{restaurantRule(p.role) === 'all' ? 'Todos' : names(p.configIds) || 'Sin restaurante'}</td>
                    <td className="px-4 py-2.5 text-soft">{p.role === 'waiter' || p.role === 'cashier' ? shiftLabel(p.shift, 'Sin turno') : 'Sin restricción'}</td>
                    <td className="px-4 py-2.5"><StatusPill tone={STATUS[p.status].tone}>{STATUS[p.status].label}</StatusPill></td>
                    <td className="px-4 py-2.5"><div className="flex justify-end gap-2">
                      <Button size="compact" onClick={() => onEdit(p)} disabled={p.status === 'no_account'}>Editar</Button>
                      <RowMenu label={`Más acciones de ${p.name}`} items={[
                        { label: p.status === 'pending' ? 'Reenviar invitación' : 'Restablecer contraseña', onSelect: () => onResend(p), disabled: p.status === 'no_account' || !p.email },
                        ...(p.userId !== myUid ? [{ label: 'Desactivar', onSelect: () => onLeave(p), disabled: p.status === 'no_account', danger: true }] : []),
                      ]} />
                    </div></td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </ScrollTable>
      )}
    </div>
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
  const [rate, setRate] = useState(person?.hourlyRate == null ? '' : String(person.hourlyRate))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const rule = restaurantRule(role)
  const shifted = role === 'waiter' || role === 'cashier'
  const onName = (value: string) => { setName(value); if (!usernameTouched) setUsername(suggestUsername(value)) }
  const onRole = (value: AccountRole) => { setRole(value); if (restaurantRule(value) === 'one') setIds((v) => v.slice(0, 1)) }
  const toggle = (id: number) => setIds((v) => (rule === 'one' ? [id] : v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))
  // Turno a medias no vale: o las dos horas o ninguna (sin turno = sin restricción horaria).
  const shiftOk = !shifted || (start === '' && end === '') || (start !== '' && end !== '' && start !== end)
  const valid = name.trim() && validUsername(username) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && validAssignment(role, rule === 'all' ? [] : ids) && shiftOk && (rate.trim() === '' || Number(rate) >= 0)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const values: PersonValues = {
      name: name.trim(), username, email: email.trim().toLowerCase(), role, configIds: rule === 'all' ? [] : ids,
      shiftStart: shifted ? timeToHours(start) : null, shiftEnd: shifted ? timeToHours(end) : null,
      hourlyRate: rate.trim() === '' ? null : Number(rate),
    }
    try {
      if (person) {
        await updatePerson(person.id, { name: values.name, email: values.email, role, configIds: values.configIds, shiftStart: values.shiftStart, shiftEnd: values.shiftEnd, hourlyRate: values.hourlyRate })
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
        {/* Plan Y5: base para la nómina; solo se usa para el pago estimado de Horas y propinas. */}
        <div className="sm:w-1/2"><TextInput label="Valor de la hora ($)" type="number" min={0} step={100} value={rate} onChange={(e) => setRate(e.target.value)} hint="Opcional. Para estimar el pago en Horas y propinas." /></div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={busy || !valid}>{busy ? 'Guardando…' : person ? 'Guardar' : 'Invitar'}</Button></div>
      </form>
    </Modal>
  )
}
