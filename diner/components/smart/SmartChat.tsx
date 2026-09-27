'use client'
/* eslint-disable @next/next/no-img-element -- Existing catalog photos. */

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatCop } from '@/lib/domain/cart'
import { pathFor } from '@/lib/domain/route'
import { addChatSelection, getChat, newChat, sendChat, type ChatTurn, type ChatSelection } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Entry } from '@/lib/types'
import { ChatReply, ChatCarousel } from './ChatReply'
import './smart-tokens.css'
import './smart-chat.css'

// crypto.randomUUID requires HTTPS; host-only development uses HTTP.
function messageId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function SmartChat({ entry, rest, venue, token }: { entry: Entry; rest: string; venue: string; token: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const sending = useRef(false)
  const pending = useRef<{ id: string; text: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const reading = useRef(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [unread, setUnread] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<ChatTurn[]>([])
  const [selections, setSelections] = useState<ChatSelection[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState<string | null>(null)
  const addingLock = useRef(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const preview = useDinerStore(s => s.preview)
  const ensureSession = useDinerStore(s => s.ensureSession)
  const categories = new Map(entry.carta.categorias.map(c => [c.id, c.nombre]))
  const dishes = new Map(entry.carta.categorias.flatMap(c => c.productos).map(p => [p.id, p]))
  const dishHref = (id: number) => pathFor(rest, venue, token, 'plato', id)

  useEffect(() => {
    if (!open || preview) return
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const session = await ensureSession()
        if (!session) throw new Error('No pudimos abrir tu conversación. Vuelve a intentarlo.')
        const result = await getChat(session.id)
        if (active) { setHistory(result.mensajes); setAvailable(result.disponible); setSelections(result.selecciones ?? []) }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'No pudimos cargar la conversación.') }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [open, preview, ensureSession])

  useEffect(() => {
    if (!open) return
    if (reading.current) { setUnread(true); return }
    const frame = requestAnimationFrame(() => {
      const element = log.current
      const target = element?.querySelector<HTMLElement>('.sm-chat-turn:last-of-type')
      if (element && target) element.scrollTo({top: target.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop - 12,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'})
    })
    return () => cancelAnimationFrame(frame)
  }, [fresh, draft, open])

  async function addSelection(turn: ChatTurn, product: number, quantity: number, note: string) {
    if (addingLock.current || resetting || preview) return
    addingLock.current = true
    const key = `${turn.id}/${product}`
    setAdding(key)
    setError('')
    try {
      const session = await ensureSession()
      if (!session) throw new Error('No pudimos abrir tu pedido.')
      const result = await addChatSelection(session.id, turn.id, product, quantity, note)
      useDinerStore.setState({cart: result.carrito})
      setSelections(result.selecciones)
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos añadir el plato. Inténtalo de nuevo.') }
    finally { addingLock.current = false; setAdding(null) }
  }

  async function startNew() {
    if (sending.current || addingLock.current || loading || preview) return
    sending.current = true
    setResetting(true)
    setError('')
    try {
      const session = await ensureSession()
      if (!session) throw new Error('No pudimos iniciar otra conversación.')
      const result = await newChat(session.id)
      setHistory([]); setSelections([]); setQuantities({}); setNotes({})
      setText(''); setDraft(''); setFresh(null); setUnread(false)
      setAvailable(result.disponible)
      pending.current = null
      reading.current = false
      log.current?.scrollTo({top: 0, behavior: 'instant'})
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos iniciar otra conversación. Inténtalo de nuevo.') }
    finally { sending.current = false; setResetting(false) }
  }

  function close() { dialog.current?.close(); setOpen(false); setFresh(null) }
  async function submit(event: FormEvent) {
    event.preventDefault()
    await send(text)
  }
  async function send(value: string) {
    const message = value.trim()
    if (!message || sending.current || loading || !available || preview) return
    sending.current = true
    setBusy(true)
    setDraft(message)
    reading.current = false
    setUnread(false)
    setError('')
    if (pending.current?.text !== message) pending.current = { id: messageId(), text: message }
    try {
      const session = await ensureSession()
      if (!session) throw new Error('No pudimos abrir tu conversación.')
      const turn = await sendChat(session.id, pending.current!.id, message)
      if (turn.carrito) useDinerStore.setState({cart: turn.carrito})
      if (turn.selecciones) setSelections(turn.selecciones)
      setFresh(turn.id)
      setHistory(old => [...old.filter(t => t.id !== turn.id), turn].slice(-30))
      pending.current = null
      setText('')
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos enviar el mensaje. Inténtalo de nuevo.') }
    finally { sending.current = false; setBusy(false); setDraft('') }
  }

  return <>
    <button className="sm-chat-launch" aria-label="Mi mesero" aria-haspopup="dialog" aria-expanded={open} aria-controls="waiter-chat"
      onClick={() => { dialog.current?.showModal(); setOpen(true) }}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2 2-6a8.5 8.5 0 1 1 18-4.5Z"/></svg><span>Mi mesero</span>
    </button>
    <dialog id="waiter-chat" className="sm-chat-dialog" ref={dialog} aria-labelledby="waiter-chat-title" onClose={() => setOpen(false)}>
      <header className="sm-chat-header"><div><h2 id="waiter-chat-title">Tu mesero virtual</h2><p>{entry.contexto.marca.nombre}</p></div><button type="button" aria-label="Cerrar conversación" onClick={close}>×</button></header>
      <div className="sm-chat-toolbar"><button type="button" onClick={() => void startNew()} disabled={busy || loading || resetting || !!adding || !!preview}><span aria-hidden="true">＋</span>{resetting ? 'Iniciando…' : 'Nueva conversación'}</button></div>
      <div className="sm-chat-log" role="log" aria-label="Conversación con tu mesero" aria-live="polite" ref={log} onWheel={() => { reading.current = true }} onTouchStart={() => { reading.current = true }} onKeyDown={e => { if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) reading.current = true }}>
        <div className="sm-chat-welcome"><h3>¿Qué se te antoja hoy?</h3><p>Cuéntame tus gustos y buscamos algo rico en el menú.</p></div>
        {history.map(turn => <div className="sm-chat-turn" data-current={turn.id === fresh} key={turn.id}>
          <p className="sm-chat-bubble sm-chat-user"><span className="sr-only">Tú: </span>{turn.mensaje}</p>
          <div className="sm-chat-bubble"><span className="sr-only">Mesero: </span><ChatReply text={turn.respuesta} animate={turn.id === fresh}>
            {Array.from(turn.lineas.reduce((groups, line) => {
              const dish = dishes.get(line.producto)
              const category = categories.get(dish?.categorias?.[0] ?? -1) ?? 'Sugerencias'
              groups.set(category, [...(groups.get(category) ?? []), line])
              return groups
            }, new Map<string, ChatTurn['lineas']>())).map(([category, lines]) => <ChatCarousel title={category} count={lines.length} key={category}>{lines.map(line => {
              const dish = dishes.get(line.producto)
              if (!dish) return null
              const key = `${turn.id}/${dish.id}`
              const selected = selections.some(s => s.message_id === turn.id && s.product_id === dish.id)
              const qty = quantities[key] ?? line.cantidad
              return <article className="sm-chat-product" key={line.producto}>
                <Link className="sm-chat-dish" href={dishHref(dish.id)} onClick={close}>
                  {dish.foto && <img src={dish.foto} alt=""/>}<span><strong>{dish.nombre}</strong><small>{formatCop(dish.precio)} · {dish.agotado ? 'Agotado por ahora' : 'Ver detalles'}</small></span><span aria-hidden="true">↗</span>
                </Link>
                {selected ? <div className="sm-chat-added" role="status">✓ Añadido a tu pedido<Link href={pathFor(rest, venue, token, 'pedido')} onClick={close}>Ver mi pedido →</Link></div> : <>
                  <div className="sm-chat-quantity"><span>Cantidad</span><button type="button" aria-label={`Menos ${dish.nombre}`} disabled={qty <= 1 || !!adding} onClick={() => setQuantities(q => ({...q, [key]: qty - 1}))}>−</button><output aria-label={`Cantidad de ${dish.nombre}`}>{qty}</output><button type="button" aria-label={`Más ${dish.nombre}`} disabled={qty >= 50 || !!adding} onClick={() => setQuantities(q => ({...q, [key]: qty + 1}))}>+</button></div>
                  <input className="sm-chat-note" aria-label={`Indicaciones para ${dish.nombre}`} placeholder="¿Alguna indicación? (opcional)" maxLength={200} value={notes[key] ?? line.nota ?? ''} disabled={!!adding} onChange={e => setNotes(n => ({...n, [key]: e.target.value}))}/>
                  <button className="sm-chat-add" disabled={dish.agotado || !!adding || resetting || !!preview} onClick={() => void addSelection(turn, dish.id, qty, notes[key] ?? line.nota ?? '')}>{adding === key ? 'Añadiendo…' : 'Añadir a mi pedido'}</button>
                </>}
              </article>
            })}</ChatCarousel>)}
            {!!turn.opciones?.length && <div className="sm-chat-choices" aria-label="Respuestas sugeridas">{turn.opciones.map(option => <button type="button" key={option} disabled={busy || loading || resetting || !available || !!preview} onClick={() => void send(option)}>{option}</button>)}<button type="button" disabled={busy || loading || resetting || !available || !!preview} onClick={() => { setText(''); input.current?.focus() }}>Otro · Escribir mi respuesta</button></div>}
            {turn.accion === 'humano' && <Link className="sm-chat-help" onClick={close} href={pathFor(rest, venue, token, 'ayuda')}>Ver opciones de ayuda →</Link>}
            </ChatReply>
          </div>
        </div>)}
        {draft && <div className="sm-chat-turn" data-current="true"><p className="sm-chat-bubble sm-chat-user">{draft}</p></div>}
        {(loading || busy) && <p className="sm-chat-status" role="status">{busy ? 'Tu mesero está pensando…' : 'Abriendo conversación…'}</p>}
      </div>
      <div className="sm-chat-compose">
        {unread && <button className="sm-chat-unread" onClick={() => { reading.current = false; setUnread(false); const element = log.current; const target = element?.querySelector<HTMLElement>('.sm-chat-turn:last-of-type'); if (element && target) element.scrollTo({top: target.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop - 12, behavior: 'smooth'}) }}>Leer respuesta nueva ↓</button>}
        {preview ? <p className="sm-chat-notice">Abre el menú del restaurante para conversar.</p> : available === false ? <p className="sm-chat-notice">El mesero virtual todavía no está disponible. Mientras tanto, puedes explorar nuestros platos.</p> : !history.length && !loading && <div className="sm-chat-suggestions">{['Quiero algo ligero', 'Tengo mucha hambre', 'Busco algo vegetariano'].map(s => <button key={s} disabled={busy} onClick={() => setText(s)}>{s}</button>)}</div>}
        {error && <p className="sm-chat-error" role="alert">{error}</p>}
        <form onSubmit={submit}><label className="sr-only" htmlFor="waiter-message">Tu mensaje</label><input ref={input} id="waiter-message" value={text} onChange={e => setText(e.target.value)} maxLength={4000} placeholder="Hoy tengo ganas de…" autoComplete="off" disabled={busy || loading || resetting || !available || !!preview}/><button type="submit" aria-label="Enviar mensaje" disabled={!text.trim() || busy || loading || resetting || !available || !!preview}>↑</button></form>
        <p className="sm-chat-caption">Asistente IA · Tú eliges y confirmas tu pedido</p>
      </div>
    </dialog>
  </>
}
