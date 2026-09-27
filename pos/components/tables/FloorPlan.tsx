'use client'

import { useTranslations } from 'next-intl'

import { DecorArt } from '@/components/tables/decor/DecorArt'
import { PlanViewport } from '@/components/tables/PlanViewport'
import { BACKGROUND_OPACITY, WALL_COLOR, contentBounds, planImageSrc, type FloorDocument, type PlanRect } from '@/lib/domain/floorPlan'
import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { TableShape, type TablePill } from '@/components/tables/TableShape'
import type { TableState, TableView } from '@/lib/domain/tableState'
import { kitState, orderCode } from '@/lib/domain/tablesKit'
import type { TableReservation } from '@/lib/services/tables'
import { cn } from '@/lib/utils'

interface Props {
  onOpenTable?: (id: number) => void
  plan?: FloorDocument | null; visibleIds?: number[] | null; views: TableView[]; selectedId: number | null; selectedIds?: number[]; onSelect: (id: number) => void; background?: string | null; pickFree?: boolean
  codeFor?: (view: TableView) => string | null; reserved?: Record<number, TableReservation | null>
  // Mesas que se ven pero no se pueden elegir (al reservar: no alcanzan para el grupo). Salen atenuadas.
  blockedIds?: number[]; blockedLabel?: string
  // Nombres de los meseros de cada zona, para rotularla en el plano.
  zoneStaff?: Record<string, string[]>
}

// Estado bajo la mesa, en las palabras del kit. Los estados que el kit no dibuja (asistencia, cuenta pedida…) van con
// la misma píldora naranja y su propio texto: son reales y el mesero los necesita.
export function pillFor(state: TableState, t: (key: string) => string): TablePill | null {
  if (state === 'free') return null
  if (state === 'occupied') return { text: t('pendingSend'), icon: 'cart' }
  if (state === 'served') return { text: t('served'), icon: 'check' }
  if (state === 'ready') return { text: t('ready'), icon: 'chef', tone: 'success' }
  if (state === 'billing') return { text: t('billing'), icon: 'receipt' }
  if (state === 'assist') return { text: t('assist'), icon: 'bell' }
  if (state === 'ordering') return { text: t('ordering'), icon: 'cart' }
  if (state === 'closed') return { text: t('closed'), icon: 'lock' }
  if (state === 'paid') return { text: t('paid'), icon: 'check' }
  return { text: t('inProgress'), icon: 'alarm' }
}

// Plano real del piso (posición y tamaño de restaurant.table) con scroll horizontal, como en el kit.
export function FloorPlan({ views, selectedId, selectedIds, onSelect, onOpenTable, background = null, pickFree = false, codeFor, reserved = {}, plan, visibleIds, blockedIds, blockedLabel, zoneStaff }: Props) {
  const t = useTranslations('tables')
  const ts = useTranslations('tables.state')
  const empty = views.length === 0 && !plan?.zones.length && !plan?.walls.length && !plan?.decor?.length && !background && !plan?.images?.length
  if (empty) return <KitEmptyState icon="tables" title={t('emptyFloor.title')} body={t('emptyFloor.body')} />
  // La imagen ocupa el rectángulo guardado con el plano (o 1200×800 en planos anteriores al control de tamaño).
  const image: PlanRect | null = background ? { x: plan?.backgroundSize?.x ?? 0, y: plan?.backgroundSize?.y ?? 0, width: plan?.backgroundSize?.width ?? 1200, height: plan?.backgroundSize?.height ?? 800 } : null
  const operated: PlanRect[] = [...views.map((v) => v.table), ...(plan?.zones ?? []), ...(plan?.walls ?? []), ...(plan?.decor ?? [])]
  const extras = plan?.images ?? []
  const bounds = contentBounds([...operated, ...(image ? [image] : []), ...extras])
  const core = operated.length ? contentBounds(operated) : bounds
  return (
    <PlanViewport bounds={bounds} core={core} inset={64}>
      <div className="relative">
        <div className="absolute left-0 top-0">
          {image && <img src={background!} alt="" className="absolute max-w-none object-contain object-left-top pointer-events-none" style={{ left: image.x, top: image.y, width: image.width, height: image.height, opacity: BACKGROUND_OPACITY }} />}
          {extras.map((extra) => <img key={extra.id} src={planImageSrc(extra)} alt="" className="absolute max-w-none object-contain object-left-top pointer-events-none" style={{ left: extra.x, top: extra.y, width: extra.width, height: extra.height, opacity: BACKGROUND_OPACITY }} />)}
          {plan?.zones.map(z=><div key={z.id} className="absolute border-2 border-dashed rounded pointer-events-none" style={{left:z.x,top:z.y,width:z.width,height:z.height,borderColor:z.color,backgroundColor:z.color+'18'}}><span className="inline-block origin-top-left whitespace-nowrap px-2 py-1 text-sm font-semibold" style={{color:z.color,transform:'scale(calc(1 / var(--plan-zoom, 1)))'}}>{z.name}{zoneStaff?.[z.id]?.length ? <span className="font-normal"> · {zoneStaff[z.id].join(', ')}</span> : null}</span></div>)}
          {plan?.decor?.map(d=><svg key={d.id} aria-hidden className="absolute pointer-events-none overflow-visible" style={{left:d.x,top:d.y,width:d.width,height:d.height}} viewBox={`0 0 ${d.width} ${d.height}`}><DecorArt item={d}/></svg>)}
          {plan?.walls.map(w=><div key={w.id} className="absolute border border-black/40 pointer-events-none" style={{left:w.x,top:w.y,width:w.width,height:w.height,backgroundColor:w.color??WALL_COLOR}}/>)}
          {views.map((v) => {
            const booking = reserved[v.table.id] ?? null
            const state = kitState(v.state, booking !== null)
            // Mover un pedido solo puede aterrizar en una mesa libre: una reservada tampoco vale.
            const blocked = blockedIds?.includes(v.table.id) ?? false
            const pickable = (!pickFree || state === 'available') && !blocked
            const name = String(v.table.number)
            const pill = state === 'reserved' && booking ? { text: booking.label, icon: 'clock' as const } : pillFor(v.state, ts)
            const notices: TablePill[] = (v.notices ?? []).map((notice) => notice === 'ready'
              ? { text: ts('ready'), icon: 'chef', tone: 'success' }
              : notice === 'unsent' ? { text: ts('pendingSend'), icon: 'cart' }
              : { text: ts(notice === 'bill' ? 'billing' : notice), icon: 'bell' })
            const extraLabels = notices.filter((notice) => notice.text !== pill?.text).map((notice) => notice.text)
            const legend = state === 'reserved' ? t('legend.reserved') : t('legend.available')
            return (
              <TableShape key={v.table.id} rect={v.table} notices={notices} name={name} state={state} selected={v.table.id === selectedId || !!selectedIds?.includes(v.table.id)} dimmed={(pickFree && !pickable) || (visibleIds != null && !visibleIds.includes(v.table.id))}
                code={codeFor ? codeFor(v) : v.orderId !== null ? orderCode('DI', null, v.orderId) : null} pill={pill ?? {text: `${v.table.seats} personas`,icon:'user'}}
                label={t('tableLabel', { name, state: blocked && blockedLabel ? blockedLabel : state === 'unavailable' && pill ? [pill.text, ...extraLabels].join(' · ') : legend })}
                onDoubleClick={pickable && onOpenTable ? () => onOpenTable(v.table.id) : undefined} onClick={pickable ? () => onSelect(v.table.id) : undefined} className={cn(!pickable && 'pointer-events-none')} />
            )
          })}
        </div>
      </div>
    </PlanViewport>
  )
}
