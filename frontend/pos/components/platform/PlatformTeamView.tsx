'use client'

import { useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { StatusPill } from '@/components/kit/StatusPill'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Select, TextInput } from '@/components/ui/Field'
import { RowMenu } from '@/components/ui/RowMenu'
import { ScrollTable } from '@/components/ui/ScrollTable'
import { suggestUsername, validUsername } from '@/lib/domain/slug'
import { deactivatePlatformUser, invitePlatformUser, listPlatformTeam, resendPlatformInvite, resetPlatform2fa, type PlatformRole, type PlatformUser } from '@/lib/services/core/platform'
import { usePlatformStore } from '@/lib/stores/platformStore'

const ROLE: Record<PlatformRole, string> = { admin: 'Administra', operator: 'Opera' }

// Plan T0: la gente de ProjectApp. Quien administra da de alta a los demás (les llega un código por correo), los
// desactiva y suspende clientes; quien opera ve y da de alta clientes.
export function PlatformTeamView() {
  const me = usePlatformStore((s) => s.user)
  const [users, setUsers] = useState<PlatformUser[] | null>(null)
  const [inviting, setInviting] = useState(false), [leaving, setLeaving] = useState<PlatformUser | null>(null), [resetting, setResetting] = useState<PlatformUser | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [version, setVersion] = useState(0)
  useEffect(() => {
    let alive = true
    listPlatformTeam().then((u) => { if (alive) setUsers(u) }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo leer el equipo.') })
    return () => { alive = false }
  }, [version])
  const act = async (run: () => Promise<unknown>, done: string) => {
    setError(''); setNotice('')
    try { await run(); setNotice(done); setVersion((v) => v + 1) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar.') }
  }
  const admin = me?.role === 'admin'
  return (
    <section className="max-w-4xl flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-[26px] font-bold">Equipo de ProjectApp</h1><p className="mt-1 text-soft">Quien administra puede suspender clientes y manejar este equipo; quien opera ve y da de alta clientes.</p></div>
        {admin && <Button variant="primary" onClick={() => setInviting(true)}><Icon name="plus" size={18} />Nueva persona</Button>}
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      {users === null ? <p className="text-soft">Cargando…</p> : (
        <ScrollTable label="el equipo">
          <table aria-label="Equipo de ProjectApp" className="data-table text-[15px]">
            <thead><tr className="text-left text-soft border-b border-border">{['Persona', 'Correo', 'Rol', 'Estado', ''].map((h, i) => <th key={i} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3"><div className="font-semibold">{u.name}</div><div className="font-mono text-[13px] text-soft">{u.username}</div></td>
                <td className="px-4 py-3">{u.email}</td><td className="px-4 py-3">{ROLE[u.role]}</td>
                <td className="px-4 py-3"><StatusPill tone={u.active === false ? 'neutral' : u.status === 'pending' ? 'progress' : 'success'}>{u.active === false ? 'Desactivada' : u.status === 'pending' ? 'Invitación pendiente' : 'Activa'}</StatusPill></td>
                <td className="px-4 py-3">{admin && u.id !== me?.id && u.active !== false && <div className="flex justify-end"><RowMenu label={`Más acciones de ${u.name}`} items={[
                  { label: u.status === 'pending' ? 'Reenviar invitación' : 'Restablecer contraseña', onSelect: () => void act(() => resendPlatformInvite(u.id), `Correo enviado a ${u.email}.`) },
                  // Plan Y3: si perdió el teléfono y los códigos de respaldo; queda en la auditoría.
                  ...(u.two_factor ? [{ label: 'Restablecer doble factor', onSelect: () => setResetting(u) }] : []),
                  { label: 'Desactivar', danger: true, onSelect: () => setLeaving(u) },
                ]} /></div>}</td>
              </tr>))}</tbody>
          </table>
        </ScrollTable>
      )}
      {inviting && <InviteModal onClose={() => setInviting(false)} onSaved={(name, email) => { setInviting(false); void act(async () => undefined, `Invitamos a ${name}: le llegó a ${email} un código para poner su contraseña.`) }} />}
      <ConfirmDialog open={!!resetting} title={`¿Restablecer el doble factor de ${resetting?.name}?`} confirmLabel="Restablecer" cancelLabel="Cancelar"
        body="Se le quita el doble factor y sus códigos de respaldo. Al entrar deberá activarlo de nuevo si su cuenta lo exige. Queda en la auditoría."
        onCancel={() => setResetting(null)} onConfirm={() => { const u = resetting; setResetting(null); if (u) void act(() => resetPlatform2fa(u.id), `Doble factor de ${u.name} restablecido.`) }} />
      <ConfirmDialog open={!!leaving} title={`¿Desactivar a ${leaving?.name}?`} destructive confirmLabel="Desactivar" cancelLabel="Cancelar" body="No podrá volver a entrar a la plataforma. Su historial se conserva."
        onCancel={() => setLeaving(null)} onConfirm={() => { const u = leaving; setLeaving(null); if (u) void act(() => deactivatePlatformUser(u.id), `${u.name} quedó desactivada.`) }} />
    </section>
  )
}

function InviteModal({ onClose, onSaved }: { onClose: () => void; onSaved: (name: string, email: string) => void }) {
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [username, setUsername] = useState(''), [touched, setTouched] = useState(false), [role, setRole] = useState<PlatformRole>('operator')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const valid = name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && validUsername(username)
  const save = async () => {
    setBusy(true); setError('')
    try { await invitePlatformUser({ name: name.trim(), email: email.trim().toLowerCase(), username, role }); onSaved(name.trim(), email.trim().toLowerCase()) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo invitar.') } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title="Nueva persona de ProjectApp" size="center">
      <form className="p-5 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <TextInput label="Nombre" required value={name} onChange={(e) => { setName(e.target.value); if (!touched) setUsername(suggestUsername(e.target.value)) }} />
        <TextInput label="Correo" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextInput label="Usuario" required value={username} autoCapitalize="none" onChange={(e) => { setTouched(true); setUsername(e.target.value.toLowerCase()) }} hint="Minúsculas, números y puntos." />
        <Select label="Rol" value={role} onChange={(e) => setRole(e.target.value as PlatformRole)}><option value="operator">Opera: ve y da de alta clientes</option><option value="admin">Administra: además suspende clientes y maneja el equipo</option></Select>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" variant="primary" disabled={busy || !valid}>{busy ? 'Invitando…' : 'Invitar'}</Button></div>
      </form>
    </Modal>
  )
}
