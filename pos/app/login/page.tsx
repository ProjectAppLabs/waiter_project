'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { EmployeeLogin } from '@/components/account/EmployeeLogin'
import { RestaurantPicker } from '@/components/account/RestaurantPicker'
import { ForgotPin, LOGIN_INPUT } from '@/components/account/ForgotPin'
import { LoginFrame } from '@/components/account/LoginFrame'
import { Icon } from '@/components/kit/Icon'
import { Toggle } from '@/components/kit/Toggle'
import { Button } from '@/components/ui/Button'
import { lockMinutesLeft } from '@/lib/domain/employees'
import { homePath } from '@/lib/domain/navigation'
import { effectiveRole, isOwner } from '@/lib/domain/roles'
import { activate, requestCode } from '@/lib/services/activation'
import { checkPin, forgotPin, listPosEmployees, type PosEmployee } from '@/lib/services/employees'
import { OdooError } from '@/lib/services/errors'
import { useAuthStore } from '@/lib/stores/authStore'
import { useStored } from '@/lib/hooks/useStored'
import { cn } from '@/lib/utils'

const write = (key: string, value: string) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key) } catch { /* sin almacenamiento */ } }
type View = 'main' | 'code' | 'forgot'

// Solo Odoo sabe si la credencial está mal (`AccessDenied`). Cualquier otro fallo —un turno caducado en la
// sesión, un permiso, la red— se dice tal cual: darlo por «contraseña incorrecta» manda a buscar donde no es.
function loginError(error: unknown, tl: (key: string) => string): string {
  if (error instanceof OdooError) {
    return error.odooType === 'odoo.exceptions.AccessDenied' || !error.message ? tl('failed') : error.message
  }
  return tl('unreachable')
}

// Dos fases con la composición del kit: (a) sin sesión de Odoo en el dispositivo, el terminal entra con
// correo y contraseña; (b) con sesión abierta, "Inicio de empleado": cada mesero elige su cuenta y valida su PIN.
export default function LoginPage() {
  const t = useTranslations('account')
  const tl = useTranslations('pos.login')
  const router = useRouter()
  const { user, session, restaurant, restaurants, hydrated, hydrate, login, startShift, chooseRestaurant } = useAuthStore()
  const [view, setView] = useState<View>('main')
  const [employees, setEmployees] = useState<PosEmployee[] | null>(null)
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
  // Plan O: la cuenta opera varios restaurantes y este dispositivo aún no tiene uno: se pregunta antes del PIN. El dueño
  // puede ir en cambio a la consola: marca su PIN (lo pide Odoo para guardar) y entra sin elegir restaurante.
  const [consoleIntent, setConsoleIntent] = useState(false)
  const mustPick = !!user && !restaurant && !consoleIntent && (restaurants?.length ?? 0) > 1
  useEffect(() => {
    if (!user || mustPick) return
    let alive = true
    listPosEmployees(consoleIntent ? null : restaurant?.id ?? session?.configId ?? null)
      .then((list) => { if (alive) setEmployees(consoleIntent ? list.filter((e) => e.role === 'owner') : list) }).catch(() => { if (alive) setEmployees([]) })
    return () => { alive = false }
  }, [user, session, restaurant, mustPick, consoleIntent])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFailed(null); setBusy(true)
    try { await login(email.trim(), password); write('waiter.email', remember ? email.trim() : ''); setView('main') }
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
      await login(email.trim(), newPassword); write('waiter.email', email.trim()); setView('main')
    } catch { setCodeState('invalid') } finally { setBusy(false) }
  }
  // El PIN se valida en el servidor (`waiter_check_pin`), que cuenta los fallos, bloquea diez minutos tras
  // cinco y abre la asistencia. Devuelve el mensaje de error, o null si el turno arrancó.
  async function onStart(employee: PosEmployee, pin: string): Promise<string | null> {
    const result = await checkPin(employee.id, pin).catch(() => null)
    if (!result) return t('employee.pinFailed')
    if (!result.ok) {
      if (result.reason === 'locked') return t('employee.locked', { minutes: lockMinutesLeft(result.lockedUntil) })
      if (result.reason === 'unknown') return t('employee.unknown')
      return result.attemptsLeft > 0 ? t('employee.wrongPinLeft', { left: result.attemptsLeft }) : t('employee.wrongPin')
    }
    await startShift(result.employee, result.attendanceId, result.token)
    router.push(consoleIntent && isOwner(user?.role, result.employee.role) ? '/organizacion' : homePath(effectiveRole(user?.role, result.employee.role), session !== null))
    return null
  }

  if (!hydrated) return <LoginFrame><p className="pt-20 text-dim">{t('employee.loading')}</p></LoginFrame>

  if (user && mustPick) {
    return (
      <LoginFrame>
        <RestaurantPicker restaurants={restaurants ?? []} owner={isOwner(user.role, null)}
          onPick={(r) => { setEmployees(null); void chooseRestaurant({ id: r.id, name: r.name }) }} onConsole={() => { setEmployees(null); setConsoleIntent(true) }} />
      </LoginFrame>
    )
  }

  if (user) {
    return (
      <LoginFrame>
        {view === 'forgot'
          ? <ForgotPin initialEmail={storedEmail} onRequest={async (e) => { await forgotPin(e) }} onBack={() => setView('main')} />
          : <EmployeeLogin employees={employees ?? []} loading={employees === null} onStart={onStart} onForgot={() => setView('forgot')} />}
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
            <span className="flex gap-2"><input aria-label={tl('email')} value={email} onChange={(e) => setEmailEdit(e.target.value)} type="email" autoComplete="username" className={cn(LOGIN_INPUT, 'flex-1')} /><Button type="button" onClick={onSendCode} disabled={busy || !email.includes('@')}>{tl('code.send')}</Button></span></label>
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
            <input aria-label={tl('email')} value={email} onChange={(e) => setEmailEdit(e.target.value)} autoComplete="username" className={LOGIN_INPUT} /></label>
          <label className="mt-4 w-full flex flex-col gap-2 text-[16px] font-medium text-ink">{tl('password')}
            <span className="flex items-center h-12 rounded-md border border-border bg-surface overflow-hidden focus-within:border-primary">
              <input aria-label={tl('password')} type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="flex-1 h-full px-4 text-[16px] bg-transparent text-ink focus:outline-none" />
              <button type="button" onClick={() => setShow((v) => !v)} className="h-full px-4 text-[14px] font-semibold text-soft border-l border-border">{show ? tl('hide') : tl('show')}</button>
            </span></label>
          <div className="mt-4 w-full flex items-center gap-3 text-[15px] text-ink"><Toggle checked={remember} onChange={setRemember} label={tl('remember')} /><span>{tl('remember')}</span></div>
          {failed && <p role="alert" className="mt-3 self-start text-danger-ink text-[14px]">{failed}</p>}
          <Button type="submit" variant="primary" className="mt-6 w-full h-12 text-[17px] font-semibold" disabled={busy || !email || !password}>{t('terminal.submit')}</Button>
          <button type="button" onClick={() => { setView('code'); setCodeState('idle') }} className="mt-6 text-[16px] font-semibold text-primary">{t('terminal.forgot')}</button>
        </form>
      )}
    </LoginFrame>
  )
}
