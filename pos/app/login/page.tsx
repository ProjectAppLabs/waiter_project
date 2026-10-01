'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { RestaurantPicker } from '@/components/account/RestaurantPicker'
import { LOGIN_INPUT, LoginFrame } from '@/components/account/LoginFrame'
import { Icon } from '@/components/kit/Icon'
import { Toggle } from '@/components/kit/Toggle'
import { Button } from '@/components/ui/Button'
import { homePath } from '@/lib/domain/navigation'
import { effectiveRole, isOwner } from '@/lib/domain/roles'
import { readLogoutReason, rememberLogoutReason, type GuardReason } from '@/lib/domain/sessionGuard'
import { activate, requestCode } from '@/lib/services/activation'
import { OdooError } from '@/lib/services/errors'
import { ShiftDeniedError, useAuthStore } from '@/lib/stores/authStore'
import { useStored } from '@/lib/hooks/useStored'
import { cn } from '@/lib/utils'

const write = (key: string, value: string) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key) } catch { /* sin almacenamiento */ } }
type View = 'main' | 'code'
const GENERIC_DENIED = /^(access denied|acceso denegado)\.?$/i

// Odoo responde `AccessDenied` tanto por credencial mala como fuera del turno (plan P). El genérico se dice como
// «incorrectos»; el del horario trae su propio mensaje y se muestra tal cual. Cualquier otro fallo —un permiso, la red—
// se dice como es: darlo por «contraseña incorrecta» manda a buscar donde no es.
export function loginError(error: unknown, tl: (key: string) => string): string {
  if (error instanceof ShiftDeniedError) return error.message
  if (error instanceof OdooError) {
    if (error.odooType === 'odoo.exceptions.AccessDenied') return !error.message || GENERIC_DENIED.test(error.message.trim()) ? tl('failed') : error.message
    return error.message || tl('failed')
  }
  return tl('unreachable')
}

