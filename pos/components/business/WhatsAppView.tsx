'use client'

import { useCallback, useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { StatusPill } from '@/components/kit/StatusPill'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TextInput } from '@/components/ui/Field'
import { CoreError } from '@/lib/services/core/http'
import { connectWhatsapp, disconnectWhatsapp, replyWhatsapp, sendWhatsappTest, whatsappConversation, whatsappOverview, type WaConversation, type WaOverview, type WaStatus } from '@/lib/services/core/whatsapp'
import { runEmbeddedSignup, type SignupMode } from '@/lib/whatsapp/embeddedSignup'

const STATUS: Record<WaStatus, string> = { received: 'Recibido', sent: 'Enviado', delivered: 'Entregado', read: 'Leído', failed: 'No se entregó' }
const TONE = { received: 'neutral', sent: 'neutral', delivered: 'info', read: 'success', failed: 'danger' } as const
const QUALITY: Record<string, string> = { GREEN: 'Alta', YELLOW: 'Media', RED: 'Baja' }
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
const message = (e: unknown, fallback: string) => (e instanceof CoreError || e instanceof Error ? e.message || fallback : fallback)

// Plan WA: el dueño conecta el WhatsApp de su negocio con el registro oficial de Meta (un botón), prueba el envío y ve
// las conversaciones. El asistente que responde llega en la segunda parte.
export function WhatsAppView() {
  const [data, setData] = useState<WaOverview | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [to, setTo] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const load = useCallback(() => whatsappOverview().then(setData).catch((e: unknown) => setError(message(e, 'No se pudo leer la conexión de WhatsApp.'))), [])
  useEffect(() => { void load() }, [load])
  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await task() } catch (e) { setError(message(e, 'No se pudo completar.')) } finally { setBusy(false) }
  }
  const connect = (mode: SignupMode) => run(async () => {
    if (!data?.signup) return
    const result = await runEmbeddedSignup(data.signup, mode)
    if (!result) { setNotice('Cerraste la ventana de Meta sin conectar el número.'); return }
    setData(await connectWhatsapp(result)); setNotice('¡Listo! Tu WhatsApp quedó conectado a Waiter.')
  })
  if (!data) return error ? <p role="alert" className="text-danger">{error}</p> : <p role="status" className="text-soft">Leyendo la conexión de WhatsApp…</p>
  const account = data.account?.status === 'connected' ? data.account : null
  return (
    <section className="max-w-5xl flex flex-col gap-5">
      <div><h1 className="text-[26px] font-bold">WhatsApp</h1>
        <p className="mt-1 text-soft">Conecta el número de WhatsApp Business de tu restaurante. Los mensajes de tus clientes llegan a Waiter y los avisos de tus pedidos salen desde tu número.</p></div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}

      <section aria-label="Conexión" className="rounded-lg border border-border p-5 flex flex-col gap-4">
        {account ? <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-11 h-11 rounded-md bg-success-soft text-success-ink grid place-items-center"><Icon name="chat" size={22} /></span>
            <div className="flex-1 min-w-0">
              <p className="text-[17px] font-semibold">{account.name || 'Tu negocio'} · {account.phone}</p>
              <p className="text-[14px] text-soft">Conectado {when(account.connected_at)}{account.quality ? ` · calidad ${QUALITY[account.quality] ?? account.quality}` : ''}</p>
            </div>
            <StatusPill tone="success">Conectado</StatusPill>
          </div>
          {account.test_number && <p className="text-[14px] rounded-md bg-progress-soft text-progress-ink p-3">Es el <strong>número de prueba</strong> de Meta: solo puede escribir a los números autorizados en la app de Meta.</p>}
          <div><Button disabled={busy} onClick={() => setLeaving(true)}>Desconectar</Button></div>
        </> : <>
          <p className="text-[15px]">Conectar toma unos minutos: inicias sesión con tu cuenta de Meta, eliges tu negocio, escribes el número y confirmas el código que te llega por SMS o llamada.</p>
          {data.signup ? <div className="flex flex-wrap gap-3">
            <Button variant="primary" disabled={busy} onClick={() => void connect('new_number')}><Icon name="chat" size={18} />Conectar WhatsApp</Button>
            <Button disabled={busy} onClick={() => void connect('business_app')}>Ya uso la app WhatsApp Business en mi celular</Button>
          </div> : <p className="text-[14px] rounded-md bg-progress-soft text-progress-ink p-3">La conexión con Meta todavía no está habilitada para Waiter. ProjectApp la activa cuando Meta apruebe la app; mientras tanto puedes usar el número de prueba.</p>}
          <p className="text-[13px] text-soft">Si ya usas WhatsApp Business en tu celular, elige la segunda opción: sigues usando la app y Waiter recibe los mismos mensajes. Un número de WhatsApp personal no se puede conectar.</p>
        </>}
      </section>

      {account && (
        <form aria-label="Mensaje de prueba" className="rounded-lg border border-border p-5 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await sendWhatsappTest(to.trim()); setNotice(`Mensaje de prueba enviado a ${to.trim()}.`); void load() }) }}>
          <div className="w-64"><TextInput label="Número de prueba" placeholder="300 123 4567" inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <Button type="submit" disabled={busy || to.replace(/\D/g, '').length < 10}><Icon name="send" size={18} />Enviar mensaje de prueba</Button>
          <p className="w-full text-[13px] text-soft">Se envía la plantilla de saludo de Meta. Para escribir texto libre, el cliente tiene que haberte escrito en las últimas 24 horas.</p>
        </form>
      )}

      <section aria-label="Conversaciones" className="flex flex-col gap-3">
        <h2 className="text-[18px] font-semibold">Conversaciones recientes</h2>
        {data.recent.length === 0 ? <p className="text-soft">Todavía no hay conversaciones.</p> : (
          <ul className="flex flex-col gap-2">{data.recent.map((c) => (
            <li key={c.id}><button type="button" onClick={() => setOpen(c.id)} className="w-full rounded-md border border-border p-3 flex items-center gap-3 text-left hover:bg-muted">
              <span className="flex-1 min-w-0"><span className="block font-semibold">{c.name || c.wa_id}</span>
                <span className="block text-[14px] text-soft truncate">{c.last_message ? `${c.last_message.direction === 'out' ? 'Tú: ' : ''}${c.last_message.text}` : '—'}</span></span>
              {c.last_message && <StatusPill tone={TONE[c.last_message.status]}>{STATUS[c.last_message.status]}</StatusPill>}
              <span className="text-[13px] text-soft whitespace-nowrap">{when(c.last_message?.at ?? null)}</span>
            </button></li>))}</ul>
        )}
      </section>

      {open !== null && <ConversationModal id={open} onClose={() => { setOpen(null); void load() }} />}
      <ConfirmDialog open={leaving} title="¿Desconectar WhatsApp?" destructive confirmLabel="Desconectar" cancelLabel="Cancelar"
        body="Waiter deja de recibir y enviar mensajes de tu número. Tu número y tus chats siguen en WhatsApp."
        onCancel={() => setLeaving(false)} onConfirm={() => { setLeaving(false); void run(async () => { setData(await disconnectWhatsapp()); setNotice('WhatsApp desconectado.') }) }} />
    </section>
  )
}

function ConversationModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [chat, setChat] = useState<WaConversation | null>(null)
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { let alive = true; whatsappConversation(id).then((c) => { if (alive) setChat(c) }).catch((e: unknown) => { if (alive) setError(message(e, 'No se pudo leer la conversación.')) }); return () => { alive = false } }, [id])
  async function reply() {
    setBusy(true); setError('')
    try { const { message: m } = await replyWhatsapp(id, text.trim()); setChat((c) => (c ? { ...c, messages: [...c.messages, m] } : c)); setText('') }
    catch (e) { setError(message(e, 'No se pudo enviar.')) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={chat ? chat.name || chat.wa_id : 'Conversación'} size="center">
      <div className="p-5 flex flex-col gap-3">
        {!chat ? (error ? <p role="alert" className="text-danger">{error}</p> : <p role="status" className="text-soft">Leyendo…</p>) : <>
          <ol aria-label="Mensajes" className="max-h-[50vh] overflow-y-auto flex flex-col gap-2">{chat.messages.map((m) => (
            <li key={m.id} className={m.direction === 'out' ? 'self-end max-w-[80%] rounded-md bg-primary-soft p-3' : 'self-start max-w-[80%] rounded-md bg-muted p-3'}>
              <p className="text-[15px] whitespace-pre-wrap">{m.template ? `Plantilla «${m.template}»` : m.text}</p>
              <p className="mt-1 text-[12px] text-soft">{when(m.at)}{m.direction === 'out' ? ` · ${STATUS[m.status]}` : ''}{m.error ? ` · ${m.error}` : ''}</p>
            </li>))}</ol>
          {error && <p role="alert" className="text-danger">{error}</p>}
          {chat.window_open ? (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void reply() }}>
              <input aria-label="Responder" value={text} onChange={(e) => setText(e.target.value)} maxLength={4096} placeholder="Escribe tu respuesta"
                className="flex-1 h-11 px-3 rounded-md border border-border bg-surface text-[15px]" />
              <Button type="submit" variant="primary" disabled={busy || !text.trim()}><Icon name="send" size={18} />Enviar</Button>
            </form>
          ) : <p className="text-[14px] text-soft">Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp solo permite escribirle con una plantilla aprobada.</p>}
        </>}
      </div>
    </Modal>
  )
}
