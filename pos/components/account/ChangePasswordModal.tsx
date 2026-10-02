'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { LOGIN_INPUT } from '@/components/account/LoginFrame'
import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { Button } from '@/components/ui/Button'
import { CoreError } from '@/lib/services/core/http'
import { changePassword } from '@/lib/services/session'

const MIN_LENGTH = 8

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('account.settings.security')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const close = () => { setCurrent(''); setNext(''); setConfirm(''); setDone(false); setFailed(null); onClose() }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next !== confirm) { setFailed(t('mismatch')); return }
    setBusy(true); setFailed(null)
    try { await changePassword(current, next); setDone(true) }
    catch (error) {
      const denied = error instanceof CoreError && error.code === 'wrong_password'
      setFailed(denied ? t('wrongCurrent') : error instanceof CoreError && error.message ? error.message : t('failed'))
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <Modal open={open} onClose={close}>
        <div className="p-8 flex flex-col items-center text-center gap-4">
          <span className="w-20 h-20 rounded-full bg-primary text-primary-ink grid place-items-center"><Icon name="check" size={40} /></span>
          <p className="mt-2 text-[20px] font-semibold text-ink">{t('successTitle')}</p>
          <p className="text-[14px] text-soft">{t('successBody')}</p>
          <Button variant="primary" className="mt-2 w-full h-12 text-[17px]" onClick={close}>{t('ok')}</Button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal open={open} onClose={close} title={t('changePassword')}>
      <form onSubmit={submit} className="p-6 flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-[15px] font-medium">{t('current')}
          <input aria-label={t('current')} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className={LOGIN_INPUT} /></label>
        <label className="flex flex-col gap-2 text-[15px] font-medium">{t('next')}
          <input aria-label={t('next')} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" className={LOGIN_INPUT} /></label>
        <label className="flex flex-col gap-2 text-[15px] font-medium">{t('confirm')}
          <input aria-label={t('confirm')} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={LOGIN_INPUT} /></label>
        {failed && <p role="alert" className="text-[14px] text-danger-ink">{failed}</p>}
        <Button type="submit" variant="primary" className="w-full h-12 text-[17px]" disabled={busy || !current || next.length < MIN_LENGTH || !confirm}>{t('changePassword')}</Button>
      </form>
    </Modal>
  )
}
