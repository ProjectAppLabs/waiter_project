'use client'


import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { Chip } from '@/components/kit/Chip'
import { PageTitle } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/kit/Icon'
import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { CardGridSkeleton } from '@/components/kit/Skeleton'
import { CashierOrderCard } from '@/components/orders/CashierOrderCard'
import { SortMenu } from '@/components/orders/SortMenu'
import { countByStatus, filterOrders, matchesOrderSearch, sortOrders, type OrdersFilter, type OrdersSort } from '@/lib/domain/orderState'
import { can } from '@/lib/domain/roles'
import { locationZoneKey, matchesLocation } from '@/lib/domain/orderLocation'
import { parseFloorName } from '@/lib/domain/tablesKit'
import { useIdentity } from '@/lib/hooks/useIdentity'
import { useOrderLocations } from '@/lib/hooks/useOrderLocations'
import { useKitOrders } from '@/lib/hooks/useKitOrders'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { operatesInEmergency, useEmergency } from '@/lib/offline/emergency'
import { roleCan } from '@/lib/domain/permissions'

const FILTERS: OrdersFilter[] = ['all', 'pending_send', 'in_progress', 'ready', 'served', 'waiting_payment']

// Pantalla "Order" del kit (Ipad View / Sorting / Detail Order): buscador, chips por estado, orden y rejilla de tarjetas.
export default function PedidosPage() {
  const t = useTranslations('orders')
  const catalog = useCatalogStore((s) => s.catalog)
  const { role } = useIdentity()
  // Cobrar puede ser solo de caja: lo decide el restaurante en Configuración.
  const mayCharge = can.charge(role, catalog?.settings.waiterCanCharge ?? false, catalog?.settings.rolePermissions)
  // Plan V: en emergencia solo la caja toma pedidos.
  const emergency = useEmergency().active
  const mayCreate = emergency ? operatesInEmergency(role) : roleCan(role, 'create_orders', catalog?.settings.rolePermissions)
  const { orders, loaded, statusOf } = useKitOrders()
  const locations = useOrderLocations(orders)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<OrdersFilter>('all')
  const [floor, setFloor] = useState('all')
  const [zone, setZone] = useState('all')
  const [sort, setSort] = useState<OrdersSort>('latest')

  const searched = useMemo(() => orders.filter((o) => matchesOrderSearch(o, query) && matchesLocation(o.tableId, o.tableId === null ? undefined : locations.get(o.tableId), floor, zone)), [orders, query, locations, floor, zone])
  const zoneOptions = useMemo(() => {
    const relevant = [...locations.values()].filter((l) => floor === 'all' || String(l.floorId) === floor)
    return {
      zones: [...new Map(relevant.filter((l) => l.zoneStatus === 'ready').map((l) => [locationZoneKey(l), { key: locationZoneKey(l), label: floor === 'all' ? `${l.floor} · ${l.zone}` : l.zone! }])).values()].sort((a, b) => a.label.localeCompare(b.label, 'es')),
      unassigned: relevant.some((l) => l.zoneStatus === 'unassigned'),
      unavailable: relevant.some((l) => l.zoneStatus === 'unavailable'),
      loading: relevant.some((l) => l.zoneStatus === 'loading'),
    }
  }, [locations, floor])
  const counts = useMemo(() => countByStatus(searched, statusOf), [searched, statusOf])
  const visible = useMemo(() => sortOrders(filterOrders(searched, filter, statusOf), sort), [searched, filter, sort, statusOf])

  return (
    <>
      <div className="flex-1 min-h-0 min-w-0 flex flex-col px-4 pt-4 gap-4">
        <div className="shrink-0 flex flex-wrap items-center gap-4">
          <PageTitle>{t('title')}</PageTitle>
          <label className="w-full min-w-0 min-h-11 px-3 rounded-md border border-border bg-surface flex items-center gap-2 text-dim lg:ml-auto lg:w-[440px] lg:max-w-[440px] lg:flex-1">
            <Icon name="search" size={20} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} aria-label={t('search')} className="h-11 flex-1 min-w-0 bg-transparent outline-none text-base text-ink placeholder:text-dim sm:text-[15px]" />
          </label>
          <span className="w-px h-8 shrink-0 bg-border" />
          {mayCreate && <Link href="/pedidos/nuevo" className="h-11 shrink-0 whitespace-nowrap px-4 rounded-md bg-primary text-primary-ink text-[15px] font-bold inline-flex items-center gap-1.5"><Icon name="plus" size={18} />{t('createOrder')}</Link>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => <Chip key={f} label={t(`filters.${f}`)} count={counts[f]} active={f === filter} onClick={() => setFilter(f)} />)}
          <span className="ml-auto"><SortMenu value={sort} onChange={setSort} /></span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-soft"><span>{t('locationFilters.floor')}</span><span className="w-44"><Select value={floor} onChange={(e) => { setFloor(e.target.value); setZone('all') }}>
            <option value="all">{t('locationFilters.allFloors')}</option>
            {catalog?.floors.map((f) => <option key={f.id} value={f.id}>{parseFloorName(f.name).label}</option>)}
            <option value="no_table">{t('locationFilters.noTable')}</option>
          </Select></span></label>
          <label className="flex items-center gap-2 text-sm text-soft"><span>{t('locationFilters.zone')}</span><span className="w-52"><Select value={zone} disabled={floor === 'no_table'} onChange={(e) => setZone(e.target.value)}>
            <option value="all">{t('locationFilters.allZones')}</option>
            {zoneOptions.zones.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}
            {(zoneOptions.unassigned || zone === 'unassigned') && <option value="unassigned">{t('locationFilters.unassigned')}</option>}
            {(zoneOptions.unavailable || zone === 'unavailable') && <option value="unavailable">{t('locationFilters.unavailable')}</option>}
            {zoneOptions.loading && <option disabled>{t('locationFilters.loading')}</option>}
            {zone !== 'all' && !['unassigned', 'unavailable'].includes(zone) && !zoneOptions.zones.some((z) => z.key === zone) && <option value={zone}>{t('locationFilters.noActiveZone')}</option>}
          </Select></span></label>
          {(floor !== 'all' || zone !== 'all' || query || filter !== 'all') && <Button size="compact" onClick={() => { setFloor('all'); setZone('all'); setQuery(''); setFilter('all') }}>{t('locationFilters.clear')}</Button>}
          {loaded && <span className="ml-auto text-sm text-soft" aria-live="polite">{t('locationFilters.count', { count: visible.length, total: orders.length })}</span>}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pb-4">
          {/* Mientras llegan los pedidos, su esqueleto; «no hay pedidos» solo cuando de verdad no hay. */}
          {!loaded ? <CardGridSkeleton count={6} />
            : visible.length === 0
            ? <KitEmptyState icon="orders" title={t(orders.length ? 'locationFilters.emptyTitle' : 'empty.title')} body={t(orders.length ? 'locationFilters.emptyBody' : 'empty.body')} />
            : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visible.map((o) => (
                <CashierOrderCard key={o.id} order={o} location={o.tableId === null ? undefined : locations.get(o.tableId)} status={statusOf(o)} mayCharge={mayCharge} />
              ))}
            </div>}
        </div>
      </div>

    </>
  )
}
