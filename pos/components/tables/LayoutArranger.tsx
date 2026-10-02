'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { TableShape } from '@/components/tables/TableShape'
import { Button } from '@/components/ui/Button'
import { GRID, TEMPLATES, canPlace, parseTableName, rotated, snap, type Rect, type TableTemplate } from '@/lib/domain/tablesKit'
import { toast } from '@/lib/stores/toastStore'
import { cn } from '@/lib/utils'

export interface EditorTable extends Rect { key: string; id: number | null; number: number; seats: number }
type Drag = { kind: 'new'; template: TableTemplate; rect: Rect } | { kind: 'move'; key: string; rect: Rect }
interface Props { tables: EditorTable[]; onChange: (tables: EditorTable[]) => void; onRemove?: (table: EditorTable) => void }

const PALETTE: TableTemplate[] = ['small', 'largeH', 'largeV']
const CELL = 28
const MIN_COLS = 20
const MIN_ROWS = 12
let seq = 0

// Miniatura de la paleta: la plantilla encogida a 34 px de lado mayor, con sus sillas alrededor (caben en 68 px).
const MINI = 34
function Mini({ template }: { template: TableTemplate }) {
  const tpl = TEMPLATES[template]
  const scale = MINI / Math.max(tpl.width, tpl.height)
  const rect = { x: 0, y: 0, width: tpl.width * scale, height: tpl.height * scale }
  return <div className="relative w-[68px] h-[68px] shrink-0 grid place-items-center"><div className="relative" style={{ width: rect.width, height: rect.height }}><TableShape inert rect={rect} name="" state="available" label="" /></div></div>
}

