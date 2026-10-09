'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { StatusPill } from '@/components/kit/StatusPill'
import { Button } from '@/components/ui/Button'
import { CoreError } from '@/lib/services/core/http'
import { assistantStatus, assistantTags, liftRestriction, proposeTags, restrictedParticipants, saveTags, type AssistantParticipant, type AssistantStatus, type AssistantTags, type TaggedProduct } from '@/lib/services/core/assistant'
import { cn } from '@/lib/utils'

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'mañana')
const message = (e: unknown, fallback: string) => (e instanceof CoreError || e instanceof Error ? e.message || fallback : fallback)
const money = (value: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)
const CHANNEL = { menu: 'Menú', whatsapp: 'WhatsApp' } as const
const same = (a: string[], b: string[]) => a.length === b.length && a.every((t) => b.includes(t))

// Plan AS: el mismo asistente atiende el menú y WhatsApp. El dueño revisa las etiquetas con las que el asistente elige
// platos (el asistente no inventa: solo recomienda lo que está etiquetado), quita restricciones a clientes y ve si las
// claves de IA están puestas y cuánto se usó hoy.
export function AssistantView() {
  const [tags, setTags] = useState<AssistantTags | null>(null)
  const [people, setPeople] = useState<AssistantParticipant[]>([])
  const [status, setStatus] = useState<AssistantStatus | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [drafts, setDrafts] = useState<Record<number, string[]>>({})
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    try {
      const [t, p, s] = await Promise.all([assistantTags(), restrictedParticipants(), assistantStatus()])
      setTags(t); setPeople(p); setStatus(s)
    } catch (e) { setError(message(e, 'No se pudo leer el asistente.')) }
  }, [])
  useEffect(() => { void load() }, [load])

  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await task() } catch (e) { setError(message(e, 'No se pudo completar.')) } finally { setBusy(false) }
  }
  const replace = (product: TaggedProduct) => setTags((t) => (t ? { ...t, products: t.products.map((p) => (p.id === product.id ? product : p)) } : t))
  const shown = useMemo(() => (tags?.products ?? []).filter((p) => !pending || !p.reviewed), [tags, pending])

  if (!tags || !status) return error ? <p role="alert" className="text-danger">{error}</p> : <p role="status" className="text-soft">Leyendo el asistente…</p>
  const name = Object.fromEntries(tags.vocabulary.map((w) => [w.key, w.name]))
  const unreviewed = tags.products.filter((p) => !p.reviewed).length
  const toggle = (product: TaggedProduct, key: string) => {
    const current = drafts[product.id] ?? product.tags
    setDrafts((d) => ({ ...d, [product.id]: current.includes(key) ? current.filter((t) => t !== key) : [...current, key] }))
  }
  const save = (product: TaggedProduct) => run(async () => {
    const saved = await saveTags(product.id, drafts[product.id] ?? product.tags)
    replace(saved)
    setDrafts(({ [product.id]: _, ...rest }) => rest)
    setNotice(`«${saved.name}» quedó revisado.`)
  })
  const propose = () => run(async () => {
    const ids = tags.products.filter((p) => !p.reviewed).map((p) => p.id)
    const proposed = await proposeTags(ids.length ? ids : null)
    setTags((t) => (t ? { ...t, products: t.products.map((p) => proposed.find((q) => q.id === p.id) ?? p) } : t))
    setNotice(`La IA propuso etiquetas para ${proposed.length} ${proposed.length === 1 ? 'plato' : 'platos'}. Revísalas y márcalas como revisadas.`)
  })
  const lift = (person: AssistantParticipant) => run(async () => {
    await liftRestriction(person.id)
    setPeople((list) => list.filter((p) => p.id !== person.id))
    setNotice(`${person.name || 'El cliente'} puede volver a escribirle al asistente.`)
  })

  return (
    <section className="max-w-5xl flex flex-col gap-5">
      <div><h1 className="text-[26px] font-bold">Asistente</h1>
        <p className="mt-1 text-soft">El mismo asistente responde en el menú y en WhatsApp. Recomienda solo platos de tu carta según sus etiquetas, y los precios y la disponibilidad salen siempre de Waiter.</p></div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}

      <section aria-label="Estado" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border p-4 flex flex-col gap-2">
          <span className="text-[13px] text-soft">Comprensión (Jev)</span>
          <StatusPill tone={status.evaluator ? 'success' : 'neutral'}>{status.evaluator ? 'Activa' : 'Sin configurar'}</StatusPill>
        </div>
        <div className="rounded-lg border border-border p-4 flex flex-col gap-2">
          <span className="text-[13px] text-soft">Redacción (voz)</span>
          <StatusPill tone={status.voice ? 'success' : 'neutral'}>{status.voice ? 'Activa' : 'Sin configurar'}</StatusPill>
        </div>
        <div className="rounded-lg border border-border p-4 flex flex-col gap-1">
          <span className="text-[13px] text-soft">Hoy</span>
          <span className="text-[17px] font-semibold">{status.today.turns} {status.today.turns === 1 ? 'mensaje' : 'mensajes'}{status.limit ? ` de ${status.limit}` : ''}</span>
          <span className="text-[13px] text-soft">{status.today.model_turns} con IA · {money(status.today.cost)}</span>
        </div>
        {(!status.evaluator || !status.voice) && <p className="sm:col-span-3 text-[14px] rounded-md bg-progress-soft text-progress-ink p-3">Sin las claves de IA el asistente sigue atendiendo con respuestas fijas y botones. ProjectApp las activa por ti.</p>}
      </section>

      <section aria-label="Clientes restringidos" className="flex flex-col gap-3">
        <h2 className="text-[18px] font-semibold">Clientes restringidos</h2>
        <p className="text-[14px] text-soft">Antes de restringir, el asistente recuerda el tema y advierte. Mientras dura la restricción, el cliente solo puede usar los botones.</p>
        {people.length === 0 ? <p className="text-soft">Nadie está restringido.</p> : (
          <ul className="flex flex-col gap-2">{people.map((p) => (
            <li key={p.id} className="rounded-md border border-border p-3 flex flex-wrap items-center gap-3">
              <span className="flex-1 min-w-0"><span className="block font-semibold">{p.name || 'Cliente sin nombre'} · {CHANNEL[p.channel]}</span>
                <span className="block text-[14px] text-soft">{p.reason} · hasta {when(p.until)}</span></span>
              <StatusPill tone={p.standing === 'paused' ? 'danger' : 'progress'}>{p.standing === 'paused' ? 'Pausado' : 'Restringido'}</StatusPill>
              <Button disabled={busy} onClick={() => void lift(p)}>Quitar restricción</Button>
            </li>))}</ul>
        )}
      </section>

      <section aria-label="Etiquetas del catálogo" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[18px] font-semibold flex-1">Etiquetas del catálogo</h2>
          <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} />Solo sin revisar ({unreviewed})</label>
          <Button disabled={busy || !status.voice || unreviewed === 0} onClick={() => void propose()}><Icon name="sparkles" size={18} />Proponer con IA</Button>
        </div>
        {!status.voice && <p className="text-[13px] text-soft">«Proponer con IA» se activa cuando la redacción esté configurada. Mientras tanto puedes etiquetar a mano.</p>}
        {shown.length === 0 ? <p className="text-soft">{pending ? 'Todos los platos están revisados.' : 'Tu catálogo no tiene platos.'}</p> : (
          <ul className="flex flex-col gap-2">{shown.map((p) => {
            const current = drafts[p.id] ?? p.tags
            const dirty = !same(current, p.tags)
            return (
              <li key={p.id} aria-label={p.name} className="rounded-md border border-border p-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex-1 min-w-0 font-semibold">{p.name}</span>
                  {p.reviewed && !dirty ? <StatusPill tone="success">Revisado</StatusPill> : <StatusPill tone="progress">Sin revisar</StatusPill>}
                  <Button variant={dirty || !p.reviewed ? 'primary' : undefined} disabled={busy || (p.reviewed && !dirty)} onClick={() => void save(p)}>Marcar revisado</Button>
                </div>
                <div className="flex flex-wrap gap-2">{tags.vocabulary.map((w) => (
                  <button key={w.key} type="button" aria-pressed={current.includes(w.key)} onClick={() => toggle(p, w.key)}
                    className={cn('h-9 px-3 rounded-md border text-[14px] font-semibold', current.includes(w.key) ? 'bg-primary-soft border-primary/40 text-primary' : 'bg-surface border-border text-soft hover:bg-muted')}>
                    {name[w.key]}
                  </button>))}</div>
              </li>
            )
          })}</ul>
        )}
      </section>
    </section>
  )
}
