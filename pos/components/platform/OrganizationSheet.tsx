'use client'

import { useEffect, useState } from 'react'

import { Modal } from '@/components/kit/Modal'
import { StatusPill } from '@/components/kit/StatusPill'
import { Button } from '@/components/ui/Button'
import { Select, TextInput } from '@/components/ui/Field'
import { usePlatformStore } from '@/lib/stores/platformStore'
import { getOrganization, reactivateOrganization, resendOwnerInvite, suspendOrganization, updateOrganization, type OrganizationDetail } from '@/lib/services/core/platform'
import { PLANS } from './NewOrganizationWizard'
import { money, orgUrl, STATUS } from './OrganizationsView'

const ACTION: Record<string, string> = {
  'organization.created': 'Cliente creado', 'organization.updated': 'Datos o plan actualizados', 'organization.suspended': 'Suspendida',
  'organization.reactivated': 'Reactivada', 'organization.invite_resent': 'Invitación al dueño reenviada',
}
const when = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

// Plan T0: la ficha de un cliente. Plan y datos, suspender o reactivar, reenviar la invitación al dueño, sus restaurantes
// y lo que ha pasado con la cuenta.
export function OrganizationSheet({ slug, justCreated = false }: { slug: string; justCreated?: boolean }) {
  const role = usePlatformStore((s) => s.user?.role)
  const [data, setData] = useState<OrganizationDetail | null>(null)
  const [editing, setEditing] = useState(false), [suspending, setSuspending] = useState(false), [reason, setReason] = useState('')
  const [error, setError] = useState(''), [notice, setNotice] = useState(justCreated ? 'Cliente creado. Al dueño le enviamos su invitación por correo.' : '')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let alive = true
    getOrganization(slug).then((d) => { if (alive) setData(d) }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo leer el cliente.') })
    return () => { alive = false }
  }, [slug, version])
  const act = async (run: () => Promise<unknown>, done: string) => {
    setError(''); setNotice('')
    try { await run(); setNotice(done); setVersion((v) => v + 1) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar.') }
  }
  if (!data) return error ? <p role="alert" className="text-danger">{error}</p> : <p role="status" className="text-soft">Cargando…</p>
  const { organization: o, owner, restaurants, audit } = data
  const item = (label: string, value: React.ReactNode) => <div><dt className="text-[13px] text-soft">{label}</dt><dd className="text-[15px] font-medium">{value || '—'}</dd></div>
  return (
    <section className="max-w-5xl flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3"><h1 className="text-[26px] font-bold">{o.name}</h1><StatusPill tone={STATUS[o.status].tone}>{STATUS[o.status].label}</StatusPill></div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.open(orgUrl(o.slug), '_blank')}>Abrir su Waiter</Button>
          <Button onClick={() => setEditing(true)}>Editar plan y datos</Button>
          {role === 'admin' && (o.status === 'suspended'
            ? <Button variant="primary" onClick={() => void act(() => reactivateOrganization(o.slug), `${o.name} vuelve a estar activa.`)}>Reactivar</Button>
            : <Button variant="destructive" onClick={() => setSuspending(true)}>Suspender</Button>)}
        </div>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      {o.status === 'suspended' && <p className="rounded-md bg-danger-soft text-danger-ink px-4 py-3 text-[14px]">Suspendida {o.suspended_at && `el ${when(o.suspended_at)}`}{o.suspended_reason && `: «${o.suspended_reason}»`}. Nadie de esta organización puede entrar a su POS ni a su consola.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border p-5"><h2 className="text-[17px] font-semibold mb-3">Cuenta</h2>
          <dl className="grid grid-cols-2 gap-3">
            {item('Dirección', <a href={orgUrl(o.slug)} target="_blank" rel="noreferrer" className="text-primary">{orgUrl(o.slug).replace(/^https?:\/\//, '')}</a>)}
            {item('Plan', PLANS.find(([v]) => v === o.plan)?.[1] ?? o.plan)}{item('Precio mensual', money(o.monthly_price))}
            {item('Restaurantes', `${restaurants.length} de ${o.max_restaurants}`)}{item('En prueba hasta', o.trial_ends)}{item('Alta', new Date(o.created_at).toLocaleDateString('es-CO', { dateStyle: 'medium' }))}
          </dl></section>
        <section className="rounded-lg border border-border p-5"><h2 className="text-[17px] font-semibold mb-3">Facturación</h2>
          <dl className="grid grid-cols-2 gap-3">{item('Razón social', o.legal_name)}{item('NIT', o.tax_id)}{item('Correo', o.billing_email)}{item('Contacto', o.billing_contact)}</dl></section>
        <section className="rounded-lg border border-border p-5 flex flex-col gap-3"><h2 className="text-[17px] font-semibold">Dueño</h2>
          <dl className="grid grid-cols-2 gap-3">{item('Nombre', owner.name)}{item('Usuario', <span className="font-mono">{owner.username}</span>)}{item('Correo', owner.email)}
            {item('Cuenta', <StatusPill tone={owner.status === 'active' ? 'success' : 'progress'}>{owner.status === 'active' ? 'Activa' : 'Invitación pendiente'}</StatusPill>)}</dl>
          <div><Button size="compact" onClick={() => void act(() => resendOwnerInvite(o.slug), `Correo enviado a ${owner.email}.`)}>{owner.status === 'pending' ? 'Reenviar invitación' : 'Restablecer su contraseña'}</Button></div></section>
        <section className="rounded-lg border border-border p-5"><h2 className="text-[17px] font-semibold mb-3">Restaurantes</h2>
          {restaurants.length === 0 ? <p className="text-soft">El dueño todavía no ha creado ninguno.</p>
            : <ul className="flex flex-col gap-1">{restaurants.map((r) => <li key={r.id} className="flex justify-between text-[15px]"><span className="font-medium">{r.name}</span><span className="text-dim">{r.slug}</span></li>)}</ul>}</section>
      </div>
      <section className="rounded-lg border border-border p-5"><h2 className="text-[17px] font-semibold mb-3">Historial</h2>
        {audit.length === 0 ? <p className="text-soft">Sin movimientos.</p> : <ul className="flex flex-col gap-2">{audit.map((a) => (
          <li key={a.id} className="flex flex-wrap justify-between gap-x-4 text-[14px]"><span>{ACTION[a.action] ?? a.action}{a.actor && <span className="text-soft"> · {a.actor.name}</span>}</span><span className="text-dim">{when(a.at)}</span></li>))}</ul>}</section>
      {editing && <EditModal detail={data} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void act(async () => undefined, 'Cambios guardados.') }} />}
      {/* Suspender pide el motivo: queda en el historial y se lo mostramos al dueño si escribe a ProjectApp. */}
      {suspending && (
        <Modal open onClose={() => setSuspending(false)} title={`¿Suspender a ${o.name}?`} size="center">
          <form className="p-5 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); setSuspending(false); void act(() => suspendOrganization(o.slug, reason.trim() || 'Suspendida desde la plataforma'), `${o.name} quedó suspendida.`) }}>
            <p className="text-soft">Nadie de {o.name} podrá entrar a su POS ni a su consola, y su menú dirá que no está disponible, hasta que la reactives.</p>
            <TextInput label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Pago vencido desde el 15 de septiembre" />
            <div className="flex justify-end gap-3"><Button type="button" variant="ghost" onClick={() => setSuspending(false)}>Cancelar</Button><Button type="submit" variant="destructive">Suspender</Button></div>
          </form>
        </Modal>
      )}
    </section>
  )
}

function EditModal({ detail, onClose, onSaved }: { detail: OrganizationDetail; onClose: () => void; onSaved: () => void }) {
  const o = detail.organization
  const [form, setForm] = useState({ name: o.name, legal_name: o.legal_name, tax_id: o.tax_id, billing_email: o.billing_email, billing_contact: o.billing_contact, plan: o.plan, monthly_price: String(o.monthly_price), max_restaurants: String(o.max_restaurants), trial_ends: o.trial_ends ?? '' })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = async () => {
    setBusy(true); setError('')
    try {
      await updateOrganization(o.slug, { ...form, monthly_price: Number(form.monthly_price), max_restaurants: Number(form.max_restaurants), trial_ends: form.trial_ends || null })
      onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Editar a ${o.name}`} size="center">
      <form className="p-5 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput label="Nombre" required value={form.name} onChange={set('name')} /><TextInput label="Razón social" required value={form.legal_name} onChange={set('legal_name')} />
          <TextInput label="NIT" required value={form.tax_id} onChange={set('tax_id')} /><TextInput label="Correo de facturación" type="email" required value={form.billing_email} onChange={set('billing_email')} />
          <TextInput label="Contacto de facturación" value={form.billing_contact} onChange={set('billing_contact')} />
          <Select label="Plan" value={form.plan} onChange={set('plan')}>{PLANS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <TextInput label="Precio mensual (COP)" type="number" min={0} step={1000} required value={form.monthly_price} onChange={set('monthly_price')} />
          <TextInput label="Límite de restaurantes" type="number" min={1} step={1} required value={form.max_restaurants} onChange={set('max_restaurants')} hint={`Hoy tiene ${detail.restaurants.length}.`} />
          <TextInput label="En prueba hasta" type="date" value={form.trial_ends} onChange={set('trial_ends')} />
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" variant="primary" disabled={busy || Number(form.max_restaurants) < detail.restaurants.length}>{busy ? 'Guardando…' : 'Guardar'}</Button></div>
      </form>
    </Modal>
  )
}
