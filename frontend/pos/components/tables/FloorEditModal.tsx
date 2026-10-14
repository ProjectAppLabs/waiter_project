'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { FloorInfoForm, type FloorInfo } from '@/components/tables/FloorInfoForm'
import { LayoutArranger, type EditorTable } from '@/components/tables/LayoutArranger'
import { Button } from '@/components/ui/Button'
import { floorName, floorNumber, parseFloorName } from '@/lib/domain/tablesKit'
import { saveFloorLayout, type FloorSetting } from '@/lib/services/tables'
import { toast } from '@/lib/stores/toastStore'
import type { Table } from '@/lib/types'
import { cn } from '@/lib/utils'

type Tab = 'info' | 'arrange'
const TABS: [Tab, KitIcon][] = [['info', 'tables'], ['arrange', 'move']]
interface Props { open: boolean; onClose: () => void; floor: FloorSetting; tables: Table[]; configId: number; onSaved: () => Promise<void>; save?: typeof saveFloorLayout }

// Modal "Editar plano" del kit (Table Setting/Edit Table/*.png): pestañas Información / Organizar plano y "Guardar información".
export function FloorEditModal({ open, onClose, floor, tables, configId, onSaved, save = saveFloorLayout }: Props) {
  const t = useTranslations('tables.wizard')
  const [tab, setTab] = useState<Tab>('info')
  const parsed = parseFloorName(floor.name)
  const [info, setInfo] = useState<FloorInfo>({ number: floorNumber(floor.name) !== null ? String(floorNumber(floor.name)) : parsed.label, type: parsed.type, background: undefined, preview: null })
  // El modal se monta con las mesas del piso ya leídas (page.tsx lo renderiza solo al editar): estado inicial y ya.
  const [layout, setLayout] = useState<EditorTable[]>(() => tables.map((x) => ({ key: `t${x.id}`, id: x.id, number: x.number, seats: x.seats, x: x.x, y: x.y, width: x.width, height: x.height })))
  const [removed, setRemoved] = useState<number[]>([])
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await save({ id: floor.id, name: floorName(info.number || parsed.label, info.type), configId }, layout.map(({ id, number, seats, x, y, width, height }) => ({ id, number, seats, x, y, width, height })), removed)
      toast({ title: t('saved'), body: t('savedBody') }); await onSaved(); onClose()
    } catch { toast({ title: t('failed'), tone: 'danger' }) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('editTitle')} size="wide">
      <div className="h-full flex flex-col bg-canvas">
        <div role="tablist" className="shrink-0 px-2 py-2 flex gap-2">
          {TABS.map(([key, icon]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={cn('h-11 px-3.5 rounded-md flex items-center gap-2 text-[15px] font-semibold', tab === key ? 'bg-surface border border-border text-ink' : 'text-dim')}><Icon name={icon} size={20} />{t(`steps.${key}`)}</button>
          ))}
        </div>
        <section className="flex-1 min-h-0 mx-2 mb-2 rounded-lg border border-border bg-surface flex flex-col overflow-hidden">
          <header className="h-14 px-4 border-b border-border flex items-center text-[18px] font-semibold text-ink">{t(`steps.${tab}`)}</header>
          {tab === 'info' ? <div className="flex-1 min-h-0 overflow-auto flex flex-col"><FloorInfoForm value={info} onChange={setInfo} edit /></div>
            : <LayoutArranger tables={layout} onChange={setLayout} onRemove={(x) => { if (x.id !== null) setRemoved((r) => [...r, x.id as number]) }} />}
          <footer className="px-4 py-3 border-t border-border"><Button variant="primary" onClick={submit} disabled={busy || !info.number.trim()}>{busy ? t('saving') : t('save')}</Button></footer>
        </section>
      </div>
    </Modal>
  )
}
