'use client'

import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TextInput } from '@/components/ui/Field'
import {
  KEY_NAMES, connectWompi, detectKeys, disconnectGateway, enableGateway, getPaymentGateways, otherEnvironmentKeys, requestAccess, verifyAccess,
  type CheckState, type ConnectResult, type GatewayChecks, type GatewayConfiguration, type GatewayEnvironment, type GatewaySettings, type KeyName,
} from '@/lib/services/paymentGateways'
import { cn } from '@/lib/utils'

const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)
const ENV: Record<GatewayEnvironment, { name: string; hint: string }> = {
  test: { name: 'Pruebas (sandbox)', hint: 'Sin dinero real. Verificamos todo con un pago de prueba.' },
  prod: { name: 'Producción', hint: 'Dinero real. La firma y los avisos se confirman con el primer pago.' },
}
const KEY_LABEL: Record<KeyName, string> = { public_key: 'Llave pública', private_key: 'Llave privada', events: 'Secreto de eventos', integrity: 'Secreto de integridad' }
const CHECKS: [keyof GatewayChecks, string][] = [['comercio', 'Comercio de Wompi'], ['llave_privada', 'Llave privada'], ['integridad', 'Firma de integridad'], ['eventos', 'Avisos de pago (eventos)']]
const STATE: Record<CheckState, { icon: string; text: string; tone: string }> = {
  ok: { icon: '✓', text: 'Verificado', tone: 'text-success-ink' },
  fallo: { icon: '✕', text: 'No pasó', tone: 'text-danger-ink' },
  pendiente: { icon: '…', text: 'Pendiente', tone: 'text-soft' },
}
const left = (until: number, now: number) => { const s = Math.max(0, Math.round((until - now) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

// Plan D · Pagos en línea con Wompi. Para entrar, el dueño recibe un código en su correo (un solo uso); el acceso dura 15
// minutos y sirve para un cambio. «Conectar Wompi» lleva al panel de Wompi, recibe las cuatro llaves pegadas de una vez
// (nunca se muestran: ni al pegarlas ni después) y las verifica con Wompi antes de guardarlas cifradas.
export function PaymentGatewayForm() {
  const [access, setAccess] = useState<{ token: string; until: number } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { if (!access) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [access])
  const expired = !!access && now >= access.until
  const [notice, setNotice] = useState('')
  const lock = (text = '') => { setAccess(null); setNotice(text) }
  return (
    <section className="border border-border rounded-lg p-5 max-w-3xl flex flex-col gap-4" aria-label="Pagos en línea con Wompi">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-md bg-canvas grid place-items-center"><Icon name="lock" size={20} /></span>
        <div className="flex-1"><h3 className="font-semibold text-lg">Pagos en línea · Wompi</h3>
          <p className="text-sm text-soft mt-1">Bancolombia, QR, Nequi y tarjetas desde el menú. Las llaves se guardan cifradas y nadie puede volver a verlas.</p></div>
      </div>
      {notice && <p role="status" className="text-sm rounded-md bg-canvas p-3">{notice}</p>}
      {!access || expired
        ? <AccessGate expired={expired} onOpen={(token, vence) => { setNotice(''); setNow(Date.now()); setAccess({ token, until: Date.parse(vence) }) }} />
        : <>
          <p className="text-sm text-soft flex items-center gap-2"><Icon name="lock" size={14} />Acceso abierto · vence en {left(access.until, now)} · sirve para un cambio</p>
          <Connection access={access.token} onDone={lock} />
        </>}
    </section>
  )
}

// Paso 1: el código al correo (6 dígitos, 10 minutos, un solo uso).
function AccessGate({ onOpen, expired }: { onOpen: (token: string, until: string) => void; expired: boolean }) {
  const [sent, setSent] = useState<string | null>(null), [code, setCode] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function send() {
    setBusy(true); setError('')
    try { const r = await requestAccess(); setSent(r.correo); setCode('') } catch (e) { setError(message(e, 'No pudimos enviar el código.')) } finally { setBusy(false) }
  }
  async function verify() {
    setBusy(true); setError('')
    try { const r = await verifyAccess(code.trim()); onOpen(r.acceso, r.vence) } catch (e) { setError(message(e, 'No pudimos revisar el código.')) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px]">{expired ? 'Tu acceso venció. ' : ''}Para ver o cambiar la conexión con Wompi te enviamos un código a tu correo. Sirve una sola vez.</p>
      {!sent ? <div><Button variant="primary" disabled={busy} onClick={() => void send()}>{busy ? 'Enviando…' : 'Enviarme el código'}</Button></div>
        : <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void verify() }}>
          <p className="text-sm text-soft">Te lo enviamos a <strong>{sent}</strong>. Vence en 10 minutos.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48"><TextInput label="Código de 6 dígitos" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
            <Button type="submit" variant="primary" disabled={busy || code.length !== 6}>{busy ? 'Revisando…' : 'Entrar'}</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void send()}>Enviar otro código</Button>
          </div>
        </form>}
      {error && <p role="alert" className="text-danger text-sm">{error}</p>}
    </div>
  )
}

