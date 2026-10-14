'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { WizardSteps } from '@/components/kit/WizardSteps'
import { FloorInfoForm, type FloorInfo } from '@/components/tables/FloorInfoForm'
import { LayoutArranger, type EditorTable } from '@/components/tables/LayoutArranger'
import { Button } from '@/components/ui/Button'
import { floorName, layoutSummary, nextFloorNumber, parseFloorName } from '@/lib/domain/tablesKit'
import { saveFloorLayout } from '@/lib/services/tables'
import { toast } from '@/lib/stores/toastStore'
import type { Floor } from '@/lib/types'

interface Props { open: boolean; onClose: () => void; floors: Floor[]; configId: number; onCreated: (floorId: number) => Promise<void>; save?: typeof saveFloorLayout }

// Wizard "Agregar plano" del kit (Table Setting/Add New Table/*.png): Información → Organizar plano → Mesas creadas.
export function FloorWizard({ open, onClose, floors, configId, onCreated, save = saveFloorLayout }: Props) {
  const t = useTranslations('tables.wizard')
  const [step, setStep] = useState(0)
  const [info, setInfo] = useState<FloorInfo>(() => ({ number: String(nextFloorNumber(floors)), type: 'indoor', background: undefined, preview: null }))
  const [tables, setTables] = useState<EditorTable[]>([])
  const [busy, setBusy] = useState(false)
  const [createdId, setCreatedId] = useState<number | null>(null)
  const name = floorName(info.number || String(nextFloorNumber(floors)), info.type)
  const summary = layoutSummary(tables)

  async function finish() {
    setBusy(true)
    try {
      const id = await save({ id: null, name, configId, background: info.background }, tables.map(({ id, number, seats, x, y, width, height }) => ({ id, number, seats, x, y, width, height })))
      setCreatedId(id); setStep(2)
    } catch { toast({ title: t('failed'), tone: 'danger' }) } finally { setBusy(false) }
  }
  async function goTables() { if (createdId !== null) await onCreated(createdId); onClose() }

  const steps = [t('steps.info'), t('steps.arrange'), t('steps.success')]
  return (
    <Modal open={open} onClose={step === 2 ? goTables : onClose} title={t('addTitle')} size="wide">
      <div className="h-full flex flex-col bg-canvas">
        <div className="shrink-0 py-3 flex justify-center"><WizardSteps steps={steps} current={step} /></div>
        <section className="flex-1 min-h-0 mx-2 mb-2 rounded-lg border border-border bg-surface flex flex-col overflow-hidden">
          {step === 0 && (<>
            <header className="h-14 px-4 border-b border-border flex items-center text-[18px] font-semibold text-ink">{t('steps.info')}</header>
            <div className="flex-1 min-h-0 overflow-auto flex flex-col"><FloorInfoForm value={info} onChange={setInfo} /></div>
            <footer className="px-4 py-3 border-t border-border"><Button variant="primary" onClick={() => setStep(1)} disabled={!info.number.trim()}>{t('next')}<Icon name="arrowRight" size={18} /></Button></footer>
          </>)}
          {step === 1 && (<>
            <header className="h-14 px-4 border-b border-border flex items-center gap-3 text-[18px] font-semibold text-ink">{t('steps.arrange')}<span className="h-7 px-2 rounded-sm bg-muted text-[13px] font-normal text-soft flex items-center">{t('arrangeMeta', { number: info.number || String(nextFloorNumber(floors)), type: t(info.type) })}</span></header>
            <LayoutArranger tables={tables} onChange={setTables} />
            <footer className="px-4 py-3 border-t border-border flex gap-3"><Button onClick={() => setStep(0)} disabled={busy}><Icon name="arrowLeft" size={18} />{t('back')}</Button><Button variant="primary" onClick={finish} disabled={busy || tables.length === 0}>{busy ? t('saving') : t('next')}<Icon name="arrowRight" size={18} /></Button></footer>
          </>)}
          {step === 2 && (
            <div className="flex-1 grid place-items-center p-6">
              <div className="w-[370px] flex flex-col items-center gap-4">
                <div className="w-full rounded-lg border border-border p-5 flex flex-col items-center gap-3 text-center">
                  <span className="w-20 h-20 rounded-full bg-primary text-primary-ink grid place-items-center"><Icon name="check" size={40} /></span>
                  <p className="text-[20px] font-semibold text-ink">{t('successTitle')}</p>
                  <p className="text-[14px] text-dim">{t('successBody')} <strong className="text-soft">{t('successMenu')}</strong></p>
                  <dl className="w-full rounded-sm bg-muted px-3 py-2 grid grid-cols-[1fr_auto] gap-y-1.5 text-[14px] text-soft" aria-label={t('successTitle')}>
                    <dt>{t('floor')}</dt><dd className="font-semibold text-ink">{parseFloorName(name).label}</dd>
                    <dt>{t('large')}</dt><dd className="font-semibold text-ink text-right">{summary.large}</dd>
                    <dt>{t('smallCount')}</dt><dd className="font-semibold text-ink text-right">{summary.small}</dd>
                    <dt>{t('total')}</dt><dd className="font-semibold text-ink text-right">{summary.total}</dd>
                  </dl>
                </div>
                <Button variant="primary" onClick={goTables}>{t('goTables')}</Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