// Plan P: un solo inicio para todos. Cada persona entra con su usuario o su correo y su contraseña, y en el mismo paso
// abre su turno (`waiter_start_my_shift`). Luego va a su sitio: el dueño a la consola; el encargado de varios
// restaurantes elige uno; el resto, a su inicio por rol en su restaurante. Ya no hay cuenta del terminal ni PIN.
export default function LoginPage() {
  const t = useTranslations('account')
  const tl = useTranslations('pos.login')
  const router = useRouter()
  const { user, employee, session, restaurant, restaurants, hydrated, hydrate, login, chooseRestaurant } = useAuthStore()
  const [view, setView] = useState<View>('main')
  const storedEmail = useStored('waiter.email')
  const [emailEdit, setEmailEdit] = useState<string | null>(null)
  const email = emailEdit ?? storedEmail
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(true)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [codeState, setCodeState] = useState<'idle' | 'sent' | 'invalid' | 'mismatch'>('idle')

  useEffect(() => { void hydrate() }, [hydrate])
  // Si la sesión se cerró sola (inactividad o fin del turno) se explica. Solo se pinta ya hidratado, en el navegador.
  const [closed, setClosed] = useState<GuardReason | null>(() => (typeof window === 'undefined' ? null : readLogoutReason()))
  const owner = !!user && isOwner(user.role, employee?.role)
  const mustPick = !!user && !!employee && !owner && !restaurant && (restaurants?.length ?? 0) > 1
  // Con la persona ya dentro (recién entró o volvió a /login con su sesión viva), se la lleva a su sitio.
  useEffect(() => {
    if (!hydrated || !user || !employee || mustPick) return
    router.replace(owner ? '/organizacion' : homePath(effectiveRole(user.role, employee.role), session !== null))
  }, [hydrated, user, employee, mustPick, owner, session, router])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFailed(null); setBusy(true)
    try { await login(email.trim(), password); write('waiter.email', remember ? email.trim() : ''); setPassword(''); rememberLogoutReason(null); setClosed(null) }
    catch (e) { setFailed(loginError(e, tl)) }
    finally { setBusy(false) }
  }
  async function onSendCode() { setBusy(true); try { await requestCode(email); setCodeState('sent') } finally { setBusy(false) } }
  async function onActivate(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirm) { setCodeState('mismatch'); return }
    setBusy(true)
    try {
      const ok = await activate(email, code, newPassword)
      if (!ok) { setCodeState('invalid'); return }
      write('waiter.email', email.trim()); setView('main')
      await login(email.trim(), newPassword)
    } catch (e) {
      // El código sirvió pero entrar no (p. ej. fuera de su turno): la contraseña ya quedó guardada, se explica en el inicio.
      if (e instanceof ShiftDeniedError || e instanceof OdooError) { setView('main'); setFailed(loginError(e, tl)) } else setCodeState('invalid')
    } finally { setBusy(false) }
  }
  const openCode = () => { setView('code'); setCodeState('idle'); setFailed(null) }

  if (!hydrated) return <LoginFrame><p className="pt-20 text-dim">{t('employee.loading')}</p></LoginFrame>

  if (mustPick) {
    return (
      <LoginFrame>
        <RestaurantPicker restaurants={restaurants ?? []} onPick={(r) => { void chooseRestaurant({ id: r.id, name: r.name }) }} />
      </LoginFrame>
    )
  }

  return (
    <LoginFrame>
      {view === 'code' ? (
        <form onSubmit={onActivate} className="w-[440px] pt-6 flex flex-col gap-4">
          <span className="w-10 h-10 rounded-md border border-border grid place-items-center text-ink shadow-sm"><Icon name="fingerprint" size={22} /></span>
          <div><h1 className="mt-2 text-[24px] font-semibold text-ink">{t('terminal.codeTitle')}</h1><p className="mt-1 text-[15px] text-dim">{tl('code.intro')}</p></div>
          <label className="flex flex-col gap-2 text-[15px] font-medium">{tl('email')}
            <span className="flex gap-2"><input aria-label={tl('email')} value={email} onChange={(e) => setEmailEdit(e.target.value)} autoComplete="username" autoCapitalize="none" className={cn(LOGIN_INPUT, 'flex-1')} /><Button type="button" onClick={onSendCode} disabled={busy || email.trim().length < 3}>{tl('code.send')}</Button></span></label>
          {codeState === 'sent' && <p role="status" className="text-[14px] text-success-ink">{tl('code.sent')}</p>}
          <label className="flex flex-col gap-2 text-[15px] font-medium">{tl('code.code')}
            <input aria-label={tl('code.code')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" className={cn(LOGIN_INPUT, 'font-mono tracking-[0.3em] text-xl')} /></label>
          <label className="flex flex-col gap-2 text-[15px] font-medium">{tl('code.newPassword')}
            <input aria-label={tl('code.newPassword')} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" className={LOGIN_INPUT} /></label>
          <label className="flex flex-col gap-2 text-[15px] font-medium">{tl('code.confirm')}
            <input aria-label={tl('code.confirm')} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={LOGIN_INPUT} /></label>
          {codeState === 'invalid' && <p role="alert" className="text-danger-ink text-[14px]">{tl('code.invalid')}</p>}
          {codeState === 'mismatch' && <p role="alert" className="text-danger-ink text-[14px]">{tl('code.mismatch')}</p>}
          <Button type="submit" variant="primary" className="w-full h-12 text-[17px] font-semibold" disabled={busy || code.length !== 6 || newPassword.length < 8}>{tl('code.activate')}</Button>
          <button type="button" onClick={() => setView('main')} className="self-center text-[16px] font-semibold text-ink">{t('terminal.back')}</button>
        </form>
      ) : (
        <form onSubmit={onSubmit} className="w-[440px] flex flex-col items-center">
          <h1 className="text-[24px] font-semibold text-ink">{t('terminal.title')}</h1>
          <p className="mt-1 text-[16px] text-dim text-center">{t('terminal.subtitle')}</p>
          <label className="mt-8 w-full flex flex-col gap-2 text-[16px] font-medium text-ink">{tl('email')}
            <input aria-label={tl('email')} value={email} onChange={(e) => setEmailEdit(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} className={LOGIN_INPUT} /></label>
          <label className="mt-4 w-full flex flex-col gap-2 text-[16px] font-medium text-ink">{tl('password')}
            <span className="flex items-center h-12 rounded-md border border-border bg-surface overflow-hidden focus-within:border-primary">
              <input aria-label={tl('password')} type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="flex-1 h-full px-4 text-[16px] bg-transparent text-ink focus:outline-none" />
              <button type="button" onClick={() => setShow((v) => !v)} className="h-full px-4 text-[14px] font-semibold text-soft border-l border-border">{show ? tl('hide') : tl('show')}</button>
            </span></label>
          <div className="mt-4 w-full flex items-center gap-3 text-[15px] text-ink"><Toggle checked={remember} onChange={setRemember} label={tl('remember')} /><span>{tl('remember')}</span></div>
          {closed && !failed && <p role="status" className="mt-3 self-start text-soft text-[14px]">{t(closed === 'idle' ? 'guard.closedIdle' : 'guard.closedShift')}</p>}
          {failed && <p role="alert" className="mt-3 self-start text-danger-ink text-[14px]">{failed}</p>}
          <Button type="submit" variant="primary" className="mt-6 w-full h-12 text-[17px] font-semibold" disabled={busy || !email || !password}>{t('terminal.submit')}</Button>
          <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[16px] font-semibold text-primary">
            <button type="button" onClick={openCode}>{t('terminal.forgot')}</button>
            <button type="button" onClick={openCode}>{t('terminal.haveCode')}</button>
          </div>
        </form>
      )}
    </LoginFrame>
  )
}
