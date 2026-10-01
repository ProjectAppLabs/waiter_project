'use client'

import { useEffect, useState, type ReactNode } from 'react'

import { Chip } from '@/components/kit/Chip'
import { useOrg } from '@/components/organization/OrgContext'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'

// Plan Q: algunas vistas del negocio son de un restaurante a la vez (sus ventas, su facturación, sus pagos). El dueño elige
// cuál con los chips y la vista se pinta con los datos de ese restaurante: es el mismo componente que usa su POS, así que
// lo que el dueño ve aquí y lo que ve el encargado allá no se separan.
export function RestaurantScope({ label, children }: { label: string; children: ReactNode }) {
  const { restaurants } = useOrg()
  const current = useAuthStore((s) => s.restaurant)
  const chooseRestaurant = useAuthStore((s) => s.chooseRestaurant)
  const loadCatalog = useCatalogStore((s) => s.load)
  const loadedId = useCatalogStore((s) => s.catalog?.settings.configId ?? null)
  const [error, setError] = useState('')
  const selected = restaurants.find((r) => r.id === current?.id) ?? restaurants[0] ?? null

  // Al entrar (o si el restaurante del dispositivo ya no es de la lista) se usa el primero; al cambiar, se carga el suyo.
  useEffect(() => {
    if (!selected || loadedId === selected.id) return
    let alive = true
    void (async () => {
      try {
        if (current?.id !== selected.id) await chooseRestaurant({ id: selected.id, name: selected.name })
        await loadCatalog(useAuthStore.getState().session?.id ?? null)
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'No se pudo cargar el restaurante.') }
    })()
    return () => { alive = false }
  }, [selected, loadedId, current, chooseRestaurant, loadCatalog])

  return (
    <section className="flex flex-col gap-4 min-h-0">
      <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
        {restaurants.map((r) => <Chip key={r.id} label={r.name} active={r.id === selected?.id} onClick={() => { setError(''); void chooseRestaurant({ id: r.id, name: r.name }) }} />)}
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {/* Hasta que la carta sea la del restaurante elegido no se pinta nada: si no, se verían por un momento los datos del anterior. */}
      {selected && loadedId === selected.id ? <div className="-mx-5 flex flex-col min-h-0">{children}</div> : <p role="status" className="text-soft">Cargando {selected?.name ?? 'el restaurante'}…</p>}
    </section>
  )
}
