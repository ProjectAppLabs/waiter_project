'use client'

import { useEffect, useState } from 'react'

import { dinerHas } from '@/lib/domain/modules'
import { forgetAssistantMemory, getAssistantMemory, type AssistantMemory as Memory } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'

// Plan AS: el asistente recuerda gustos, favoritos y últimos pedidos para recomendar mejor. El comensal ve qué recuerda
// en este restaurante y lo puede borrar todo; las alergias salen de su cuenta y se cambian en «Información de mi cuenta».
export function AssistantMemory() {
  const { keys, entry, preview } = useDinerStore()
  const [memory, setMemory] = useState<Memory | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false)
  const active = !!keys && dinerHas(entry, 'asistente_menu')
  useEffect(() => {
    if (!active || !keys) return
    let alive = true
    Promise.resolve().then(() => getAssistantMemory(keys.rest, keys.venue)).then((m) => { if (alive && m) setMemory(m) }).catch(() => { if (alive) setError('No pudimos leer lo que recuerda el asistente') })
    return () => { alive = false }
  }, [active, keys])
  if (!active) return null
  const empty = !!memory && !memory.preferencias.length && !memory.favoritos.length && !memory.ultimos.length
  async function forget() {
    if (!keys) return
    setBusy(true); setError('')
    try { await forgetAssistantMemory(keys.rest, keys.venue); setMemory({ preferencias: [], favoritos: [], ultimos: [], alergias: memory?.alergias ?? [] }); setDone(true) }
    catch (e) { setError(e instanceof Error ? e.message : 'No pudimos borrarlo') } finally { setBusy(false) }
  }
  return <section className="sm-assistant-memory" aria-labelledby="sm-assistant-memory-title">
    <h2 id="sm-assistant-memory-title">Lo que el asistente recuerda de ti</h2>
    {!memory ? (error ? <p className="sm-error" role="alert">{error}</p> : <p role="status">Cargando…</p>) : <>
      {empty ? <p>{done ? 'Listo, el asistente ya no recuerda nada de ti en este restaurante.' : 'Todavía no recuerda nada. Aprende de lo que pides y de lo que le cuentas.'}</p> : <dl>
        {!!memory.preferencias.length && <><dt>Gustos</dt><dd>{memory.preferencias.map((p) => p.nombre).join(', ')}</dd></>}
        {!!memory.favoritos.length && <><dt>Favoritos</dt><dd>{memory.favoritos.map((p) => p.nombre).join(', ')}</dd></>}
        {!!memory.ultimos.length && <><dt>Últimos pedidos</dt><dd>{memory.ultimos.map((p) => p.nombre).join(', ')}</dd></>}
      </dl>}
      {!!memory.alergias.length && <p><strong>Alergias:</strong> {memory.alergias.join(', ')}. Las tiene en cuenta siempre; cámbialas en «Información de mi cuenta».</p>}
      {!empty && <button type="button" className="sm-secondary" disabled={busy || !!preview} onClick={() => void forget()}>{busy ? 'Borrando…' : 'Borrar lo que recuerda'}</button>}
      {error && <p className="sm-error" role="alert">{error}</p>}
    </>}
  </section>
}
