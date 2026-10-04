'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { disable2fa, enable2fa, setup2fa } from '@/lib/services/core/platform'
import { usePlatformStore } from '@/lib/stores/platformStore'

type Setup = { secret: string; otpauth_uri: string; qr: string }
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

// Plan Y3: el doble factor de la persona de ProjectApp. Activar: QR (o el secreto a mano) y un código de la app; se
// muestran una sola vez diez códigos de respaldo. Desactivar pide un código.
export function SecurityView() {
  const user = usePlatformStore((s) => s.user)
  const hydrate = usePlatformStore((s) => s.hydrate)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const run = async (task: () => Promise<void>, fallback: string) => {
    setBusy(true); setError(''); setNotice('')
    try { await task() } catch (e) { setError(message(e, fallback)) } finally { setBusy(false) }
  }
  const start = () => run(async () => { setSetup(await setup2fa()); setCode('') }, 'No se pudo preparar el doble factor.')
  const enable = () => run(async () => { const r = await enable2fa(code.trim()); setRecovery(r.recovery_codes); setSetup(null); setCode(''); await hydrate() }, 'El código no es válido.')
  const disable = () => run(async () => { await disable2fa(code.trim()); setCode(''); setNotice('Doble factor desactivado.'); await hydrate() }, 'El código no es válido.')
  const on = !!user?.two_factor
  return (
    <section className="max-w-3xl flex flex-col gap-5">
      <div><h1 className="text-[26px] font-bold">Seguridad</h1>
        <p className="mt-1 text-soft">El doble factor pide, además de la contraseña, un código de una app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password…).</p></div>
      {user?.two_factor_required && !on && <p role="alert" className="rounded-md border border-border bg-progress-soft text-progress-ink p-4 text-[15px]">Tu cuenta debe tener doble factor. Actívalo para usar el resto de la consola.</p>}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      {recovery ? (
        <section aria-label="Códigos de respaldo" className="rounded-lg border border-border p-5 flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold">Doble factor activado</h2>
          <p className="text-[15px]">Guarda estos códigos de respaldo en un lugar seguro. Cada uno sirve una sola vez si pierdes el teléfono. <strong>No se vuelven a mostrar.</strong></p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-[16px]">{recovery.map((c) => <li key={c} className="rounded-md bg-muted px-3 py-2">{c}</li>)}</ul>
          <div className="flex gap-3">
            <Button onClick={() => void navigator.clipboard?.writeText(recovery.join('\n'))}>Copiar códigos</Button>
            <Button variant="primary" onClick={() => setRecovery(null)}>Ya los guardé</Button>
          </div>
        </section>
      ) : on ? (
        <section aria-label="Doble factor" className="rounded-lg border border-border p-5 flex flex-col gap-4">
          <p className="text-[15px]"><strong>Doble factor activo.</strong> Al entrar te pedimos el código de tu app.</p>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void disable() }}>
            <div className="w-56"><TextInput label="Código para desactivar" value={code} inputMode="numeric" autoComplete="one-time-code" onChange={(e) => setCode(e.target.value.trim())} /></div>
            <Button type="submit" variant="destructive" disabled={busy || code.length < 6}>Desactivar doble factor</Button>
          </form>
          {user?.two_factor_required && <p className="text-[14px] text-soft">Tu cuenta debe tenerlo: si lo desactivas, solo podrás abrir esta página hasta activarlo de nuevo.</p>}
        </section>
      ) : setup ? (
        <section aria-label="Activar doble factor" className="rounded-lg border border-border p-5 flex flex-col gap-4">
          <ol className="list-decimal pl-5 text-[15px] flex flex-col gap-1">
            <li>Abre tu app de autenticación y escanea el código QR.</li>
            <li>Escribe el código de 6 dígitos que muestra la app.</li>
          </ol>
          {/* eslint-disable-next-line @next/next/no-img-element -- el QR llega como data URI del servidor */}
          <img src={setup.qr} alt="Código QR para la app de autenticación" width={200} height={200} className="rounded-md border border-border bg-white p-2" />
          <p className="text-[14px] text-soft">¿No puedes escanearlo? Escribe esta clave en la app: <code className="font-mono text-ink break-all">{setup.secret}</code></p>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void enable() }}>
            <div className="w-56"><TextInput label="Código de la app" value={code} inputMode="numeric" autoComplete="one-time-code" onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></div>
            <Button type="submit" variant="primary" disabled={busy || code.length !== 6}>Activar</Button>
            <Button onClick={() => setSetup(null)}>Cancelar</Button>
          </form>
        </section>
      ) : (
        <Button variant="primary" className="self-start" disabled={busy} onClick={() => void start()}>Activar doble factor</Button>
      )}
    </section>
  )
}
