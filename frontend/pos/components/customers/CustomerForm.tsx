'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Modal } from '@/components/kit/Modal'
import { Button } from '@/components/ui/Button'
import { Select, TextInput } from '@/components/ui/Field'
import type { CustomerInput, IdType } from '@/lib/services/customers'

interface CustomerFormProps { initial: CustomerInput; isNew: boolean; idTypes: IdType[]; onSave: (c: CustomerInput) => Promise<void>; onClose: () => void }

// Alta y edición de cliente en un modal del kit (Reservation / Customer Information): dos columnas de campos y el botón al pie.
export function CustomerForm({ initial, isNew, idTypes, onSave, onClose }: CustomerFormProps) {
  const t = useTranslations('admin.customers.form')
  const ui = useTranslations('admin.common')
  const [c, setC] = useState(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const patch = (x: Partial<CustomerInput>) => setC((v) => ({ ...v, ...x }))
  async function save() {
    setState('saving')
    try { await onSave({ ...c, name: c.name.trim() }); setState('saved') } catch { setState('error') }
  }
  return (
    <Modal open onClose={onClose} title={isNew ? t('newTitle') : t('title')} size="wide" footer={
      <div className="flex items-center gap-4">
        <Button variant="primary" onClick={save} disabled={state === 'saving' || !c.name.trim()}>{t('save')}</Button>
        {state === 'saved' && <p role="status" className="text-[14px] text-success-ink">{t('saved')}</p>}
        {state === 'error' && <p role="alert" className="text-[14px] text-danger-ink">{ui('error')}</p>}
      </div>
    }>
      <div className="p-6 grid grid-cols-2 gap-4">
        <div className="col-span-2"><TextInput label={t('name')} value={c.name} onChange={(e) => patch({ name: e.target.value })} /></div>
        <Select label={t('idType')} value={c.idTypeId ?? ''} onChange={(e) => patch({ idTypeId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{ui('none')}</option>{idTypes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
        <TextInput label={t('vat')} value={c.vat} onChange={(e) => patch({ vat: e.target.value })} className="tabular" />
        <TextInput label={t('phone')} type="tel" value={c.phone} onChange={(e) => patch({ phone: e.target.value })} />
        <TextInput label={t('email')} type="email" value={c.email} onChange={(e) => patch({ email: e.target.value })} />
        <TextInput label={t('street')} value={c.street} onChange={(e) => patch({ street: e.target.value })} />
        <TextInput label={t('city')} value={c.city} onChange={(e) => patch({ city: e.target.value })} />
      </div>
    </Modal>
  )
}
