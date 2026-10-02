'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'

import { PageTitle } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/kit/Icon'
import { cn } from '@/lib/utils'
import { ChangeTableModal } from '@/components/tables/ChangeTableModal'
import { FloorEditor } from '@/components/tables/FloorEditor'
import type { FloorDocument } from '@/lib/domain/floorPlan'
import { deleteFloor, readPlan, floorBackgroundUrl } from '@/lib/services/floorPlan'
import { FloorSwitcher, SelectedTableBar, TableLegend } from '@/components/tables/FloorHeader'
import { ServiceSidebar } from '@/components/tables/ServiceSidebar'
import { useKitOrders } from '@/lib/hooks/useKitOrders'
import { useOrderLocations } from '@/lib/hooks/useOrderLocations'
import { FloorPane } from '@/components/tables/FloorPane'
import { FloorSkeleton } from '@/components/tables/FloorSkeleton'
import { FloorSettingsPopover } from '@/components/tables/FloorSettingsPopover'

import { PickTablePrompt } from '@/components/tables/PickTablePrompt'
import { ReservationDetailModal } from '@/components/tables/ReservationDetailModal'
import { ReservationListModal } from '@/components/tables/ReservationListModal'
import { TableDetailModal } from '@/components/tables/TableDetailModal'
import { roleCan } from '@/lib/domain/permissions'
import { can } from '@/lib/domain/roles'
import { deriveTableViews } from '@/lib/domain/tableState'
import { orderCode, orderPrefix } from '@/lib/domain/tablesKit'
import { useIdentity } from '@/lib/hooks/useIdentity'
import { fireUnsentLines } from '@/lib/services/kitchen'
import { serveLines } from '@/lib/services/ordersKit'
import { listAllFloors, moveOrder, reservedAtByTable, setFloorActive, type FloorSetting, type OrderDetail, type OrderDetailLine, type TableReservation } from '@/lib/services/tables'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useFloorStore } from '@/lib/stores/floorStore'
import { useOrderStore } from '@/lib/stores/orderStore'
import { toast } from '@/lib/stores/toastStore'


type Sheet = null | 'reservations' | 'detail' | 'wizard'
// Las demás pantallas mandan aquí con ?elegir=mesa cuando se pulsa "Crear pedido" sin mesa elegida.
const PICK_TABLE = 'elegir'

// Fecha de hoy en la zona del dispositivo: es la que el addon usa para "la próxima reserva" de cada mesa.
const today = (): string => new Date().toLocaleDateString('en-CA')
const EMPTY_RESERVED: Record<number, TableReservation | null> = {}

// useSearchParams obliga a un límite de Suspense: se aísla aquí para no envolver la pantalla entera.
function AskedForTable({ onAsk }: { onAsk: () => void }) {
  const asked = useSearchParams().get(PICK_TABLE) === 'mesa'
  useEffect(() => { if (asked) onAsk() }, [asked, onAsk])
  return null
}