function Checks({ checks }: { checks: GatewayChecks }) {
  return <ul className="grid gap-1 sm:grid-cols-2" aria-label="Verificación">
    {CHECKS.map(([key, label]) => { const s = STATE[checks[key] ?? 'pendiente']; return (
      <li key={key} className="flex items-center gap-2 text-[14px]"><span aria-hidden className={cn('w-5 text-center font-bold', s.tone)}>{s.icon}</span>
        <span>{label}</span><span className={cn('ml-auto text-[13px]', s.tone)}>{s.text}</span></li>) })}
  </ul>
}

// Paso 2: el estado de cada ambiente y el asistente para conectar.
function Connection({ access, onDone }: { access: string; onDone: (notice: string) => void }) {
  const [settings, setSettings] = useState<GatewaySettings | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [wizard, setWizard] = useState<GatewayEnvironment | null>(null)
  const [confirm, setConfirm] = useState<GatewayEnvironment | null>(null)
  useEffect(() => { let alive = true; getPaymentGateways(access).then((s) => { if (alive) setSettings(s) }).catch((e) => { if (alive) setError(message(e, 'No se pudo cargar la conexión.')) }); return () => { alive = false } }, [access])
  if (error && !settings) return <p role="alert" className="text-danger">{error}</p>
  if (!settings) return <p role="status" className="text-soft text-sm">Cargando la conexión…</p>
  async function change(run: () => Promise<unknown>, done: string) {
    setBusy(true); setError('')
    try { await run(); onDone(done) } catch (e) { setError(message(e, 'No se pudo hacer el cambio.')) } finally { setBusy(false) }
  }
  if (wizard) return <ConnectWizard access={access} environment={wizard} settings={settings} onCancel={() => setWizard(null)} onDone={onDone} />
  return (
    <div className="flex flex-col gap-4">
      {settings.configurations.map((c: GatewayConfiguration) => {
        const connected = !!c.public_key_hint
        return (
          <div key={c.environment} className="rounded-md border border-border p-4 flex flex-col gap-3" aria-label={ENV[c.environment].name}>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold flex-1">{ENV[c.environment].name}</h4>
              {c.enabled && <span className="text-[13px] font-semibold rounded-full bg-success-soft text-success-ink px-3 py-1">Activo en el menú</span>}
            </div>
            {connected ? <>
              <p className="text-[14px]">Conectado a <strong>{c.merchant_name || 'tu comercio de Wompi'}</strong> · llave pública <code>{c.public_key_hint}</code></p>
              <Checks checks={c.checks} />
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || (c.environment === 'prod' && !settings.live_available && !c.enabled)} onClick={() => void change(() => enableGateway(access, c.environment, !c.enabled), c.enabled ? 'Listo: se desactivó en el menú.' : 'Listo: ya se cobra en línea desde el menú.')}>
                  {c.enabled ? 'Desactivar en el menú' : 'Activar en el menú'}</Button>
                <Button variant="ghost" disabled={busy} onClick={() => setWizard(c.environment)}>Cambiar llaves</Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirm(c.environment)}>Desconectar</Button>
              </div>
            </> : <div className="flex flex-wrap items-center gap-3"><p className="text-[14px] text-soft flex-1">{ENV[c.environment].hint}</p>
              <Button variant="primary" disabled={busy} onClick={() => setWizard(c.environment)}>Conectar Wompi</Button></div>}
          </div>
        )
      })}
      {error && <p role="alert" className="text-danger text-sm">{error}</p>}
      <ConfirmDialog open={!!confirm} title="Desconectar Wompi" body="Se borran las llaves de este ambiente y el menú deja de cobrar en línea. Para volver, tendrás que conectarlo de nuevo."
        confirmLabel="Desconectar" cancelLabel="Cancelar" destructive onCancel={() => setConfirm(null)}
        onConfirm={() => { const env = confirm; setConfirm(null); if (env) void change(() => disconnectGateway(access, env), 'Listo: Wompi quedó desconectado en ese ambiente.') }} />
    </div>
  )
}