export function LayoutArranger({ tables, onChange, onRemove }: Props) {
  const t = useTranslations('tables.wizard')
  const canvas = useRef<HTMLDivElement>(null)
  const bin = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [pending, setPending] = useState<Rect | null>(null)
  const [name, setName] = useState('')

  const cols = Math.max(MIN_COLS, ...tables.map((x) => Math.ceil((x.x + x.width) / GRID) + 2))
  const rows = Math.max(MIN_ROWS, ...tables.map((x) => Math.ceil((x.y + x.height) / GRID) + 2))

  function start(e: React.PointerEvent, d: Drag, off: { x: number; y: number }) {
    e.preventDefault()
    setDrag(d); setOffset(off); setPointer({ x: e.clientX, y: e.clientY })
  }
  function drop(cx: number, cy: number) {
    if (!drag || !canvas.current) return
    const inside = (el: HTMLElement | null) => { const r = el?.getBoundingClientRect(); return Boolean(r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) }
    if (inside(bin.current)) {
      if (drag.kind !== 'move') return
      const gone = tables.find((x) => x.key === drag.key)
      onChange(tables.filter((x) => x.key !== drag.key)); if (gone) onRemove?.(gone)
      return
    }
    if (!inside(canvas.current)) return
    const box = canvas.current.getBoundingClientRect()
    const rect: Rect = { ...drag.rect, x: snap(cx - offset.x - box.left + canvas.current.scrollLeft), y: snap(cy - offset.y - box.top + canvas.current.scrollTop) }
    if (!canPlace(rect, tables, drag.kind === 'move' ? drag.key : null)) { toast({ title: t('overlap'), tone: 'danger' }); return }
    if (drag.kind === 'move') onChange(tables.map((x) => (x.key === drag.key ? { ...x, ...rect } : x)))
    else { setPending(rect); setName('') }
  }

  // Sin lista de dependencias a propósito: cada render vuelve a enganchar el puntero con las mesas de ese render.
  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => setPointer({ x: e.clientX, y: e.clientY })
    const up = (e: PointerEvent) => { drop(e.clientX, e.clientY); setDrag(null) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  })

  const parsed = parseTableName(name)
  const taken = parsed.number !== null && tables.some((x) => x.number === parsed.number)
  const nameError = name.trim() === '' ? null : parsed.number === null ? t('nameNeedsNumber') : taken ? t('nameTaken', { number: parsed.number }) : null
  function confirmName() {
    if (!pending || parsed.number === null || taken) return
    const tpl = TEMPLATES[pending.width > pending.height ? 'largeH' : pending.height > pending.width ? 'largeV' : 'small']
    onChange([...tables, { key: `n${++seq}`, id: null, number: parsed.number, seats: tpl.seats, ...pending }])
    setPending(null)
  }
  function rotate(key: string) {
    onChange(tables.map((x) => (x.key === key ? rotated(x) : x)))
  }

  const ghost = drag ? { ...drag.rect, x: pointer.x - offset.x, y: pointer.y - offset.y } : null
  return (
    <div className="flex-1 min-h-0 flex">
      <aside className="w-[212px] shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border"><p className="text-[15px] font-semibold text-ink">{t('selection')}</p><p className="text-[13px] text-dim">{t('selectionHint')}</p></div>
        <ul className="p-2 flex flex-col gap-1">
          {PALETTE.map((k) => (
            <li key={k}>
              <button type="button" aria-label={t(k)} onPointerDown={(e) => start(e, { kind: 'new', template: k, rect: { x: 0, y: 0, ...TEMPLATES[k] } }, { x: TEMPLATES[k].width / 2, y: TEMPLATES[k].height / 2 })}
                className="w-full h-[76px] px-2 rounded-md flex items-center gap-2 text-left touch-none hover:bg-muted cursor-grab">
                <Mini template={k} />
                <span className="flex flex-col whitespace-nowrap"><span className="text-[13px] font-semibold text-ink">{t(k)}</span><span className="flex items-center gap-1 text-[12px] text-dim"><Icon name="user" size={12} />{t(k === 'small' ? 'smallPeople' : 'largePeople')}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="relative flex-1 min-w-0 min-h-0">
        <div ref={canvas} role="region" aria-label={t('canvas')} data-testid="layout-canvas" className="absolute inset-0 overflow-auto">
          <div className="relative" style={{ width: cols * GRID, height: rows * GRID }}>
            <div aria-hidden className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${cols}, ${GRID}px)`, gridAutoRows: `${GRID}px` }}>
              {Array.from({ length: cols * rows }, (_, i) => <span key={i} className="rounded-sm bg-border" style={{ width: CELL, height: CELL, margin: (GRID - CELL) / 2 }} />)}
            </div>
            {tables.map((x) => (
              <TableShape key={x.key} rect={x} name={String(x.number)} state="available" label={t('move', { name: String(x.number) })} className={cn(drag?.kind === 'move' && drag.key === x.key && 'opacity-30')}
                onPointerDown={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); start(e, { kind: 'move', key: x.key, rect: x }, { x: e.clientX - r.left, y: e.clientY - r.top }) }}>
                <span aria-hidden className="absolute -left-3 -top-3 w-7 h-7 rounded-full bg-primary text-primary-ink grid place-items-center shadow"><Icon name="move" size={16} /></span>
                <button type="button" aria-label={t('rotate', { name: String(x.number) })} onClick={() => rotate(x.key)} className="absolute -right-3 -top-3 w-7 h-7 rounded-full bg-surface border border-border text-soft grid place-items-center shadow"><Icon name="rotate" size={14} /></button>
              </TableShape>
            ))}
          </div>
        </div>
        <div ref={bin} className={cn('absolute right-4 bottom-4 w-32 h-16 rounded-md border border-danger/40 bg-danger-soft text-danger-ink flex flex-col items-center justify-center gap-1 text-[12px] font-semibold', drag?.kind === 'move' && 'ring-2 ring-danger')}>
          <Icon name="trash" size={18} />{t('deleteZone')}
        </div>
      </div>
      {ghost && (
        <div className="fixed z-[70] pointer-events-none opacity-80 rotate-6" style={{ left: 0, top: 0 }}>
          <TableShape inert rect={ghost} name={drag?.kind === 'move' ? String(tables.find((x) => x.key === drag.key)?.number ?? '') : ''} state="available" label="" />
        </div>
      )}
      <Modal open={pending !== null} onClose={() => setPending(null)} title={t('nameTitle')} footer={<Button variant="primary" className="w-full" disabled={parsed.number === null || taken} onClick={confirmName}>{t('nameConfirm')}</Button>}>
        <div className="p-4 flex flex-col gap-2">
          <input autoFocus aria-label={t('nameTitle')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirmName() }} placeholder={t('namePlaceholder')}
            className="h-12 px-3.5 rounded-sm border border-border bg-surface text-[15px] text-ink focus:outline-2 focus:outline-primary" />
          {nameError ? <p className="text-[13px] text-danger-ink">{nameError}</p> : parsed.number !== null && !parsed.exact ? <p className="text-[13px] text-dim">{t('nameHint', { number: parsed.number })}</p> : null}
        </div>
      </Modal>
    </div>
  )
}
