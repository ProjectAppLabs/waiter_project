'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Toggle } from '@/components/kit/Toggle'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { parseFloorName } from '@/lib/domain/tablesKit'
import type { FloorSetting } from '@/lib/services/tables'

interface Props {
  open: boolean; onClose: () => void; floors: FloorSetting[]; currentFloor?: FloorSetting | null
  onAdd: () => void; onEdit: (floor: FloorSetting) => void; onToggle: (floor: FloorSetting, active: boolean) => void; onDelete: (floor: FloorSetting) => void
}

// Popover del engranaje (Table Setting/Dropdown.png). Arriba, lo que se hace casi siempre: editar el piso que se está
// viendo y agregar otro. Debajo, todos los pisos en dos grupos, activos e inactivos, cada uno con sus mesas, su
// interruptor, su lápiz y su papelera. Eliminar pide confirmación: borra el piso y sus mesas.
export function FloorSettingsPopover({ open, onClose, floors, currentFloor, onAdd, onEdit, onToggle, onDelete }: Props) {
  const t = useTranslations('tables.floorSettings')
  const ref = useRef<HTMLDivElement>(null)
  const [deleting, setDeleting] = useState<FloorSetting | null>(null)
  useEffect(() => {
    if (!open || deleting) return
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open, onClose, deleting])
  if (!open) return null
  const label = (f: FloorSetting) => parseFloorName(f.name).label
  const groups = [['activeGroup', floors.filter((f) => f.active)], ['inactiveGroup', floors.filter((f) => !f.active)]] as const
  return (
    <>
      <div ref={ref} role="dialog" aria-label={t('title')} className="absolute left-4 bottom-4 z-30 w-[360px] max-w-[calc(100vw-2rem)] max-h-[calc(100%-1rem)] rounded-md bg-surface border border-border shadow-xl flex flex-col">
        <div className="p-3 flex flex-col gap-2 border-b border-border">
          <h2 className="px-1 flex items-center gap-2 text-[15px] font-semibold text-ink"><Icon name="tables" size={18} />{t('title')}</h2>
          {currentFloor && <button type="button" onClick={() => onEdit(currentFloor)} className="min-h-14 p-3 rounded-sm border border-primary/30 bg-primary-soft flex items-center gap-3 text-left text-primary">
            <Icon name="edit" size={20} />
            <span className="min-w-0 flex flex-col"><span className="text-[15px] font-semibold">{t('editCurrent')}</span><span className="truncate text-[13px]">{label(currentFloor)}</span></span>
          </button>}
          <button type="button" onClick={onAdd} className="h-11 rounded-sm border border-border flex items-center justify-center gap-2 text-[15px] font-semibold text-soft hover:bg-muted"><Icon name="plus" size={18} />{t('add')}</button>
        </div>
        <div className="min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
          {floors.length === 0 && !currentFloor && <p className="py-2 text-center text-[13px] text-dim">{t('empty')}</p>}
          {groups.map(([group, items]) => items.length > 0 && (
            <section key={group} aria-label={t(group)}>
              <h3 className="px-1 pb-1 text-[13px] font-semibold text-soft">{t(group)} · {items.length}</h3>
              {group === 'inactiveGroup' && <p className="px-1 pb-1 text-[12px] text-dim">{t('inactiveHint')}</p>}
              <ul className="flex flex-col">
                {items.map((f) => (
                  <li key={f.id} className="min-h-14 flex items-center gap-1 border-b border-border last:border-0">
                    <span className="flex-1 min-w-0 px-1 flex flex-col"><span className="truncate text-[14px] font-semibold text-ink">{label(f)}</span><span className="text-[12px] text-dim">{t('tables', { count: f.tableCount })}</span></span>
                    <Toggle checked={f.active} onChange={(v) => onToggle(f, v)} label={t('active', { name: label(f) })} />
                    <button type="button" aria-label={t('edit', { name: label(f) })} title={t('edit', { name: label(f) })} onClick={() => onEdit(f)} className="w-11 h-11 grid place-items-center rounded-sm text-soft hover:bg-muted hover:text-ink"><Icon name="edit" size={18} /></button>
                    <button type="button" aria-label={t('delete', { name: label(f) })} title={t('delete', { name: label(f) })} onClick={() => setDeleting(f)} className="w-11 h-11 grid place-items-center rounded-sm text-soft hover:bg-danger-soft hover:text-danger-ink"><Icon name="trash" size={18} /></button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
      <ConfirmDialog open={deleting !== null} destructive title={deleting ? t('deleteTitle', { name: label(deleting) }) : ''} body={deleting ? t('deleteBody', { count: deleting.tableCount }) : ''}
        confirmLabel={t('deleteConfirm')} cancelLabel={t('deleteCancel')} onCancel={() => setDeleting(null)} onConfirm={() => { if (deleting) onDelete(deleting); setDeleting(null) }} />
    </>
  )
}
