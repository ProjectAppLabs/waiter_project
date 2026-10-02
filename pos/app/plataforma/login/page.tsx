'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { LOGIN_INPUT, LoginFrame } from '@/components/account/LoginFrame'
import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { CoreError } from '@/lib/services/core/http'
import { platformActivate, platformRequestCode } from '@/lib/services/core/platform'
import { usePlatformStore } from '@/lib/stores/platformStore'
import { cn } from '@/lib/utils'

type View = 'main' | 'forgot' | 'code'
const invitedLogin = (): string | null => { try { return new URLSearchParams(window.location.search).get('codigo') } catch { return null } }

// Plan T0: la entrada de la gente de ProjectApp a su consola. El mismo inicio que el POS (usuario o correo y contraseña,
// «¿Olvidaste tu contraseña?» con código de un solo uso), contra el sistema propio.
export default function PlatformLoginPage() {
  const router = useRouter()
  const { user, hydrated, hydrate, login } = usePlatformStore()
  const [invited] = useState<string | null>(() => (typeof window === 'undefined' ? null : invitedLogin()))
  const [view, setView] = useState<View>(invited ? 'code' : 'main')
  const [email, setEmail] = useState(invited ?? '')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState(''), [newPassword, setNewPassword] = useState(''), [confirm, setConfirm] = useState('')
  const [failed, setFailed] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { void hydrate() }, [hydrate])
  useEffect(() => { if (hydrated && user) router.replace('/plataforma') }, [hydrated, user, router])

  const message = (e: unknown) => (e instanceof CoreError ? (e.code === 'invalid_credentials' ? 'Usuario, correo o contraseña incorrectos' : e.message) : 'No se pudo conectar con el servidor.')
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setFailed(null); setBusy(true)
    try { await login(email.trim(), password); router.replace('/plataforma') } catch (err) { setFailed(message(err)) } finally { setBusy(false) }
  }
  async function onRequest(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try { await platformRequestCode(email.trim()); setCode(''); setView('code'); setNotice('Si la cuenta existe, el código ya va en camino a su correo.') } finally { setBusy(false) }
  }
  async function onActivate(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirm) { setFailed('Las contraseñas no coinciden.'); return }
    setBusy(true); setFailed(null)
    try { await platformActivate(email.trim(), code, newPassword); await login(email.trim(), newPassword); router.replace('/plataforma') }
    catch (err) { setFailed(err instanceof CoreError && err.code === 'invalid_code' ? 'El código no es válido o venció. Pide uno nuevo.' : message(err)) }
    finally { setBusy(false) }
  }
  if (!hydrated) return <LoginFrame><p className="pt-20 text-dim">Cargando…</p></LoginFrame>
  const field = (label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="w-full flex flex-col gap-2 text-[15px] font-medium text-ink">{label}<input aria-label={label} className={LOGIN_INPUT} {...props} /></label>
  )
  return (
    <LoginFrame>
      {view === 'main' && (
        <form onSubmit={onSubmit} className="w-[440px] max-w-full flex flex-col items-center gap-4">
          <span className="text-[12px] font-bold uppercase tracking-widest text-primary">Plataforma de ProjectApp</span>
          <h1 className="text-[24px] font-semibold text-ink">Inicia sesión</h1>
          {field('Usuario o correo', { value: email, onChange: (e) => setEmail(e.target.value), autoComplete: 'username', autoCapitalize: 'none', spellCheck: false })}
          {field('Contraseña', { type: 'password', value: password, onChange: (e) => setPassword(e.target.value), autoComplete: 'current-password' })}
          {failed && <p role="alert" className="self-start text-danger-ink text-[14px]">{failed}</p>}
          <Button type="submit" variant="primary" className="w-full h-12 text-[17px]" disabled={busy || !email || !password}>Entrar</Button>
          <button type="button" onClick={() => { setView('forgot'); setFailed(null) }} className="text-[16px] font-semibold text-primary">¿Olvidaste tu contraseña?</button>
        </form>
      )}
      {view === 'forgot' && (
        <form onSubmit={onRequest} className="w-[440px] max-w-full flex flex-col gap-4">
          <span className="w-10 h-10 rounded-md border border-border grid place-items-center text-ink shadow-sm"><Icon name="lock" size={22} /></span>
          <div><h1 className="text-[24px] font-semibold text-ink">¿Olvidaste tu contraseña?</h1><p className="mt-1 text-[15px] text-dim">Te enviamos a tu correo un código de un solo uso. Vence en 30 minutos.</p></div>
          {field('Usuario o correo', { value: email, onChange: (e) => setEmail(e.target.value), autoComplete: 'username', autoCapitalize: 'none' })}
          <Button type="submit" variant="primary" className="w-full h-12 text-[17px]" disabled={busy || email.trim().length < 3}>Enviar código</Button>
          <button type="button" onClick={() => setView('main')} className="self-center text-[16px] font-semibold text-ink">Volver a iniciar sesión</button>
        </form>
      )}
      {view === 'code' && (
        <form onSubmit={onActivate} className="w-[440px] max-w-full flex flex-col gap-4">
          <span className="w-10 h-10 rounded-md border border-border grid place-items-center text-ink shadow-sm"><Icon name="fingerprint" size={22} /></span>
          <div><h1 className="text-[24px] font-semibold text-ink">Escribe el código</h1>
            <p className="mt-1 text-[15px] text-dim">{invited ? `Bienvenido, ${invited}. Escribe el código de tu invitación y elige tu contraseña.` : `Lo enviamos al correo de ${email.trim()}. Sirve una sola vez.`}</p></div>
          {notice && <p role="status" className="text-[14px] text-success-ink">{notice}</p>}
          {field('Código de 6 dígitos', { value: code, onChange: (e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6)), inputMode: 'numeric', autoComplete: 'one-time-code', className: cn(LOGIN_INPUT, 'font-mono tracking-[0.3em] text-xl') })}
          {field('Nueva contraseña (mínimo 8)', { type: 'password', value: newPassword, onChange: (e) => setNewPassword(e.target.value), autoComplete: 'new-password' })}
          {field('Repite la contraseña', { type: 'password', value: confirm, onChange: (e) => setConfirm(e.target.value), autoComplete: 'new-password' })}
          {failed && <p role="alert" className="text-danger-ink text-[14px]">{failed}</p>}
          <Button type="submit" variant="primary" className="w-full h-12 text-[17px]" disabled={busy || code.length !== 6 || newPassword.length < 8}>Guardar y entrar</Button>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[16px] font-semibold">
            <button type="button" onClick={() => void platformRequestCode(email.trim()).then(() => setNotice('Te enviamos un código nuevo; el anterior ya no sirve.'))} disabled={busy || email.trim().length < 3} className="text-primary disabled:opacity-40">Reenviar código</button>
            <button type="button" onClick={() => setView('main')} className="text-ink">Volver a iniciar sesión</button>
          </div>
        </form>
      )}
    </LoginFrame>
  )
}
