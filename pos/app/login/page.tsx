'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { LOGIN_INPUT, LoginFrame } from '@/components/account/LoginFrame'
import { RestaurantPicker } from '@/components/account/RestaurantPicker'
import { Icon } from '@/components/kit/Icon'
import { Toggle } from '@/components/kit/Toggle'
import { Button } from '@/components/ui/Button'
import { homePath } from '@/lib/domain/navigation'
import { currentOrg } from '@/lib/domain/tenant'
import { effectiveRole, isOwner } from '@/lib/domain/roles'
import { readLogoutReason, rememberLogoutReason, type GuardReason } from '@/lib/domain/sessionGuard'
import { useStored } from '@/lib/hooks/useStored'
import { activate, requestCode } from '@/lib/services/activation'
import { CoreError } from '@/lib/services/core/http'
import { platformActivate, platformRequestCode } from '@/lib/services/core/platform'
import { ShiftDeniedError, useAuthStore } from '@/lib/stores/authStore'
import { usePlatformStore } from '@/lib/stores/platformStore'
import { cn } from '@/lib/utils'

const write = (key: string, value: string) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key) } catch { /* sin almacenamiento */ } }
type View = 'main' | 'forgot' | 'code'
// El enlace de la invitación abre el inicio en «escribe el código» con el usuario puesto: /login?codigo=<usuario>.
const invitedLogin = (): string | null => { try { return new URLSearchParams(window.location.search).get('codigo') } catch { return null } }
// Un solo inicio para todos: las cuentas de los restaurantes y las de ProjectApp siguen separadas en el servidor (cada
// una con su sesión), pero se entra por aquí. Si el usuario no existe en la organización de esta dirección, se prueba
// como persona de ProjectApp; donde no hay organización (plataforma.…) solo se prueba ProjectApp.
const notInOrg = (e: unknown) => e instanceof CoreError && e.code === 'invalid_credentials'
const badCode = (e: unknown) => e instanceof CoreError && e.code === 'invalid_code'

export function loginError(error: unknown, tl: (key: string) => string): string {
  if (error instanceof ShiftDeniedError) return error.message
  // Plan T: el sistema propio responde con código y mensaje; la credencial mala se dice como siempre.
  if (error instanceof CoreError) return error.code === 'invalid_credentials' ? tl('failed') : error.code === 'unreachable' ? tl('unreachable') : error.message
  return tl('unreachable')
}

