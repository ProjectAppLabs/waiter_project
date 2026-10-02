'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { orderStatus, progressPercent, type KitOrder, type KitStatus } from '@/lib/domain/orderState'
import { openOrderFromKit, type OpenOrder } from '@/lib/services/orders'
import { listKitOrders } from '@/lib/services/ordersKit'
import { listTableCalls, type TableCall } from '@/lib/services/tables'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useBusStore } from '@/lib/stores/busStore'
import { useNotificationStore } from '@/lib/stores/notificationStore'
import { useOrderStore } from '@/lib/stores/orderStore'

// Con el bus vivo el sondeo es solo red de seguridad (por si un aviso se pierde); sin él, es lo único
// que hay y vuelve al ritmo corto.
const POLL_MS = 10_000
const POLL_WITH_BUS_MS = 60_000

let last: { sessionId: number; orders: KitOrder[] } | null = null

export function useKitOrders() {
  const session = useAuthStore((s) => s.session)
  const catalog = useCatalogStore((s) => s.catalog)
  const flags = useOrderStore((s) => s.flags)
  const calls = useOrderStore((s) => s.calls)
  const adoptOpenOrders = useOrderStore((s) => s.adoptOpenOrders)
  const cached = session && last?.sessionId === session.id ? last.orders : null
  const [orders, setOrders] = useState<KitOrder[]>(cached ?? [])
  const [loaded, setLoaded] = useState(cached !== null)
  const tableNumberOf = useCallback((id: number) => catalog?.tables.find((t) => t.id === id)?.number ?? null, [catalog])

  // Sin la carta cargada no se sabe el número de las mesas: pedir ahora dejaría las tarjetas sin su chip azul
  // hasta el siguiente sondeo. Al llegar la carta, `refresh` cambia y el efecto vuelve a pedir enseguida.
  const refresh = useCallback(async () => {
    if (!session || !catalog) return
    try {
      // Una sola lectura de los pedidos abiertos: la lista del salón se deriva de aquí. Antes se leían dos veces por
      // caminos distintos (listKitOrders y refreshOpenOrders): pedidos y cursos repetidos en cada sondeo.
      const [list, calls] = await Promise.all([listKitOrders(session.id, tableNumberOf), listTableCalls().catch(() => [] as TableCall[])])
      last = { sessionId: session.id, orders: list }
      setOrders(list)
      adoptOpenOrders(list.map(openOrderFromKit).filter((o): o is OpenOrder => o !== null), calls)
    } catch (e) {
      console.warn('No se pudieron refrescar los pedidos; se muestra lo último conocido.', e)
    } finally {
      setLoaded(true)
    }
  }, [session, catalog, tableNumberOf, adoptOpenOrders])

  const busUp = useBusStore((s) => s.up)
  useEffect(() => {
    // Primera carga fuera del cuerpo del efecto (sin setState síncrono) y sondeo periódico después.
    const first = setTimeout(() => { void refresh() }, 0)
    const id = setInterval(() => { void refresh() }, busUp ? POLL_WITH_BUS_MS : POLL_MS)
    return () => { clearTimeout(first); clearInterval(id) }
  }, [refresh, busUp])
  // Un plato listo no espera a ningún reloj: el bus avisa y se relee. El latido de avisos hace lo mismo
  // cuando el bus no está.
  const ordersTick = useBusStore((s) => s.ticks.orders)
  const kitchenPing = useNotificationStore((s) => s.kitchenPing)
  useEffect(() => {
    if (ordersTick === 0 && kitchenPing === 0) return
    // Fuera del cuerpo del efecto, como la primera carga: releer escribe estado y hacerlo aquí encadena renders.
    const id = setTimeout(() => { void refresh() }, 0)
    return () => clearTimeout(id)
  }, [ordersTick, kitchenPing, refresh])

  const billingOf = useCallback((o: KitOrder) => o.tableId !== null && (Boolean(flags[o.tableId]?.billing) || calls.some((c) => c.tableId === o.tableId && c.kind === 'bill')), [flags, calls])
  const statusOf = useCallback((o: KitOrder): KitStatus => orderStatus(o, billingOf(o)), [billingOf])
  const percentOf = useCallback((o: KitOrder) => progressPercent(o), [])
  return useMemo(() => ({ orders, loaded, refresh, statusOf, percentOf }), [orders, loaded, refresh, statusOf, percentOf])
}