// El asistente: abrir el panel de Wompi, pegar la URL de eventos y pegar las llaves (que nunca se muestran).
function ConnectWizard({ access, environment, settings, onCancel, onDone }: {
  access: string; environment: GatewayEnvironment; settings: GatewaySettings; onCancel: () => void; onDone: (notice: string) => void
}) {
  const buffer = useRef('')
  const [found, setFound] = useState<Partial<Record<KeyName, true>>>({})
  const [manual, setManual] = useState(false), [typed, setTyped] = useState<Record<KeyName, string>>({ public_key: '', private_key: '', events: '', integrity: '' })
  const [enable, setEnable] = useState(environment === 'test' || settings.live_available)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<ConnectResult | null>(null)
  const [copied, setCopied] = useState(false)
  const webhook = settings.configurations.find((c) => c.environment === environment)?.webhook_url
  const manualText = KEY_NAMES.map((k) => typed[k].trim()).join('\n')
  const detected = manual ? Object.fromEntries(Object.keys(detectKeys(manualText, environment)).map((k) => [k, true])) as Partial<Record<KeyName, true>> : found
  const complete = KEY_NAMES.every((k) => detected[k])
  function paste(raw: string) {
    // Lo pegado se guarda solo en memoria y el campo queda vacío: las llaves nunca se ven en pantalla.
    buffer.current = `${buffer.current}\n${raw}`.slice(-4000)
    setFound(Object.fromEntries(Object.keys(detectKeys(buffer.current, environment)).map((k) => [k, true])))
    setError(otherEnvironmentKeys(raw, environment) && !Object.keys(detectKeys(raw, environment)).length
      ? `Esas llaves son de ${environment === 'test' ? 'producción' : 'pruebas'}. Pega las de ${ENV[environment].name.toLowerCase()}.` : '')
    setResult(null)
  }
  async function submit() {
    setBusy(true); setError(''); setResult(null)
    try {
      const r = await connectWompi(access, environment, manual ? manualText : buffer.current, enable)
      if (r.ok) { buffer.current = ''; onDone(`Listo: Wompi quedó conectado${r.merchant_name ? ` a ${r.merchant_name}` : ''}.${enable ? ' El menú ya cobra en línea.' : ''} Para otro cambio pide un código nuevo.`); return }
      setResult(r)
    } catch (e) { setError(message(e, 'No pudimos verificar las llaves.')) } finally { setBusy(false) }
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit() }} aria-label={`Conectar Wompi · ${ENV[environment].name}`}>
      <h4 className="font-semibold">Conectar Wompi · {ENV[environment].name}</h4>
      <ol className="flex flex-col gap-3 text-[15px] list-decimal pl-5">
        <li>Abre tu panel de Wompi y entra a <strong>Desarrolladores</strong>{environment === 'test' ? ' (modo de pruebas)' : ''}.
          <div className="mt-2"><a className="inline-flex items-center gap-2 h-11 px-4 rounded-md border border-border font-semibold" href="https://comercios.wompi.co/" target="_blank" rel="noreferrer">Abrir mi panel de Wompi ↗</a></div></li>
        <li>En «URL de eventos» de Wompi pega esta dirección:
          {webhook ? <div className="mt-2 flex flex-wrap items-center gap-2"><code className="rounded bg-canvas px-2 py-1 text-[13px] break-all">{webhook}</code>
            <Button type="button" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(webhook); setCopied(true) }}>{copied ? 'Copiada ✓' : 'Copiar'}</Button></div>
            : <p className="text-sm text-soft mt-1">Todavía no hay una dirección pública para este servidor; los avisos de pago se verifican cuando la haya.</p>}</li>
        <li>Copia tus cuatro llaves y pégalas aquí, todas juntas y en cualquier orden. No se mostrarán.</li>
      </ol>
      {!manual
        ? <label className="flex flex-col gap-1 text-[13px] font-medium text-soft">Pega tus llaves
          <textarea value="" readOnly={busy} rows={3} placeholder="Pega aquí (Ctrl+V)" aria-describedby="llaves-ayuda"
            className="rounded-md border border-dashed border-border bg-surface p-3 text-[15px] text-ink font-normal"
            onChange={() => undefined} onPaste={(e) => { e.preventDefault(); paste(e.clipboardData.getData('text')) }} />
          <span id="llaves-ayuda" className="font-normal text-dim">Por seguridad, lo pegado no aparece en pantalla.</span></label>
        : <div className="grid gap-3 sm:grid-cols-2">{KEY_NAMES.map((k) => <TextInput key={k} type="password" autoComplete="new-password" spellCheck={false} label={KEY_LABEL[k]}
            value={typed[k]} onChange={(e) => setTyped({ ...typed, [k]: e.target.value })} />)}</div>}
      <ul className="grid gap-1 sm:grid-cols-2" aria-label="Llaves recibidas">
        {KEY_NAMES.map((k) => <li key={k} className={cn('flex items-center gap-2 text-[14px]', detected[k] ? 'text-success-ink' : 'text-soft')}>
          <span aria-hidden className="w-5 text-center font-bold">{detected[k] ? '✓' : '○'}</span>{KEY_LABEL[k]}{detected[k] ? ' recibida' : ''}</li>)}
      </ul>
      <button type="button" className="self-start text-sm underline text-soft" onClick={() => { setManual(!manual); buffer.current = ''; setFound({}) }}>
        {manual ? 'Prefiero pegarlas todas juntas' : 'Prefiero escribirlas una por una'}</button>
      <label className="flex gap-2 items-center text-[15px]"><input type="checkbox" checked={enable} disabled={busy || (environment === 'prod' && !settings.live_available)} onChange={(e) => setEnable(e.target.checked)} />
        Activar en el menú cuando quede verificado</label>
      {environment === 'prod' && !settings.live_available && <p className="text-sm text-soft">Puedes conectar producción; los cobros reales se activan cuando ProjectApp habilite el servidor.</p>}
      {result && !result.ok && <div role="alert" className="rounded-md border border-danger p-3 flex flex-col gap-2"><p className="text-danger-ink font-semibold">{result.detail}</p><Checks checks={result.checks} /><p className="text-sm text-soft">No guardamos nada. Revisa las llaves y vuelve a intentarlo.</p></div>}
      {error && <p role="alert" className="text-danger text-sm">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" disabled={busy || !complete}>{busy ? 'Verificando con Wompi…' : 'Conectar y verificar'}</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => { buffer.current = ''; onCancel() }}>Cancelar</Button>
      </div>
    </form>
  )
}
