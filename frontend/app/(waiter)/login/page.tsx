'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { LOGIN_INPUT, LoginFrame } from '@/components/account/LoginFrame'
import { RestaurantPicker } from '@/components/account/RestaurantPicker'
import { Icon } from '@/components/kit/Icon'
import { Toggle } from '@/components/kit/Toggle'
import { Button } from '@/components/ui/Button'
import { homePath } from '@/lib/domain/navigation'
import { centralHost, destinationOrigin, here, isCentralHost, leaveTo, orgFromHost } from '@/lib/domain/tenant'
import { effectiveRole, isOwner } from '@/lib/domain/roles'
import { readLogoutReason, rememberLogoutReason, type GuardReason } from '@/lib/domain/sessionGuard'
import { useStored } from '@/lib/hooks/useStored'
import { universalActivate, universalLogin, universalRequestCode, universalVerify2fa, type AccessDestination } from '@/lib/services/core/access'
import { CoreError } from '@/lib/services/core/http'
import { ShiftDeniedError, useAuthStore } from '@/lib/stores/authStore'
import { usePlatformStore } from '@/lib/stores/platformStore'
import { cn } from '@/lib/utils'

const write = (key: string, value: string) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key) } catch { /* sin almacenamiento */ } }
type View = 'main' | 'forgot' | 'code' | 'twoFactor' | 'choose'
// La dirección de la pestaña no cambia sin recargar la página.
const unchanging = () => () => undefined
const param = (name: string): string | null => { try { return new URLSearchParams(window.location.search).get(name) } catch { return null } }
const badCode = (e: unknown) => e instanceof CoreError && e.code === 'invalid_code'
// Plan Y3: el desafío del doble factor ya no sirve (vencido o con cinco códigos malos): hay que volver a la contraseña.
const deadChallenge = (e: unknown) => e instanceof CoreError && ['challenge_expired', 'invalid_challenge', 'too_many_attempts'].includes(e.code)

export function loginError(error: unknown, tl: (key: string) => string): string {
  if (error instanceof ShiftDeniedError) return error.message
  // Plan T: el sistema propio responde con código y mensaje; la credencial mala se dice como siempre.
  if (error instanceof CoreError) return error.code === 'invalid_credentials' ? tl('failed') : error.code === 'unreachable' ? tl('unreachable') : error.message
  return tl('unreachable')
}

