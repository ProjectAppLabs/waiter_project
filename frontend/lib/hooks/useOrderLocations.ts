'use client'

import { useEffect, useMemo, useState } from 'react'

import type { FloorDocument } from '@/lib/domain/floorPlan'
import { orderLocation } from '@/lib/domain/orderLocation'
import type { KitOrder } from '@/lib/domain/orderState'
import { readPlan } from '@/lib/services/floorPlan'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import type { Catalog } from '@/lib/types'

// Una lectura por piso con pedidos, compartida por todas sus tarjetas y el detalle.
// Se relee al volver a la vista, recuperar el foco o actualizar el catálogo.
export function useOrderLocations(orders: Pick<KitOrder, 'tableId'>[]) {
  const catalog = useCatalogStore((s) => s.catalog)
  const floorKey = useMemo(() => {
    const tableIds = new Set(orders.flatMap((o) => o.tableId === null ? [] : [o.tableId]))
    return [...new Set(catalog?.tables.filter((t) => tableIds.has(t.id)).map((t) => t.floorId) ?? [])].sort((a, b) => a - b).join(',')
  }, [catalog, orders])
  const [result, setResult] = useState<{ catalog: Catalog; key: string; plans: Record<number, FloorDocument | null> } | null>(null)

  useEffect(() => {
    if (!catalog || !floorKey) return
    let alive = true
    let generation = 0
    const refresh = async () => {
      const mine = ++generation
      const ids = floorKey.split(',').map(Number)
      const responses = await Promise.allSettled(ids.map((id) => readPlan(id)))
      if (!alive || mine !== generation) return
      const plans = Object.fromEntries(responses.map((r, i) => [ids[i], r.status === 'fulfilled' ? r.value : null]))
      setResult({ catalog, key: floorKey, plans })
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => { alive = false; window.removeEventListener('focus', refresh) }
  }, [catalog, floorKey])

  return useMemo(() => {
    const plans = result?.catalog === catalog && result.key === floorKey ? result.plans : {}
    return new Map(orders.flatMap((o) => {
      if (o.tableId === null || !catalog) return []
      const floorId = catalog.tables.find((t) => t.id === o.tableId)?.floorId
      return [[o.tableId, orderLocation(o.tableId, catalog, floorId === undefined ? null : plans[floorId])] as const]
    }))
  }, [catalog, floorKey, orders, result])
}
