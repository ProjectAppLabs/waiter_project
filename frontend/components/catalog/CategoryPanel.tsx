'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import type { AdminCategory } from '@/lib/services/catalogAdmin'

interface CategoryPanelProps { categories: AdminCategory[]; productCount: (categoryId: number) => number; onSave: (id: number | null, c: { name: string; station: string | null }) => Promise<void>; onClose: () => void }

// Categorías como panel del kit (lista de pisos de Table / Setting): una fila por categoría con nombre y estación de
// cocina editables, y la nueva al final. Cada fila guarda por separado.
export function CategoryPanel({ categories, productCount, onSave, onClose }: CategoryPanelProps) {
  const t = useTranslations('admin.catalog.catForm')
  const [drafts, setDrafts] = useState<Record<string, { name: string; station: string }>>(() =>
    Object.fromEntries([...categories.map((c) => [String(c.id), { name: c.name, station: c.station ?? '' }]), ['new', { name: '', station: '' }]]))
  const edit = (key: string, patch: Partial<{ name: string; station: string }>) => setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }))
  const rows = [...categories.map((c) => String(c.id)), 'new']
  return (
    <Modal open onClose={onClose} title={t('title')} size="wide">
      <div className="p-6 flex flex-col gap-3">
        {rows.map((key) => {
          const isNew = key === 'new'
          const original = isNew ? null : categories.find((c) => String(c.id) === key)
          // Una categoría recién creada llega con la lista antes de tener borrador: se muestra tal cual.
          const d = drafts[key] ?? { name: original?.name ?? '', station: original?.station ?? '' }
          const dirty = isNew ? d.name.trim() !== '' : d.name !== original?.name || d.station !== (original?.station ?? '')
          return (
            <section key={key} aria-label={isNew ? t('new') : (original?.name ?? d.name)} className="rounded-md border border-border p-4 grid grid-cols-[48px_1fr_1fr_auto] gap-4 items-end">
              <span className="w-12 h-12 rounded-md bg-primary-soft text-primary grid place-items-center"><Icon name={isNew ? 'plus' : 'tag'} size={22} /></span>
              <TextInput label={isNew ? t('new') : t('name')} value={d.name} onChange={(e) => edit(key, { name: e.target.value })} hint={isNew ? undefined : t('products', { n: productCount(Number(key)) })} />
              <TextInput label={t('station')} hint={t('stationHint')} value={d.station} onChange={(e) => edit(key, { station: e.target.value })} />
              <Button variant={dirty ? 'primary' : 'secondary'} disabled={!d.name.trim() || !dirty} onClick={async () => { await onSave(isNew ? null : Number(key), { name: d.name.trim(), station: d.station.trim() || null }); if (isNew) edit('new', { name: '', station: '' }) }} className="mb-6">{t('save')}</Button>
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