// Inicio de sesión universal: todos (meseros, cajeros, encargados, dueños y la gente de ProjectApp) entran por la
// dirección sin organización (waiter.projectapp.co/login). Allí el servidor busca la credencial en todas las
// organizaciones y en ProjectApp y entrega un pase de un solo uso por cada cuenta; con él se va a `/entrar` en el
// subdominio de la organización o en la consola, que lo cambia por la sesión de esa dirección.
// En el subdominio de una organización o en la consola, `/login` solo lleva a quien ya tiene sesión a su pantalla; a
// los demás los manda al inicio universal con el código de invitación y la organización de donde venían.
export default function LoginPage() {
  const t = useTranslations('account')
  const tl = useTranslations('pos.login')
  const roleLabel = useTranslations('pos.nav.roles')
  const router = useRouter()
  const { user, employee, session, restaurant, restaurants, hydrated, hydrate, chooseRestaurant } = useAuthStore()
  const platform = usePlatformStore()
  // null en el servidor, que no sabe en qué dirección se abrió la página.
  const central = useSyncExternalStore(unchanging, () => isCentralHost(here().host), () => null)
  const [invited] = useState<string | null>(() => (typeof window === 'undefined' ? null : param('codigo')))
  // La organización de donde venía la persona (su subdominio o el enlace de la invitación): si su cuenta está en
  // varias, entra directo a esa.
  const [orgHint] = useState<string | null>(() => (typeof window === 'undefined' ? null : param('org')))
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
  const [challenge, setChallenge] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [destinations, setDestinations] = useState<AccessDestination[]>([])
  // Ya se va a cambiar el pase: el botón sigue ocupado hasta que cargue la otra dirección.
  const leaving = useRef(false)

  useEffect(() => { void hydrate() }, [hydrate])
  const platformHydrate = platform.hydrate
  useEffect(() => { void platformHydrate() }, [platformHydrate])
  // Una persona de ProjectApp con su sesión viva vuelve a su consola.
  useEffect(() => { if (hydrated && platform.hydrated && platform.user && !user) router.replace('/platform') }, [hydrated, platform.hydrated, platform.user, user, router])
  // Si la sesión se cerró sola (inactividad o fin del turno) se explica. El subdominio lo pasa en `motivo` al mandar
  // al inicio universal, que está en otra dirección. Solo se pinta ya hidratado, en el navegador.
  const [closed, setClosed] = useState<GuardReason | null>(() => {
    if (typeof window === 'undefined') return null
    const motivo = param('motivo')
    return readLogoutReason() ?? (motivo === 'idle' || motivo === 'shift' ? motivo : null)
  })
  const owner = !!user && isOwner(user.role, employee?.role)
  const mustPick = !!user && !!employee && !owner && !restaurant && (restaurants?.length ?? 0) > 1
  // Con la persona ya dentro (recién entró o volvió a /login con su sesión viva), se la lleva a su sitio.
  useEffect(() => {
    if (!hydrated || !user || !employee || mustPick) return
    router.replace(owner ? '/organizacion' : homePath(effectiveRole(user.role, employee.role), session !== null))
  }, [hydrated, user, employee, mustPick, owner, session, router])
  // Sin sesión fuera del inicio universal: se va allá con lo que traiga la dirección (el código de la invitación).
  useEffect(() => {
    if (central !== false || !hydrated || !platform.hydrated || user || platform.user) return
    const { protocol, host } = here()
    const query = new URLSearchParams(window.location.search)
    const org = orgFromHost(host)
    if (org && !query.has('org')) query.set('org', org)
    const reason = readLogoutReason()
    if (reason) query.set('motivo', reason)
    const rest = query.toString()
    leaveTo(`${protocol}//${centralHost(host)}/login${rest ? `?${rest}` : ''}`, { replace: true })
  }, [central, hydrated, platform.hydrated, user, platform.user])

  // Se va a cambiar el pase a la dirección de su destino. El pase viaja en el fragmento (#), que el navegador no manda
  // al servidor: no queda en registros de acceso.
  function go(destination: AccessDestination) {
    if (destination.error) { setFailed(destination.error.message); setView('main'); return }
    if (destination.two_factor && destination.challenge) { setChallenge(destination.challenge); setOtp(''); setFailed(null); setView('twoFactor'); return }
    if (!destination.pass) return
    enter(destination.kind, destination.organization?.slug ?? null, destination.pass)
  }
  function enter(kind: AccessDestination['kind'], slug: string | null, pass: string) {
    leaving.current = true
    setBusy(true); rememberLogoutReason(null); setClosed(null)
    const origin = destinationOrigin(kind, slug, here(), process.env.NEXT_PUBLIC_DEFAULT_ORG || null)
    leaveTo(`${origin}/entrar#${new URLSearchParams({ pase: pass, destino: kind === 'platform' ? 'plataforma' : 'pos' })}`)
  }
  // Un solo destino (o el de la organización de donde venía): directo. Varios: se elige.
  function proceed(list: AccessDestination[]) {
    const usable = list.filter((d) => !d.error)
    const hinted = orgHint ? usable.find((d) => d.organization?.slug === orgHint) : undefined
    if (list.length === 1 || hinted || usable.length === 1) { go(hinted ?? usable[0] ?? list[0]); return }
    setDestinations(list); setFailed(null); setView('choose')
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFailed(null); setBusy(true)
    try {
      const list = await universalLogin(email.trim(), password)
      write('waiter.email', remember ? email.trim() : ''); setPassword('')
      proceed(list)
    }
    catch (e) { setFailed(loginError(e, tl)) }
    finally { if (!leaving.current) setBusy(false) }
  }
  // El servidor responde igual exista o no la cuenta: no revela quién tiene usuario. Si el usuario está en varias
  // organizaciones, a cada una le llega su código.
  const sendCode = () => universalRequestCode(email).catch(() => undefined)
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
      try { await universalActivate(email, code, newPassword) } catch (e) { if (badCode(e)) { setCodeState('invalid'); return } throw e }
      write('waiter.email', email.trim()); setView('main')
      proceed(await universalLogin(email.trim(), newPassword))
    } catch (e) {
      // El código sirvió pero entrar no: la contraseña ya quedó guardada, se explica en el inicio.
      setView('main'); setFailed(loginError(e, tl))
    } finally { if (!leaving.current) setBusy(false) }
  }
  async function onVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!challenge) return
    setFailed(null); setBusy(true)
    try { const pass = await universalVerify2fa(challenge, otp.trim()); setChallenge(null); enter('platform', null, pass); return }
    catch (e) {
      if (deadChallenge(e)) { setChallenge(null); setView('main'); setFailed(tl('twoFactor.expired')) }
      else setFailed(e instanceof CoreError && e.code === 'unreachable' ? tl('unreachable') : tl('twoFactor.invalid'))
    }
    setBusy(false)
  }
  const openForgot = () => { setView('forgot'); setCodeState('idle'); setFailed(null) }

  // Mientras se sabe si hay sesión (o se va al inicio universal) no se pinta el formulario.
  if (!hydrated || central === null || (!central && !user && !platform.user)) return <LoginFrame><p className="pt-20 text-dim">{t('employee.loading')}</p></LoginFrame>

  if (mustPick) {
    return (
      <LoginFrame>
        <RestaurantPicker restaurants={restaurants ?? []} onPick={(r) => { void chooseRestaurant({ id: r.id, name: r.name }) }} />
      </LoginFrame>
    )
  }

  return (
    <LoginFrame>
      {view === 'choose' ? (
        <div className="w-[440px] pt-6 flex flex-col gap-4">
          <div><h1 className="text-[24px] font-semibold text-ink">{tl('choose.title')}</h1><p className="mt-1 text-[15px] text-dim">{tl('choose.intro')}</p></div>
          <ul className="flex flex-col gap-3">
            {destinations.map((d, i) => {
              const title = d.kind === 'platform' ? tl('choose.platform') : d.organization?.name ?? ''
              const role = d.kind === 'platform'
                ? (d.role === 'admin' || d.role === 'operator' ? tl(`choose.platformRoles.${d.role}`) : d.role)
                : (['waiter', 'cashier', 'admin', 'owner'].includes(d.role) ? roleLabel(d.role as 'waiter') : d.role)
              return (
                <li key={`${d.kind}-${d.organization?.slug ?? i}`}>
                  <button type="button" onClick={() => go(d)} disabled={busy || !!d.error}
                    className="w-full flex items-center gap-4 rounded-md border border-border bg-surface px-4 py-3 text-left hover:border-primary disabled:opacity-60 disabled:hover:border-border">
                    <span className="w-10 h-10 rounded-md border border-border grid place-items-center text-ink shrink-0"><Icon name={d.kind === 'platform' ? 'lock' : 'store'} size={20} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[16px] font-semibold text-ink truncate">{title}</span>
                      <span className="block text-[14px] text-dim">{role}</span>
                      {d.error && <span className="block text-[13px] text-danger-ink">{d.error.message}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" onClick={() => { setDestinations([]); setView('main') }} className="self-center text-[16px] font-semibold text-ink">{t('terminal.back')}</button>
        </div>
      ) : view === 'twoFactor' ? (
        <form onSubmit={onVerify} className="w-[440px] pt-6 flex flex-col gap-4">
          <span className="w-10 h-10 rounded-md border border-border grid place-items-center text-ink shadow-sm"><Icon name="lock" size={22} /></span>
          <div><h1 className="mt-2 text-[24px] font-semibold text-ink">{tl('twoFactor.title')}</h1><p className="mt-1 text-[15px] text-dim">{tl('twoFactor.intro')}</p></div>
          <label className="flex flex-col gap-2 text-[15px] font-medium">{tl('twoFactor.code')}
            {/* Admite el código de 6 dígitos o uno de respaldo (letras, números y guion). */}
            <input aria-label={tl('twoFactor.code')} value={otp} onChange={(e) => setOtp(e.target.value.replace(/[^0-9A-Za-z-]/g, '').slice(0, 20))} inputMode="text" autoComplete="one-time-code" autoFocus className={cn(LOGIN_INPUT, 'font-mono tracking-[0.3em] text-xl')} /></label>
          {failed && <p role="alert" className="text-danger-ink text-[14px]">{failed}</p>}
          <Button type="submit" variant="primary" className="w-full h-12 text-[17px] font-semibold" disabled={busy || otp.trim().length < 6}>{tl('twoFactor.verify')}</Button>
          <button type="button" onClick={() => { setChallenge(null); setFailed(null); setView('main') }} className="self-center text-[16px] font-semibold text-ink">{t('terminal.back')}</button>
        </form>
      ) : view === 'forgot' ? (
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
