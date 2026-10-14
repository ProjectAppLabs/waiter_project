'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Icon } from '@/components/kit/Icon'
import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { LoadingRegion, Skeleton } from '@/components/kit/Skeleton'
import { cardPlacement, offscreenReservations, type OffscreenSide, type ReservationCard, type Slot, type TimelineTable } from '@/lib/domain/reservations'
import { cn } from '@/lib/utils'

const SLOT_WIDTH = 132
const ROW_HEIGHT = 76
const HEADER_HEIGHT = 100
const TABLE_COLUMN = 248 // la columna fija «Mesa»: tapa ese tramo de la zona de horas

// Grilla mesa × hora del kit (Reservation / Home.png): una fila por mesa, una columna por franja de 30 min
// y la tarjeta tan ancha como dura la reserva.
export function ReservationTimeline({ slots, tables, onOpen, floorSelector, error }: { slots: Slot[]; tables: TimelineTable[]; onOpen: (card: ReservationCard) => void; floorSelector?: ReactNode; error?: string | null }) {
  const t = useTranslations('reservations')
  const scroller = useRef<HTMLDivElement>(null)
  const empty = tables.length === 0
  // Tramo visible de la zona de horas. Se mide al desplazar y al cambiar de tamaño (a lo sumo una vez por fotograma).
  const [view, setView] = useState<{ start: number; end: number } | null>(null)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let frame = 0
    const measure = () => { frame = 0; setView({ start: el.scrollLeft, end: el.scrollLeft + el.clientWidth - TABLE_COLUMN }) }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    schedule()
    el.addEventListener('scroll', schedule, { passive: true })
    return () => { observer.disconnect(); el.removeEventListener('scroll', schedule); if (frame) cancelAnimationFrame(frame) }
  }, [empty, error])
  // El selector sigue disponible en pisos vacíos y cuando falla una petición.
  if (empty || error) return <div className="flex-1 min-h-0 flex flex-col mx-4 mb-4 rounded-lg border border-border overflow-hidden">
    <div className="shrink-0 flex border-b border-border bg-canvas"><TimelineCorner>{floorSelector}</TimelineCorner></div>
    {error ? <p role="alert" className="m-6 px-4 py-3 rounded-md bg-danger-soft text-danger-ink text-[15px]">{error}</p>
      : <KitEmptyState icon="reservations" title={t('empty.tables')} body={t('empty.tablesBody')} />}
  </div>

  const hidden = view ? offscreenReservations(tables, slots, view, SLOT_WIDTH) : { left: null, right: null }
  // Lleva a la reserva señalada dejando una franja de aire a su izquierda.
  const reveal = (side: OffscreenSide) => scroller.current?.scrollTo({ left: Math.max(0, side.x - SLOT_WIDTH), behavior: 'smooth' })

  return (
    <div className="relative flex-1 min-h-0 flex flex-col mx-4 mb-4 rounded-lg border border-border overflow-hidden">
    {hidden.left && <OffscreenBubble side="left" rows={tables.length} info={hidden.left} onClick={() => reveal(hidden.left!)} />}
    {hidden.right && <OffscreenBubble side="right" rows={tables.length} info={hidden.right} onClick={() => reveal(hidden.right!)} />}
    <div ref={scroller} className="flex-1 min-h-0 overflow-auto">
      <div className="min-w-max">
        <div className="sticky top-0 z-20 flex bg-canvas border-b border-border">
          <TimelineCorner>{floorSelector}</TimelineCorner>
          {slots.map((slot) => (
            <span key={slot.time} style={{ width: SLOT_WIDTH }}
              className={cn('shrink-0 flex items-end px-3 py-3 text-[14px] font-semibold border-r border-border', slot.past || slot.closed ? 'text-dim' : 'text-soft')}>{slot.label}</span>
          ))}
        </div>
        {tables.map((table) => (
          <div key={table.id} className="flex border-b border-border" style={{ height: ROW_HEIGHT }}>
            <span style={{ width: TABLE_COLUMN }} className="sticky left-0 z-10 shrink-0 bg-surface border-r border-border px-4 flex items-center gap-2 text-[15px] font-semibold text-ink">
              {table.tableNumber}<span className="flex items-center gap-1 text-[13px] font-normal text-dim"><Icon name="user" size={14} />{table.seats}</span>
            </span>
            <div className="relative flex-1" style={{ width: slots.length * SLOT_WIDTH }}>
              {slots.map((slot, i) => (
                <span key={slot.time} className={cn('absolute top-0 bottom-0 border-r border-border',
                  // El pasado se indica en el encabezado, sin cortar el fondo de la grilla.
                  // Fuera del horario de reservas (el hueco entre almuerzo y cena): rayado, para no confundirlo con «ya pasó».
                  slot.closed && 'bg-[repeating-linear-gradient(135deg,var(--kit-border)_0_2px,transparent_2px_8px)]')}
                  style={{ left: i * SLOT_WIDTH, width: SLOT_WIDTH }} />
              ))}
              {table.reservations.map((card) => {
                const place = cardPlacement(card, slots)
                if (!place) return null
                return (
                  <button key={card.id} type="button" onClick={() => onOpen(card)}
                    style={{ left: place.index * SLOT_WIDTH + 6, width: place.span * SLOT_WIDTH - 12 }}
                    className={cn('absolute top-2 bottom-2 px-3 rounded-md border text-left flex flex-col justify-center gap-0.5 overflow-hidden',
                      card.state === 'seated' ? 'bg-success-soft border-success/40 text-success-ink' : 'bg-primary-soft border-primary/40 text-primary')}>
                    <span className="text-[12px] font-semibold opacity-80">ID# {card.name}</span>
                    <span className="flex items-center gap-2 text-[15px] font-semibold text-ink truncate">
                      {card.customerName}
                      <span className="flex items-center gap-1 text-[13px] font-normal text-soft"><Icon name="user" size={13} />{card.people}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
    </div>
  )
}

// Globito de borde, como el indicador de un videojuego que señala algo fuera de pantalla: dice cuántas reservas quedan
// hacia ese lado y a qué hora es la más cercana; tocarlo lleva hasta ella. La flecha se mece hacia su lado para llamar la
// atención (quieta si el sistema pide menos movimiento).
function OffscreenBubble({ side, info, rows, onClick }: { side: 'left' | 'right'; info: OffscreenSide; rows: number; onClick: () => void }) {
  const t = useTranslations('reservations.offscreen')
  return (
    <button type="button" onClick={onClick} aria-label={t(side === 'left' ? 'earlierLabel' : 'laterLabel', { count: info.count, time: info.nearest.label })}
      // A media altura de las filas: con pocas mesas, el centro del panel es espacio vacío lejos de la grilla.
      style={{ top: `min(50%, ${HEADER_HEIGHT + (rows * ROW_HEIGHT) / 2}px)`, ...(side === 'left' ? { left: TABLE_COLUMN + 12 } : { right: 16 }) }}
      className={cn('absolute -translate-y-1/2 z-20 h-12 pl-3 pr-4 rounded-full bg-ink text-surface shadow-xl flex items-center gap-2 text-[14px] font-semibold', side === 'right' && 'flex-row-reverse pl-4 pr-3')}>
      <span className={cn('w-7 h-7 rounded-full bg-primary text-primary-ink grid place-items-center', side === 'left' ? 'offscreen-nudge-left' : 'offscreen-nudge-right')}>
        <Icon name={side === 'left' ? 'chevronLeft' : 'chevronRight'} size={18} />
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span>{t('count', { count: info.count })}</span>
        <span className="text-[12px] font-normal opacity-75">{t(side === 'left' ? 'earlier' : 'later', { time: info.nearest.label })}</span>
      </span>
    </button>
  )
}

// Esqueleto de la grilla con las mismas medidas que la real (filas de ROW_HEIGHT, columnas de SLOT_WIDTH, la columna de
// mesas fija): al llegar los datos no salta nada de sitio. Algunas tarjetas sueltas dicen «aquí van las reservas».
const SKELETON_CARDS: [number, number, number][] = [[0, 2, 3], [1, 5, 2], [3, 1, 3], [4, 6, 2]] // [fila, columna, franjas]
export function TimelineSkeleton({ rows = 6, columns = 10, floorSelector }: { rows?: number; columns?: number; floorSelector?: ReactNode }) {
  return (
    <LoadingRegion className="flex-1 min-h-0 mx-4 mb-4 rounded-lg border border-border overflow-hidden">
      <div className="flex border-b border-border bg-canvas">
        <TimelineCorner>{floorSelector}</TimelineCorner>
        {Array.from({ length: columns }, (_, i) => <span key={i} className="shrink-0 flex items-end px-3 py-3 border-r border-border" style={{ width: SLOT_WIDTH }}><Skeleton className="h-3.5 w-12" /></span>)}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex border-b border-border" style={{ height: ROW_HEIGHT }}>
          <span style={{ width: TABLE_COLUMN }} className="shrink-0 px-4 border-r border-border flex items-center gap-2 bg-surface"><Skeleton className="h-4 w-8" /><Skeleton className="h-3.5 w-6" /></span>
          <div className="relative flex-1">
            {SKELETON_CARDS.filter(([r]) => r === row).map(([, col, span]) => (
              <Skeleton key={col} className="absolute top-2 bottom-2 rounded-md" style={{ left: col * SLOT_WIDTH + 6, width: span * SLOT_WIDTH - 12 }} />
            ))}
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}


// La misma esquina y medidas en la grilla, la carga y los estados vacíos.
function TimelineCorner({ children }: { children?: ReactNode }) {
  const t = useTranslations('reservations')
  return <div style={{ width: TABLE_COLUMN, minHeight: HEADER_HEIGHT }} className="sticky left-0 z-10 shrink-0 bg-canvas border-r border-border px-4 py-3 flex flex-col justify-between gap-2">
    {children}
    <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-dim">{t('tableColumn')}</span>
  </div>
}
