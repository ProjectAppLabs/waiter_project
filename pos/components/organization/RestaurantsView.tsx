'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { StatusPill } from '@/components/kit/StatusPill'
import { useOrg } from '@/components/organization/OrgContext'
import { Button } from '@/components/ui/Button'
import { Select, TextInput } from '@/components/ui/Field'
import { formatCop } from '@/lib/domain/money'
import { slugify, validSlug } from '@/lib/domain/slug'
import { createRestaurant } from '@/lib/services/restaurants'
import { useAuthStore } from '@/lib/stores/authStore'

// Plan O: los restaurantes de la organización con su estado de hoy, la entrada al POS de cada uno y el alta de uno nuevo
// (que copia los ajustes de otro para no empezar de cero).
export function RestaurantsView() {
  const router = useRouter()
  const { restaurants, reload } = useOrg()
  const chooseRestaurant = useAuthStore((s) => s.chooseRestaurant)
  const [creating, setCreating] = useState(false)
  const enter = async (id: number, name: string) => { await chooseRestaurant({ id, name }); router.push('/dashboard') }
  return (
    <section className="flex flex-col gap-6 max-w-5xl">
      <header className="flex items-end justify-between gap-4">
        <div><h1 className="text-[26px] font-bold">Tus restaurantes</h1><p className="mt-1 text-soft">Entra al POS de cualquiera o abre uno nuevo con los ajustes de otro.</p></div>
        <Button variant="primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} />Nuevo restaurante</Button>
      </header>
      <ul aria-label="Restaurantes" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {restaurants.map((r) => (
          <li key={r.id} className="rounded-xl border border-border p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="w-11 h-11 shrink-0 rounded-md bg-primary-soft text-primary grid place-items-center"><Icon name="store" size={22} /></span>
              <div className="min-w-0 flex-1"><h2 className="text-[17px] font-semibold truncate">{r.name}</h2>
                <p className="text-[13px] text-soft truncate">{[r.street, r.city].filter(Boolean).join(' · ') || 'Sin dirección'}</p></div>
              <StatusPill tone={r.open ? 'success' : 'neutral'}>{r.open ? 'Caja abierta' : 'Caja cerrada'}</StatusPill>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-[14px]">
              <div className="rounded-md bg-muted p-3"><dt className="text-soft">Ventas de hoy</dt><dd className="text-[18px] font-semibold tabular">$ {formatCop(r.salesToday)}</dd></div>
              <div className="rounded-md bg-muted p-3"><dt className="text-soft">Pedidos de hoy</dt><dd className="text-[18px] font-semibold tabular">{r.ordersToday}</dd></div>
            </dl>
            <Button onClick={() => void enter(r.id, r.name)}>Entrar al POS<Icon name="arrowRight" size={18} /></Button>
          </li>
        ))}
      </ul>
      {creating && <NewRestaurantModal onClose={() => setCreating(false)} onCreated={async () => { await reload(); setCreating(false) }} />}
    </section>
  )
}

function NewRestaurantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const { restaurants } = useOrg()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState<string | null>(null)
  const [copyFrom, setCopyFrom] = useState<number | null>(restaurants[0]?.id ?? null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const finalSlug = slug ?? slugify(name)
  const submit = async () => {
    setBusy(true); setError('')
    try { await createRestaurant(name.trim(), finalSlug, copyFrom); await onCreated() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear el restaurante.') }
    finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title="Nuevo restaurante" size="center">
      <form className="p-5 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <TextInput label="Nombre" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Burger House Laureles" />
        <TextInput label="Dirección del menú" required value={finalSlug} onChange={(e) => setSlug(e.target.value.toLowerCase())}
          hint="Minúsculas, números y guiones: es la parte de la URL del menú de este restaurante." />
        <Select label="Copiar los ajustes de" value={copyFrom ?? ''} onChange={(e) => setCopyFrom(e.target.value ? Number(e.target.value) : null)}
          hint="Umbrales, cobrar antes de cocina, ROI, horario de reservas, precios y categorías visibles. El catálogo, el diseño y las promociones ya son de toda la organización.">
          <option value="">Empezar sin copiar</option>
          {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim() || !validSlug(finalSlug)}>{busy ? 'Creando…' : 'Crear restaurante'}</Button>
        </div>
      </form>
    </Modal>
  )
}
