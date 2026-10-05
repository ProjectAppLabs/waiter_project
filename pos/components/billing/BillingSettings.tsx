'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { Button } from '@/components/ui/Button'
import { billingSettings, type BillingSettings as Settings } from '@/lib/services/invoices'

// La configuración contable de la facturación, de solo lectura. En el sistema propio la propina tiene un tratamiento
// fijo (pasivo para terceros, fuera de la base de impuestos); ya no hay cuenta que elegir como en la etapa con Odoo.
export function BillingSettings({ configId }: { configId: number }) {
  const t = useTranslations('admin.billing.settings')
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Settings | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!open) return
    let alive = true
    void billingSettings(configId).then((settings) => { if (alive) setData(settings) }).catch(() => { if (alive) setError(t('loadError')) })
    return () => { alive = false }
  }, [open, configId, attempt, t])
  return <>
    <Button size="compact" onClick={() => setOpen(true)}><Icon name="settings" size={18} />{t('title')}</Button>
    <Modal open={open} onClose={() => setOpen(false)} title={t('title')} size="medium">
      <div className="p-6 space-y-4 text-sm">
      {error && <p role="alert" className="text-danger-ink">{error}</p>}
      {!data && !error && <p className="text-soft">{t('loading')}</p>}
      {!data && error && <Button size="compact" onClick={() => { setError(''); setAttempt((n) => n + 1) }}>{t('retry')}</Button>}
      {data && <>
        <p className="text-soft">{data.company} · {data.currency} · {data.journal || t('noJournal')}</p>
        <p className="text-soft">{t('taxHint')}</p>
        {data.tipProduct ? <p className="text-ink">{t('tipTreatment', { account: data.tipAccount })}</p> : <p className="text-soft">{t('noTip')}</p>}
      </>}
      </div>
    </Modal>
  </>
}