export default function LoginPage() {
  const t = useTranslations('account')
  const tl = useTranslations('pos.login')
  const router = useRouter()
  const { user, employee, session, restaurant, restaurants, hydrated, hydrate, login, chooseRestaurant } = useAuthStore()
  const platform = usePlatformStore()
  const [invited] = useState<string | null>(() => (typeof window === 'undefined' ? null : invitedLogin()))
  const [view, setView] = useState<View>(invited ? 'code' : 'main')
  const storedEmail = useStored('waiter.email')
  const [emailEdit, setEmailEdit] = useState<string | null>(invited)
  const email = emailEdit ?? storedEmail
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(true)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [codeState, setCodeState] = useState<'idle' | 'sent' | 'resent' | 'invalid' | 'mismatch'>('idle')

  useEffect(() => { void hydrate() }, [hydrate])
  const platformHydrate = platform.hydrate
  useEffect(() => { void platformHydrate() }, [platformHydrate])
  // Una persona de ProjectApp con su sesión viva vuelve a su consola.
  useEffect(() => { if (hydrated && platform.hydrated && platform.user && !user) router.replace('/plataforma') }, [hydrated, platform.hydrated, platform.user, user, router])
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
    try {
      let inOrg = false
      if (currentOrg()) {
        try { await login(email.trim(), password); inOrg = true } catch (e) { if (!notInOrg(e)) throw e }
      }
      if (!inOrg) await platform.login(email.trim(), password)
      write('waiter.email', remember ? email.trim() : ''); setPassword(''); rememberLogoutReason(null); setClosed(null)
      if (!inOrg) router.replace('/plataforma')
    }
    catch (e) { setFailed(loginError(e, tl)) }
    finally { setBusy(false) }
  }
  // El servidor responde igual exista o no la cuenta: no revela quién tiene usuario. Se pide a los dos lados: el código
  // solo llega de donde la cuenta exista.
  const sendCode = () => Promise.allSettled([currentOrg() ? requestCode(email) : Promise.resolve(), platformRequestCode(email.trim())])
  async function onRequest(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); try { await sendCode(); setCode(''); setView('code'); setCodeState('sent') } finally { setBusy(false) }
  }
  async function onResend() { setBusy(true); try { await sendCode(); setCodeState('resent') } finally { setBusy(false) } }
  async function onActivate(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirm) { setCodeState('mismatch'); return }
    setBusy(true)
    try {
      let side: 'org' | 'platform' | null = null
      if (currentOrg()) {
        try { if (await activate(email, code, newPassword)) side = 'org' } catch (e) { if (!badCode(e)) throw e }
      }
      if (!side) {
        try { await platformActivate(email.trim(), code, newPassword); side = 'platform' } catch (e) { if (!badCode(e)) throw e }
      }
      if (!side) { setCodeState('invalid'); return }
      write('waiter.email', email.trim()); setView('main')
      if (side === 'org') await login(email.trim(), newPassword)
      else { await platform.login(email.trim(), newPassword); router.replace('/plataforma') }
    } catch (e) {
      // El código sirvió pero entrar no (p. ej. fuera de su turno): la contraseña ya quedó guardada, se explica en el inicio.
      if (e instanceof ShiftDeniedError || (e instanceof CoreError && e.code !== 'invalid_code')) { setView('main'); setFailed(loginError(e, tl)) } else setCodeState('invalid')
    } finally { setBusy(false) }
  }
  const openForgot = () => { setView('forgot'); setCodeState('idle'); setFailed(null) }

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
      {view === 'forgot' ? (
        <form onSubmit={onRequest} className="w-[440px] pt-6 flex flex-col gap-4">
          <span className="w-10 h-10 rounded-md border border-border grid place-items-center text-ink shadow-sm"><Icon name="lock" size={22} /></span>
          <div><h1 className="mt-2 text-[24px] font-semibold text-ink">{t('terminal.forgot')}</h1><p className="mt-1 text-[15px] text-dim">{tl('code.intro')}</p></div>
          <label className="flex flex-col gap-2 text-[15px] font-medium">{tl('email')}
            <input aria-label={tl('email')} value={email} onChange={(e) => setEmailEdit(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} className={LOGIN_INPUT} /></label>
          <Button type="submit" variant="primary" className="w-full h-12 text-[17px] font-semibold" disabled={busy || email.trim().length < 3}>{tl('code.send')}</Button>
          <button type="button" onClick={() => setView('main')} className="self-center text-[16px] font-semibold text-ink">{t('terminal.back')}</button>
        </form>
      ) : view === 'code' ? (
        <form onSubmit={onActivate} className="w-[440px] pt-6 flex flex-col gap-4">
          <span className="w-10 h-10 rounded-md border border-border grid place-items-center text-ink shadow-sm"><Icon name="fingerprint" size={22} /></span>
          <div><h1 className="mt-2 text-[24px] font-semibold text-ink">{tl('code.title')}</h1>
            <p className="mt-1 text-[15px] text-dim">{invited ? tl('code.invited', { login: invited }) : tl('code.check', { login: email.trim() })}</p></div>
          {codeState === 'sent' && <p role="status" className="text-[14px] text-success-ink">{tl('code.sent')}</p>}
          {codeState === 'resent' && <p role="status" className="text-[14px] text-success-ink">{tl('code.resent')}</p>}
          <label className="flex flex-col gap-2 text-[15px] font-medium">{tl('code.code')}
            <input aria-label={tl('code.code')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className={cn(LOGIN_INPUT, 'font-mono tracking-[0.3em] text-xl')} /></label>
          <label className="flex flex-col gap-2 text-[15px] font-medium">{tl('code.newPassword')}
            <input aria-label={tl('code.newPassword')} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" className={LOGIN_INPUT} /></label>
          <label className="flex flex-col gap-2 text-[15px] font-medium">{tl('code.confirm')}
            <input aria-label={tl('code.confirm')} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={LOGIN_INPUT} /></label>
          {codeState === 'invalid' && <p role="alert" className="text-danger-ink text-[14px]">{tl('code.invalid')}</p>}
          {codeState === 'mismatch' && <p role="alert" className="text-danger-ink text-[14px]">{tl('code.mismatch')}</p>}
          <Button type="submit" variant="primary" className="w-full h-12 text-[17px] font-semibold" disabled={busy || code.length !== 6 || newPassword.length < 8}>{tl('code.activate')}</Button>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[16px] font-semibold">
            <button type="button" onClick={() => void onResend()} disabled={busy || email.trim().length < 3} className="text-primary disabled:opacity-40">{tl('code.resend')}</button>
            <button type="button" onClick={() => setView('main')} className="text-ink">{t('terminal.back')}</button>
          </div>
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
          <button type="button" onClick={openForgot} className="mt-6 text-[16px] font-semibold text-primary">{t('terminal.forgot')}</button>
        </form>
      )}
    </LoginFrame>
  )
}
