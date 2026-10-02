'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { CoreError } from '@/lib/services/core/http'
import { billingSettings, setTipAccount, type BillingSettings as Settings } from '@/lib/services/invoices'

export function BillingSettings({ configId, onSaved }: { configId: number; onSaved: () => void }) {
  const t = useTranslations('admin.billing.settings')
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Settings | null>(null)
  const [account, setAccount] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!open) return
    let alive = true
    void billingSettings(configId).then((settings) => {
      if (alive) { setData(settings); setAccount(settings.accounts.some((a) => a.id === settings.tipAccountId) ? String(settings.tipAccountId) : '') }
    }).catch(() => { if (alive) setError(t('loadError')) })
    return () => { alive = false }
  }, [open, configId, attempt, t])
  async function save() {
    if (!account || saving) return
    setSaving(true); setError(''); setSaved(false)
    try { setData(await setTipAccount(configId, Number(account))); setSaved(true); onSaved() }
    catch (e) { setError(e instanceof CoreError ? e.message : t('saveError')) }
    finally { setSaving(false) }
  }
  return <>
    <Button size="compact" onClick={() => setOpen(true)}><Icon name="settings" size={18} />{t('title')}</Button>
    <Modal open={open} onClose={() => { if (!saving) setOpen(false) }} title={t('title')} size="medium">
      <div className="p-6 space-y-4 text-sm">
      {error && <p role="alert" className="text-danger-ink">{error}</p>}
      {!data && !error && <p className="text-soft">{t('loading')}</p>}
      {!data && error && <Button size="compact" onClick={() => { setError(''); setAttempt((n) => n + 1) }}>{t('retry')}</Button>}
      {data && <>
        <p className="text-soft">{data.company} · {data.currency} · {data.journal || t('noJournal')}</p>
        <p className="text-soft">{t('taxHint')}</p>
        {data.tipProduct ? <>
          <p className="text-ink">{t('currentTip', { account: data.tipAccount || '—' })}</p>
          <div className="flex flex-wrap items-end gap-3"><label className="flex-1 min-w-64 space-y-1 block"><span className="font-semibold text-ink">{t('tipAccount')}</span><Select value={account} disabled={saving} onChange={(e) => { setAccount(e.target.value); setSaved(false) }}>
            <option value="">{t('chooseAccount')}</option>{data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select></label><Button size="compact" disabled={!account || saving || Number(account) === data.tipAccountId} onClick={save}>{t(saving ? 'saving' : 'save')}</Button></div>
          <p className="text-xs text-soft">{t('tipHint')}</p>
        </> : <p className="text-soft">{t('noTip')}</p>}
        {saved && <p role="status" className="text-success-ink">{t('saved')}</p>}
      </>}
      </div>
    </Modal>
  </>
}
