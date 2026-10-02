'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Chip } from '@/components/kit/Chip'
import { Icon } from '@/components/kit/Icon'
import { StatusPill } from '@/components/kit/StatusPill'
import { Button } from '@/components/ui/Button'
import { RowMenu } from '@/components/ui/RowMenu'
import { ScrollTable } from '@/components/ui/ScrollTable'
import { SortTh, TableSearch } from '@/components/ui/SortTh'
import { formatCop } from '@/lib/domain/money'
import { useTableView, type Sorters } from '@/lib/hooks/useTableView'
import { listOrganizations, reactivateOrganization, resendOwnerInvite, type Organization, type OrganizationStatus } from '@/lib/services/core/platform'

export const STATUS: Record<OrganizationStatus, { label: string; tone: 'success' | 'progress' | 'danger' }> = {
  active: { label: 'Activa', tone: 'success' }, trial: { label: 'En prueba', tone: 'progress' }, suspended: { label: 'Suspendida', tone: 'danger' },
}
export const money = (v: number) => `$ ${formatCop(Math.round(v))}`
export const orgUrl = (slug: string) => (typeof window !== 'undefined' && window.location.hostname.endsWith('localhost') ? `http://${slug}.localhost:${window.location.port || '3000'}` : `https://${slug}.waiter.projectapp.co`)
type Filter = 'all' | OrganizationStatus | 'pendingOwner'
const FILTERS: [Filter, string][] = [['all', 'Todos'], ['active', 'Activas'], ['trial', 'En prueba'], ['suspended', 'Suspendidas'], ['pendingOwner', 'Dueño sin activar']]

// Plan T0: los clientes de ProjectApp. Cada fila es una organización con su dueño, plan, precio, estado y restaurantes.
export function OrganizationsView() {
  const router = useRouter()
  const [rows, setRows] = useState<Organization[] | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let alive = true
    listOrganizations().then((o) => { if (alive) { setRows(o); setError('') } }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudieron leer los clientes.') })
    return () => { alive = false }
  }, [version])
  const passes = (o: Organization, f: Filter) => f === 'all' || (f === 'pendingOwner' ? o.owner?.status === 'pending' : o.status === f)
  const table = useTableView((rows ?? []).filter((o) => passes(o, filter)), {
    name: (o) => o.name, owner: (o) => o.owner?.name, plan: (o) => o.plan, price: (o) => o.monthly_price, status: (o) => STATUS[o.status].label,
    restaurants: (o) => o.restaurants_count ?? 0, created: (o) => o.created_at,
  } as Sorters<Organization>, (o) => `${o.name} ${o.slug} ${o.owner?.name ?? ''} ${o.owner?.email ?? ''} ${o.plan}`)
  const act = async (run: () => Promise<unknown>, done: string) => {
    setError(''); setNotice('')
    try { await run(); setNotice(done); setVersion((v) => v + 1) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar.') }
  }
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-[26px] font-bold">Clientes</h1><p className="mt-1 text-soft">Los dueños que pagan por Waiter: su organización, su plan y su estado.</p></div>
        <Button variant="primary" onClick={() => router.push('/plataforma/clientes/nuevo')}><Icon name="plus" size={18} />Nuevo cliente</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TableSearch value={table.query} onChange={table.setQuery} placeholder="Buscar cliente o dueño" className="w-72 max-w-full" />
        {FILTERS.map(([f, label]) => <Chip key={f} label={label} count={(rows ?? []).filter((o) => passes(o, f)).length} active={filter === f} onClick={() => setFilter(f)} />)}
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      {rows === null ? !error && <p role="status" className="text-soft">Cargando clientes…</p> : rows.length === 0 ? (
        <p className="text-soft">Todavía no hay clientes. Da de alta al primero con «Nuevo cliente».</p>
      ) : (
        <ScrollTable label="los clientes">
          <table aria-label="Clientes" className="data-table text-[15px]">
            <thead><tr className="text-left text-soft border-b border-border">
              {([['name', 'Cliente'], ['owner', 'Dueño'], ['plan', 'Plan'], ['price', 'Precio mensual'], ['restaurants', 'Restaurantes'], ['status', 'Estado'], ['created', 'Alta']] as const)
                .map(([k, h]) => <SortTh key={k} label={h} sortKey={k} sort={table.sort} onSort={table.toggle} align={k === 'price' || k === 'restaurants' ? 'right' : 'left'} />)}<th /></tr></thead>
            <tbody>{table.view.map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3"><Link href={`/plataforma/clientes/${o.slug}`} className="font-semibold hover:text-primary">{o.name}</Link><div className="text-[13px] text-dim">{o.slug}</div></td>
                <td className="px-4 py-3">{o.owner ? <><div>{o.owner.name}</div><div className="text-[13px] text-dim">{o.owner.email}{o.owner.status === 'pending' && ' · sin activar'}</div></> : '—'}</td>
                <td className="px-4 py-3">{o.plan || '—'}</td>
                <td className="px-4 py-3 text-right tabular">{money(o.monthly_price)}</td>
                <td className="px-4 py-3 text-right tabular">{o.restaurants_count ?? 0} / {o.max_restaurants}</td>
                <td className="px-4 py-3"><StatusPill tone={STATUS[o.status].tone}>{STATUS[o.status].label}</StatusPill>{o.status === 'trial' && o.trial_ends && <div className="text-[13px] text-dim">hasta {o.trial_ends}</div>}</td>
                <td className="px-4 py-3 text-soft">{o.created_at.slice(0, 10)}</td>
                <td className="px-4 py-3"><div className="flex justify-end gap-2">
                  <Button size="compact" onClick={() => router.push(`/plataforma/clientes/${o.slug}`)}>Ver</Button>
                  <RowMenu label={`Más acciones de ${o.name}`} items={[
                    { label: 'Abrir su Waiter', onSelect: () => window.open(orgUrl(o.slug), '_blank') },
                    { label: o.owner?.status === 'pending' ? 'Reenviar invitación al dueño' : 'Restablecer contraseña del dueño', onSelect: () => void act(() => resendOwnerInvite(o.slug), `Correo enviado a ${o.owner?.email ?? 'el dueño'}.`) },
                    ...(o.status === 'suspended' ? [{ label: 'Reactivar', onSelect: () => void act(() => reactivateOrganization(o.slug), `${o.name} vuelve a estar activa.`) }] : []),
                  ]} />
                </div></td>
              </tr>))}</tbody>
          </table>
          {table.view.length === 0 && <p className="p-6 text-center text-soft">Ningún cliente coincide.</p>}
        </ScrollTable>
      )}
    </section>
  )
}
