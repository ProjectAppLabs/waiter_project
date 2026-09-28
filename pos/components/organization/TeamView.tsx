'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { useOrg } from '@/components/organization/OrgContext'
import { Button } from '@/components/ui/Button'
import { restaurantRule, validAssignment } from '@/lib/domain/restaurant'
import { listTeamEmployees, listTeamUsers, setEmployeeRestaurants, setUserRestaurants, type TeamMember } from '@/lib/services/team'

type Kind = 'employee' | 'user'

// Plan O: el equipo de toda la organización y el restaurante de cada quien. Meseros y cajeros pertenecen a uno solo; el
// encargado puede tener varios; el dueño opera todos.
export function TeamView() {
  const roles = useTranslations('pos.nav.roles')
  const { restaurants } = useOrg()
  const [employees, setEmployees] = useState<TeamMember[] | null>(null), [users, setUsers] = useState<TeamMember[] | null>(null)
  const [editing, setEditing] = useState<{ kind: Kind; member: TeamMember } | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const load = useCallback(async () => setVersion((v) => v + 1), [])
  useEffect(() => {
    let alive = true
    Promise.all([listTeamEmployees(), listTeamUsers()])
      .then(([e, u]) => { if (alive) { setEmployees(e); setUsers(u); setError('') } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo leer el equipo.') })
    return () => { alive = false }
  }, [version])
  const names = (ids: number[]) => ids.map((id) => restaurants.find((r) => r.id === id)?.name).filter(Boolean).join(' · ')
  const group = (title: string, kind: Kind, members: TeamMember[] | null) => (
    <section aria-label={title} className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-3">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {members === null ? <p className="text-soft">Cargando…</p> : members.map((m) => (
        <div key={m.id} className="flex items-center gap-3 rounded-md bg-muted p-3">
          <div className="min-w-0 flex-1"><p className="font-semibold truncate">{m.name}</p>
            <p className="text-[13px] text-soft truncate">{m.role ? roles(m.role) : 'Sin rol'} · {restaurantRule(m.role) === 'all' ? 'Todos los restaurantes' : names(m.configIds) || 'Sin restaurante'}</p></div>
          {restaurantRule(m.role) !== 'all' && <Button size="compact" onClick={() => setEditing({ kind, member: m })}><Icon name="store" size={18} />Restaurantes</Button>}
        </div>
      ))}
    </section>
  )
  return (
    <section className="max-w-4xl flex flex-col gap-6">
      <div><h1 className="text-[26px] font-bold">Equipo</h1><p className="mt-1 text-soft">Meseros y cajeros trabajan en un solo restaurante; el encargado puede llevar varios; el dueño, todos.</p></div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {group('Con PIN en el POS', 'employee', employees)}
      {group('Con cuenta de correo', 'user', users)}
      {editing && <AssignModal member={editing.member} onClose={() => setEditing(null)}
        onSave={async (ids) => { await (editing.kind === 'employee' ? setEmployeeRestaurants : setUserRestaurants)(editing.member.id, ids); setEditing(null); await load() }} />}
    </section>
  )
}

function AssignModal({ member, onClose, onSave }: { member: TeamMember; onClose: () => void; onSave: (ids: number[]) => Promise<void> }) {
  const { restaurants } = useOrg()
  const [ids, setIds] = useState<number[]>(member.configIds)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const one = restaurantRule(member.role) === 'one'
  const toggle = (id: number) => setIds((v) => (one ? [id] : v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))
  const save = async () => { setBusy(true); setError(''); try { await onSave(ids) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setBusy(false) } }
  return (
    <Modal open onClose={onClose} title={`Restaurantes de ${member.name}`} size="center">
      <form className="p-5 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <p className="text-sm text-soft">{one ? 'Elige el restaurante donde trabaja.' : 'Elige los restaurantes que lleva.'}</p>
        <fieldset className="flex flex-col gap-2"><legend className="sr-only">Restaurantes</legend>
          {restaurants.map((r) => (
            <label key={r.id} className="min-h-tap-min flex items-center gap-3 rounded-md border border-border px-3">
              <input type={one ? 'radio' : 'checkbox'} name="restaurantes" className="w-5 h-5 accent-primary" checked={ids.includes(r.id)} onChange={() => toggle(r.id)} />{r.name}
            </label>
          ))}
        </fieldset>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={busy || !validAssignment(member.role, ids)}>{busy ? 'Guardando…' : 'Guardar'}</Button></div>
      </form>
    </Modal>
  )
}
