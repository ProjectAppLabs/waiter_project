'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { ChangePinModal } from '@/components/account/ChangePinModal'
import { EmployeeInfoPanel } from '@/components/account/EmployeeInfoPanel'
import { ShiftClock } from '@/components/account/ShiftClock'
import { Icon, type KitIcon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { Toggle } from '@/components/kit/Toggle'
import { Button } from '@/components/ui/Button'
import { THEME_MODES, type ThemeMode } from '@/lib/design/tokens'
import type { Role } from '@/lib/domain/roles'
import { useTheme } from '@/lib/hooks/useTheme'
import { getNotifyPrefs, setNotifyPrefs, type NotifyKey, type NotifyPrefs } from '@/lib/services/employees'
import { useAuthStore } from '@/lib/stores/authStore'
import { cn } from '@/lib/utils'

const TABS: [Tab, KitIcon][] = [['profile', 'user'], ['notifications', 'bell'], ['security', 'lock'], ['display', 'photo']]
type Tab = 'profile' | 'notifications' | 'security' | 'display'
const CHANNELS = ['kitchen', 'inventory', 'system'] as const
const MODES = ['popup', 'sound'] as const
const PANEL_TITLE: Record<Tab, string> = { profile: 'profile.heading', notifications: 'tabs.notifications', security: 'security.heading', display: 'display.heading' }

// Miniatura de cada modo de color (tarjetas "System / Light / Dark" del kit): barras del panel en claro, oscuro o partido.
function ModePreview({ mode }: { mode: ThemeMode }) {
  const pane = (dark: boolean) => (
    <span className={cn('flex-1 h-full p-2 flex flex-col gap-1.5', dark ? 'bg-[#131316]' : 'bg-white')}>
      {[0, 1, 2, 3].map((i) => <span key={i} className={cn('block h-2 rounded-full', dark ? 'bg-[#3F3F46]' : 'bg-[#E2E8F0]', i === 0 ? 'w-1/2' : 'w-full')} />)}
    </span>
  )
  return <span className="flex-1 flex rounded-sm border border-border overflow-hidden">{mode === 'dark' ? pane(true) : mode === 'light' ? pane(false) : <>{pane(false)}{pane(true)}</>}</span>
}

// Modal "Setting" del kit (10 – Account Setting/*.png): pestañas verticales, panel con cabecera, tarjeta
// "Tiempo" con el cronómetro del turno y "Cerrar sesión" (cierra la asistencia con `waiter_end_shift`;
// la sesión de Odoo del terminal sigue). Los seis avisos son `res.users.waiter_notify`.
export function SettingsModal({ open, onClose, onLogout }: { open: boolean; onClose: () => void; user: { name: string; role: Role }; restaurant?: string; onLogout: () => Promise<void> }) {
  const t = useTranslations('account.settings')
  const [tab, setTab] = useState<Tab>('profile')
  const [confirming, setConfirming] = useState(false)
  const [changingPin, setChangingPin] = useState(false)
  const { mode, setMode } = useTheme()
  const employee = useAuthStore((s) => s.employee)
  const uid = useAuthStore((s) => s.user?.uid ?? null)
  const [notify, setNotify] = useState<NotifyPrefs | null>(null)
  // Las preferencias son del usuario del terminal (res.users.waiter_notify): se leen al abrir el modal.
  useEffect(() => {
    if (!open || !uid) return
    let alive = true
    getNotifyPrefs(uid).then((p) => { if (alive) setNotify(p) }).catch(() => undefined)
    return () => { alive = false }
  }, [open, uid])
  const flip = (key: NotifyKey, v: boolean) => {
    setNotify((prev) => (prev ? { ...prev, [key]: v } : prev))
    if (uid) void setNotifyPrefs(uid, { [key]: v }).catch(() => undefined)
  }
  const on = (key: NotifyKey) => notify?.[key] ?? true

  return (
    <>
      <Modal open={open} onClose={onClose} title={t('title')} size="wide">
        <div className="h-full flex">
          <aside className="w-[200px] shrink-0 p-4 flex flex-col gap-1">
            <div role="tablist" aria-orientation="vertical" className="flex flex-col gap-1">
              {TABS.map(([key, icon]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                  className={cn('flex items-center gap-3 h-11 px-3 rounded-md text-[16px]', tab === key ? 'bg-surface border border-border text-ink font-semibold shadow-sm' : 'text-soft hover:bg-muted')}>
                  <Icon name={icon} size={20} /><span>{t(`tabs.${key}`)}</span>
                </button>
              ))}
            </div>
            {/* Pie de la columna: cuánto lleva el turno (desde que marcó el PIN) y cerrar sesión, con la misma forma que las
                pestañas (icono y texto en un renglón) para que no parezca otro tipo de control. */}
            <div className="mt-auto pt-3 border-t border-border flex flex-col gap-1">
              <div className="h-9 px-3 flex items-center justify-between gap-2 text-[13px] text-soft"><span className="whitespace-nowrap">{t('time')}</span><ShiftClock checkIn={employee?.checkIn ?? null} /></div>
              <button type="button" onClick={() => setConfirming(true)} className="flex items-center gap-3 h-11 px-3 rounded-md text-[16px] font-semibold text-danger-ink hover:bg-danger-soft">
                <Icon name="logout" size={20} /><span>{t('logout')}</span>
              </button>
            </div>
          </aside>
          <section className="flex-1 min-w-0 p-4 pl-0">
            <div className="h-full rounded-lg border border-border bg-surface flex flex-col overflow-hidden">
              <h2 className="h-14 px-5 flex items-center text-[17px] font-semibold text-ink border-b border-border shrink-0">{t(PANEL_TITLE[tab])}</h2>
              <div className="flex-1 min-h-0 overflow-auto p-5">
                {tab === 'profile' && <EmployeeInfoPanel employeeId={employee?.id ?? null} />}
                {tab === 'notifications' && CHANNELS.map((ch) => (
                  <div key={ch} className="pb-4 mb-4 last:mb-0 flex flex-col gap-3">
                    <div className="pb-3 border-b border-border"><p className="text-[16px] font-semibold text-ink">{t(`notify.${ch}.title`)}</p><p className="text-[13px] text-soft">{t(`notify.${ch}.body`)}</p></div>
                    {MODES.map((m) => (
                      <div key={m} className="flex items-center gap-4 text-[15px] text-ink">
                        <Toggle checked={on(`${ch}_${m}`)} onChange={(v) => flip(`${ch}_${m}`, v)} label={`${t(`notify.${ch}.title`)} ${t(`notify.${m}`)}`} /><span>{t(`notify.${m}`)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {tab === 'security' && (
                  <div className="flex items-center justify-between">
                    <div><p className="text-[16px] font-semibold text-ink">{t('security.pin')}</p><p className="text-[13px] text-soft">{t('security.pinBody')}</p></div>
                    <Button size="compact" disabled={!employee} onClick={() => setChangingPin(true)}>{t('security.changePin')}<Icon name="chevronRight" size={16} /></Button>
                  </div>
                )}
                {tab === 'display' && (
                  <div className="flex flex-col gap-5">
                    <div>
                      <p className="text-[16px] font-semibold text-ink">{t('display.colorMode')}</p><p className="text-[13px] text-soft mb-3">{t('display.colorModeBody')}</p>
                      <div role="radiogroup" aria-label={t('display.colorMode')} className="flex gap-4">
                        {THEME_MODES.map((m: ThemeMode) => (
                          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                            className={cn('w-[206px] h-[152px] rounded-md border-2 p-2 flex flex-col gap-2 bg-surface', mode === m ? 'border-primary' : 'border-border')}>
                            <ModePreview mode={m} />
                            <span className="flex items-center justify-between text-[13px] font-medium text-ink"><span>{t(`display.${m}`)}</span>
                              <span className={cn('w-4 h-4 rounded-full border-2 grid place-items-center', mode === m ? 'border-primary' : 'border-border')}>{mode === m && <span className="w-2 h-2 rounded-full bg-primary" />}</span></span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </Modal>
      {employee && <ChangePinModal open={changingPin} employeeId={employee.id} token={employee.token} onClose={() => setChangingPin(false)} />}
      <Modal open={confirming} onClose={() => setConfirming(false)} footer={
        <div className="flex gap-3"><Button className="flex-1 h-12" onClick={() => setConfirming(false)}>{t('logoutNo')}</Button><Button variant="primary" className="flex-1 h-12" onClick={() => { setConfirming(false); void onLogout() }}>{t('logoutYes')}</Button></div>
      }>
        <div className="p-8 text-center flex flex-col items-center gap-3">
          <span className="w-20 h-20 rounded-full bg-primary text-primary-ink grid place-items-center"><Icon name="check" size={40} /></span>
          <p className="mt-2 text-[20px] font-semibold text-ink">{t('logoutTitle')}</p><p className="text-[14px] text-soft">{t('logoutBody')}</p>
        </div>
      </Modal>
    </>
  )
}
