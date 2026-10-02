'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Toggle } from '@/components/kit/Toggle'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import type { Settings } from '@/lib/types'

type State = 'idle' | 'saving' | 'saved' | 'error'

export function useSaveState(): [State, (fn: () => Promise<void>) => Promise<void>] {
  const [state, setState] = useState<State>('idle')
  return [state, async (fn) => { setState('saving'); try { await fn(); setState('saved') } catch { setState('error') } }]
}

export function SaveBar({ state, onSave, disabled, error }: { state: State; onSave: () => void; disabled?: boolean; error?: string | null }) {
  const t = useTranslations('pos.settings')
  const ui = useTranslations('pos.ui')
  return (
    <div className="flex items-center gap-3 pt-2">
      <Button variant="primary" onClick={onSave} disabled={disabled || state === 'saving'}>{t('save')}</Button>
      {state === 'saved' && <span role="status" className="text-[15px] text-free-ink">{t('saved')}</span>}
      {state === 'error' && <span role="alert" className="text-[15px] text-busy-ink">{error || ui('error')}</span>}
    </div>
  )
}

// Lo que la sala puede hacer y el restaurante decide. Vive en los ajustes del restaurante y lo ven todas las tablets.
// Cobrar: apagado, el mesero sirve y el cajero elige la mesa en el plano y cobra, sin que nadie mande nada.
// Inventario: verlo lo hace cualquiera; crear, editar o borrar platos e ingredientes es otra cosa.
const PERMISSIONS = [
  { key: 'waiterCanCharge', text: 'charge' },
  { key: 'waiterCanEditInventory', text: 'inventory' },
] as const

export function WaiterPermissionsForm({ initial, onSave }: { initial: Settings; onSave: (s: Settings) => Promise<void> }) {
  const t = useTranslations('pos.settings')
  const [state, save] = useSaveState()
  const [values, setValues] = useState(initial)
  return (
    <div className="mb-6 rounded-md border border-border bg-canvas divide-y divide-border max-w-2xl">
      {PERMISSIONS.map(({ key, text }) => (
        <div key={key} className="p-4 flex items-start gap-4">
          <Toggle checked={values[key]} label={t(`${text}.label`)}
            onChange={(v) => { const next = { ...values, [key]: v }; setValues(next); void save(() => onSave(next)) }} />
          <div className="min-w-0 flex flex-col gap-1">
            <span className="text-[15px] font-semibold text-ink">{t(`${text}.label`)}</span>
            <span className="text-[14px] text-soft leading-relaxed">{values[key] ? t(`${text}.onHint`) : t(`${text}.offHint`)}</span>
          </div>
          <span className="ml-auto shrink-0">{state === 'saving' && <span className="text-[14px] text-soft">{t('saving')}</span>}</span>
        </div>
      ))}
    </div>
  )
}

// Umbrales y supuestos del ROI: números enteros/decimales que viven en los ajustes del restaurante y ven todas las tablets.
export function ThresholdsForm({ initial, section, onSave }: { initial: Settings; section: 'alerts' | 'roi'; onSave: (s: Settings) => Promise<void> }) {
  const t = useTranslations('pos.settings')
  const [s, setS] = useState(initial)
  const [state, save] = useSaveState()
  const num = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setS((v) => ({ ...v, [key]: Number(e.target.value) }))
  return (
    <div className="flex flex-col gap-4 max-w-md">
      {section === 'alerts' ? (
        <>
          <TextInput label={t('alerts.late')} type="number" min={1} value={s.alertLateMinutes} onChange={num('alertLateMinutes')} className="font-mono" />
          <TextInput label={t('alerts.bill')} type="number" min={1} value={s.alertBillMinutes} onChange={num('alertBillMinutes')} className="font-mono" />
        </>
      ) : (
        <>
          <TextInput label={t('roi.hourCost')} type="number" min={0} value={s.roiHourCost} onChange={num('roiHourCost')} className="font-mono" />
          <TextInput label={t('roi.minutes')} type="number" min={0} step="0.5" value={s.roiMinutesPerOrder} onChange={num('roiMinutesPerOrder')} className="font-mono" />
          <TextInput label={t('roi.baseline')} type="number" min={0} step="0.1" value={s.roiBaselineHoursPer100} onChange={num('roiBaselineHoursPer100')} className="font-mono" />
          <TextInput label={t('roi.monthly')} type="number" min={0} value={s.roiMonthlyCost} onChange={num('roiMonthlyCost')} className="font-mono" />
          <TextInput label={t('roi.start')} type="date" value={s.roiStartDate ?? ''} onChange={(e) => setS((v) => ({ ...v, roiStartDate: e.target.value || null }))} className="font-mono" />
        </>
      )}
      <SaveBar state={state} onSave={() => save(() => onSave(s))} />
    </div>
  )
}