// Pantalla "Mesas" del kit CloudPos (6 – Table): plano real por piso, leyenda, barra de mesa seleccionada,
// detalle de mesa, cambio de mesa y ajustes de pisos con el editor del plano.
export default function SalonPage() {
  const t = useTranslations('tables')
  const router = useRouter()
  // Los pisos son configuración del local: un mesero no los activa ni los edita.
  const { role } = useIdentity()
  const mayManageFloors = can.manageFloors(role)
  const session = useAuthStore((s) => s.session)
  const { catalog, load } = useCatalogStore()
  const { activeFloorId, secondFloorId, split, selectedTableId, setFloor, setSecondFloor, setSplit, selectTable } = useFloorStore()
  const { openOrders, calls, flags, attendCall, refreshShift, busy } = useOrderStore()
  const { orders, loaded: ordersLoaded, refresh: refreshOrders } = useKitOrders()
  const [zoneTables, setZoneTables] = useState<Record<number, number[] | null>>({})
  const onVisibleTables = useCallback((id: number, ids: number[] | null) => {
    setZoneTables((previous) => previous[id] === ids ? previous : { ...previous, [id]: ids })
  }, [])
  const locationSources = useMemo(() => [...orders, ...calls.map((call) => ({ tableId: call.tableId }))], [orders, calls])
  const locations = useOrderLocations(locationSources)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [settings, setSettings] = useState(false)
  const [allFloors, setAllFloors] = useState<FloorSetting[]>([])
  const [editing, setEditing] = useState<FloorDocument | null>(null)
  const [moving, setMoving] = useState<{ detail: OrderDetail; fromTableId: number } | null>(null)
  const [target, setTarget] = useState<number | null>(null)
  const [loadedReserved, setLoadedReserved] = useState<{ key: string; map: Record<number, TableReservation | null> } | null>(null)
  const [booking, setBooking] = useState<TableReservation | null>(null)
  const [movingBusy, setMovingBusy] = useState(false)
  const [pickTable, setPickTable] = useState(false)

  const reload = useCallback(async () => { await load(session?.id ?? null); await refreshOrders() }, [session, load, refreshOrders])
  useEffect(() => { if (session) void refreshShift(session.id) }, [session, refreshShift])
  // Llegar aquí para elegir mesa descarta la que quedara seleccionada de antes: la elección tiene que ser de ahora.
  const askForTable = useCallback(() => {
    selectTable(null)
    setPickTable(true)
    router.replace('/salon')
  }, [selectTable, router])
  const refreshFloors = useCallback(async () => { if (catalog) setAllFloors(await listAllFloors(catalog.settings.configId)) }, [catalog])
  const configId = catalog?.settings.configId ?? null
  useEffect(() => {
    if (!settings || configId === null) return
    let alive = true
    void listAllFloors(configId).then((f) => { if (alive) setAllFloors(f) }).catch(() => { if (alive) toast({ title: 'No se pudo cargar la lista de pisos. Puedes editar el piso actual.', tone: 'danger' }) })
    return () => { alive = false }
  }, [settings, configId])

  // Piso mostrado: el elegido si sigue existiendo, si no el primero del catálogo (sin escribir en el store).
  const floorId = catalog && activeFloorId !== null && catalog.floors.some((f) => f.id === activeFloorId) ? activeFloorId : catalog?.floors[0]?.id ?? null
  // Pantalla partida: solo con dos pisos o más. El segundo panel muestra otro piso distinto del primero.
  const canSplit = (catalog?.floors.length ?? 0) > 1
  const splitOn = split && canSplit
  const secondId = !splitOn || !catalog ? null : catalog.floors.some((f) => f.id === secondFloorId && f.id !== floorId) ? secondFloorId : catalog.floors.find((f) => f.id !== floorId)?.id ?? null
  // Vistas de todas las mesas: la elegida puede estar en cualquiera de los dos paneles.
  const views = useMemo(() => (catalog ? deriveTableViews(catalog.tables, session ? openOrders : [], session ? flags : {}, session ? calls : []) : []), [catalog, openOrders, flags, calls, session])
  // Reservas del día por mesa: pintan la mesa en tinta con su hora, como en el kit.
  const tableIds = useMemo(() => views.filter((v) => v.table.floorId === floorId || v.table.floorId === secondId).map((v) => v.table.id).join(','), [views, floorId, secondId])
  useEffect(() => {
    if (tableIds === '') return
    let alive = true
    const ids = tableIds.split(',').map(Number)
    void reservedAtByTable(ids, today()).then((r) => { if (alive) setLoadedReserved({ key: tableIds, map: r }) })
      .catch(() => { if (alive) setLoadedReserved({ key: tableIds, map: {} }) })
    return () => { alive = false }
  }, [tableIds])
  const visibleTableIds = useMemo(() => views.filter((view) => {
    const id = view.table.floorId
    return (id === floorId || id === secondId) && (zoneTables[id] == null || zoneTables[id]!.includes(view.table.id))
  }).map((view) => view.table.id), [views, floorId, secondId, zoneTables])
  function openServiceTable(tableId: number) {
    const table = catalog?.tables.find((entry) => entry.id === tableId)
    if (!table) return
    if (table.floorId !== floorId && table.floorId !== secondId) setFloor(table.floorId)
    selectTable(tableId)
    setSheet('detail')
  }
  const reserved = loadedReserved?.key === tableIds ? loadedReserved.map : EMPTY_RESERVED
  const selected = views.find((v) => v.table.id === selectedTableId) ?? null
  const floor = catalog?.floors.find((f) => f.id === floorId) ?? null
  const secondFloor = catalog?.floors.find((f) => f.id === secondId) ?? null
  const imageFor = useCallback((productId: number) => { const p = catalog?.products.find((x) => x.id === productId); return p?.hasImage ? `/odoo/web/image/product.template/${p.templateId}/image_512` : null }, [catalog])
  const codeFor = useCallback((v: (typeof views)[number]) => { const o = openOrders.find((x) => x.id === v.orderId); return o ? orderCode('DI', o.tracking, o.id) : null }, [openOrders])

  function onSelect(id: number) {
    if (moving) { setTarget(id); return }
    selectTable(id === selectedTableId ? null : id)
  }
  async function confirmMove() {
    if (!moving || target === null || !catalog) return
    const to = catalog.tables.find((x) => x.id === target)
    setMovingBusy(true)
    try {
      await moveOrder(moving.detail.id, target)
      toast({ title: t('change.done', { name: String(to?.number ?? '') }) })
      setMoving(null); setTarget(null); selectTable(target)
      await reload()
    } catch (e) {
      toast({ title: e instanceof Error && e.message.includes('pedido') ? t('change.busy', { name: String(to?.number ?? '') }) : t('change.failed'), tone: 'danger' })
      setTarget(null)
    } finally { setMovingBusy(false) }
  }
  async function openEdit(f: FloorSetting) {
    if (session) { toast({ title: 'Cierra la caja para editar el plano. El reparto de meseros sí se puede cambiar ahora, desde «Meseros por zona».', tone: 'danger' }); return }
    try { const document = await readPlan(f.id); setSettings(false); setEditing(document) }
    catch { toast({ title: 'No se pudo abrir el editor del piso. Intenta de nuevo.', tone: 'danger' }) }
  }
  function addFloor() {
    if (session) { toast({ title: 'Cierra la caja para crear un piso.', tone: 'danger' }); return }
    setSettings(false); setEditing({id:null,name:'Nuevo piso',revision:0,tables:[],walls:[],zones:[]})
  }
  // Odoo se niega a tocar un piso con la caja abierta (obligaría a recalcular el turno en marcha): se explica
  // en una nota, no en una pantalla de error.
  async function toggleFloor(f: FloorSetting, active: boolean) {
    try {
      await setFloorActive(f.id, active)
      await refreshFloors()
      await reload()
    } catch (e) {
      const openSession = e instanceof Error && /PoS Session|sesión/i.test(e.message)
      toast({ title: openSession ? t('floorToggle.needsClosedSession') : t('floorToggle.failed'), body: openSession ? t('floorToggle.needsClosedSessionBody', { name: f.name }) : '', tone: 'danger' })
    }
  }

  // Eliminar un piso: el servidor exige PIN de administrador y caja cerrada, y decide si borra o archiva (historial).
  async function removeFloor(f: FloorSetting) {
    if (session) { toast({ title: t('floorSettings.deleteNeedsClosedSession'), tone: 'danger' }); return }
    try {
      const { result } = await deleteFloor(catalog!.settings.configId, f.id)
      if (activeFloorId === f.id) setFloor(catalog!.floors.find((x) => x.id !== f.id)?.id ?? f.id)
      await refreshFloors()
      await reload()
      toast({ title: t(result === 'archived' ? 'floorSettings.deletedArchived' : result === 'detached' ? 'floorSettings.deletedDetached' : 'floorSettings.deleted') })
    } catch (e) {
      toast({ title: t('floorSettings.deleteFailed'), body: e instanceof Error ? e.message : '', tone: 'danger' })
    }
  }

  // Entregar desde la mesa: lo mismo que marcarlo en Pedidos, guardado en Odoo. Uno o todos los que
  // cocina ya sacó al pase.
  async function serveLine(lines: OrderDetailLine[]) {
    await serveLines(lines.map((line) => line.id))
    await refreshOrders()
  }

  if (!catalog) return <FloorSkeleton />
  if (editing) return <FloorEditor initial={editing} configId={catalog.settings.configId}
    background={editing.id && catalog.floors.find(f => f.id === editing.id)?.hasBackground ? floorBackgroundUrl(editing.id, editing.revision) : null}
    onCancel={() => setEditing(null)} onSaved={async (saved) => { await reload(); setFloor(saved.id!); setEditing(null); toast({ title: 'Plano guardado' }) }} />
  // Cobrar puede ser solo de caja: lo decide el restaurante en Configuración.
  // Un pedido en mesa nace de una mesa elegida a propósito: sin selección se pide antes de abrir el asistente.
  const mayCreate = roleCan(role, 'create_orders', catalog.settings.rolePermissions)
  const mayServe = roleCan(role, 'serve_orders', catalog.settings.rolePermissions)
  const newOrderHref = selected ? selected.orderId ? `/salon/${selected.orderId}/agregar` : `/salon/nuevo?mesa=${selected.table.id}` : null
  return (
    <>
      <header className="shrink-0 min-h-[88px] px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <PageTitle>{t('title')}</PageTitle>
        <div className="ml-auto flex items-center gap-4">
          {!floor && mayManageFloors && <button type="button" onClick={() => setSettings((v) => !v)} aria-expanded={settings}
            className="min-h-12 px-3 rounded-md border border-border flex items-center gap-2 text-sm text-ink"><Icon name="cog" size={18} />{t('settings')}</button>}
          <TableLegend />
          <span aria-hidden className="w-px h-8 bg-border" />
          {canSplit && (
            <button type="button" aria-label={splitOn ? t('split.off') : t('split.on')} title={splitOn ? t('split.off') : `${t('split.on')} · ${t('split.hint')}`} aria-pressed={splitOn} onClick={() => setSplit(!splitOn)}
              className={cn('hidden md:grid w-12 h-12 rounded-md border place-items-center', splitOn ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-ink hover:bg-muted')}><Icon name="split" size={22} /></button>
          )}
        </div>
      </header>
      <div className="relative flex-1 min-h-0 flex">
      <div className="relative flex-1 min-w-0 min-h-0 flex">
        {([floor, secondFloor] as const).map((f, i) => f && (
          <FloorPane key={`${i}:${f.id}`} floor={f} configId={catalog.settings.configId} views={views.filter((v) => v.table.floorId === f.id)} reserved={reserved} refreshKey={catalog}
            selectedId={moving ? moving.fromTableId : selectedTableId} onSelect={onSelect} pickFree={moving !== null} codeFor={codeFor}
            compact={splitOn} onVisibleTables={onVisibleTables} onOpenTable={session && !moving ? openServiceTable : undefined}
            header={<div className="flex flex-col gap-2">
              <FloorSwitcher stacked floors={splitOn ? catalog.floors.filter((x) => x.id !== (i === 0 ? secondId : floorId)) : catalog.floors} activeId={f.id} onChange={i === 0 ? setFloor : setSecondFloor} />
              {splitOn && <button type="button" onClick={() => { if (i === 0 && secondFloor) setFloor(secondFloor.id); setSplit(false) }}
                className="min-h-11 flex items-center gap-2 text-[13px] text-soft hover:text-ink"><Icon name="close" size={16} />{t('split.close')}</button>}
            </div>}
            controls={i === 0 && mayManageFloors ? <Button type="button" size="compact" aria-expanded={settings} onClick={() => setSettings((v) => !v)}
              className="w-full h-auto! min-h-tap-min py-3"><Icon name="cog" size={20} className="shrink-0" /><span>{t('settings')}</span></Button> : undefined} />
        ))}
        {splitOn && secondFloor && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border" />}
        {moving ? (
          <div role="toolbar" aria-label={t('change.title')} className="absolute left-1/2 -translate-x-1/2 bottom-8 z-20 w-max max-w-[calc(100%_-_24px)] min-h-14 py-1.5 pl-4 pr-1.5 rounded-md bg-overlay text-[#F7F7F7] shadow-xl flex flex-wrap justify-center items-center gap-3 text-[15px] font-semibold">
            <span>{t('selected.moving', { code: orderCode(orderPrefix(moving.detail.serviceAt), moving.detail.tracking, moving.detail.id) })}</span>
            <button type="button" onClick={() => { setMoving(null); setTarget(null) }} className="h-11 px-3.5 rounded-sm bg-[#F7F7F7] text-[#0F172A] flex items-center gap-2"><Icon name="close" size={18} />{t('selected.cancelMove')}</button>
          </div>
        ) : selected && session && (
          <SelectedTableBar mayCreate={mayCreate} name={String(selected.table.number)} hasReservation={Boolean(reserved[selected.table.id])}
            onClear={() => selectTable(null)} onReservations={() => setSheet('reservations')} onDetail={() => setSheet('detail')}
            onNewOrder={() => newOrderHref && router.push(newOrderHref)} />
        )}
        <FloorSettingsPopover open={settings && mayManageFloors} onClose={() => setSettings(false)} floors={allFloors} currentFloor={floor ? { id: floor.id, name: floor.name, active: true, tableCount: floor.tableIds.length } : null} onAdd={addFloor} onEdit={openEdit} onToggle={toggleFloor} onDelete={(f) => void removeFloor(f)} />
      </div>
      <ServiceSidebar orders={session ? orders : []} calls={session ? calls : []} tables={catalog.tables} visibleTableIds={visibleTableIds} locations={locations} loaded={!session || ordersLoaded}
        onOpenTable={openServiceTable} />
      </div>
      {selected && (
        <ReservationListModal open={sheet === 'reservations' && booking === null} onClose={() => setSheet(null)} tableId={selected.table.id}
          tableName={String(selected.table.number)} onDetail={setBooking} />
      )}
      {booking && <ReservationDetailModal open onClose={() => setBooking(null)} reservationId={booking.id} />}
      {selected && (
        <TableDetailModal key={selected.table.id} open={sheet === 'detail'} onClose={() => setSheet(null)} tableName={String(selected.table.number)} orderId={selected.orderId} imageFor={imageFor}
          onChangeTable={(detail) => { setSheet(null); setMoving({ detail, fromTableId: selected.table.id }) }} onNewOrder={() => newOrderHref && router.push(newOrderHref)}
          onSendPending={mayCreate ? async (orderId) => { await fireUnsentLines(orderId); await refreshOrders() } : undefined}
          call={calls.find((call) => call.tableId === selected.table.id)}
          onAttendCall={mayServe ? async () => { await attendCall(selected.table.id); await refreshOrders() } : undefined}
          onServe={mayServe ? serveLine : undefined} busy={busy} mayCreate={mayCreate} />
      )}
      {moving && target !== null && (
        <ChangeTableModal open onClose={() => setTarget(null)} detail={moving.detail} busy={movingBusy} onConfirm={confirmMove}
          current={String(catalog.tables.find((x) => x.id === moving.fromTableId)?.number ?? '')} target={String(catalog.tables.find((x) => x.id === target)?.number ?? '')} />
      )}
      <Suspense><AskedForTable onAsk={askForTable} /></Suspense>
      <PickTablePrompt open={pickTable} onClose={() => setPickTable(false)} />
    </>
  )
}
