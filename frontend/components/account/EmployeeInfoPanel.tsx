'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { EmployeeAvatar } from '@/components/account/EmployeeAvatar'
import { shiftLabel } from '@/lib/domain/employees'
import { getEmployeeProfile, type EmployeeProfile } from '@/lib/services/employees'

const NONE = '—'
const Field = ({ label, value }: { label: string; value: string | null }) => (
  <div className="flex flex-col gap-1"><dt className="text-[13px] font-semibold text-ink">{label}</dt><dd className="text-[14px] text-soft">{value || NONE}</dd></div>
)

export function EmployeeInfoPanel({ employeeId }: { employeeId: number | null }) {
  const t = useTranslations('account.settings.profile')
  const tr = useTranslations('pos.nav.roles')
  const te = useTranslations('account.employee')
  const [profile, setProfile] = useState<EmployeeProfile | null>(null)
  useEffect(() => {
    if (!employeeId) return
    let alive = true
    getEmployeeProfile(employeeId).then((p) => { if (alive) setProfile(p) }).catch(() => undefined)
    return () => { alive = false }
  }, [employeeId])

  if (!employeeId) return <p className="text-[15px] text-soft">{t('noEmployee')}</p>
  const joining = profile?.joiningDate ? new Date(profile.joiningDate + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : null
  const status = profile?.employmentStatus && t.has(`employmentStatusValue.${profile.employmentStatus}`)
    ? t(`employmentStatusValue.${profile.employmentStatus}`) : profile?.employmentStatus ?? null
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <EmployeeAvatar id={employeeId} name={profile?.name ?? ''} size={56} />
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] text-soft">{t('employeeId')}<span className="font-semibold text-ink">{profile?.code ?? NONE}</span></span>
            <span className="text-[17px] font-semibold text-ink">{profile?.name ?? ''}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[14px] text-soft">{t('shiftToday')}</span>
          <span className="text-[17px] font-semibold text-ink">{profile ? shiftLabel(profile.shift, te('noShift')) : NONE}</span>
        </div>
      </div>
      <section className="rounded-lg border border-border">
        <h3 className="h-11 px-4 flex items-center text-[16px] font-semibold text-ink border-b border-border">{t('heading')}</h3>
        <div className="m-3 rounded-md border border-border p-4">
          <h4 className="text-[16px] font-semibold text-ink">{t('personal')}</h4>
          <dl className="mt-4 grid grid-cols-3 gap-x-6 gap-y-4">
            <Field label={t('fullName')} value={profile?.name ?? null} />
            <Field label={t('phone')} value={profile?.phone ?? null} />
            <Field label={t('email')} value={profile?.email ?? null} />
            <Field label={t('address')} value={profile?.address ?? null} />
          </dl>
          <hr className="my-5 border-border" />
          <h4 className="text-[16px] font-semibold text-ink">{t('work')}</h4>
          <dl className="mt-4 grid grid-cols-3 gap-x-6 gap-y-4">
            <Field label={t('joiningDate')} value={joining} />
            <Field label={t('accessRole')} value={profile?.accessRole ? tr(profile.accessRole) : null} />
            <Field label={t('employmentStatus')} value={status} />
            <Field label={t('manager')} value={profile?.manager ?? null} />
          </dl>
        </div>
      </section>
    </div>
  )
}
