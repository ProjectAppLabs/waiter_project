'use client'

import { useEffect, useState } from 'react'

import { deleteAddress, revokeData, savedAddresses } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { SavedAddress } from '@/lib/types'

// Plan D: las direcciones que el comensal autorizó guardar, para borrarlas una a una o retirar la autorización
// (Ley 1581 de 2012). Los pedidos hechos se conservan por obligación contable.
export function SavedAddresses() {
  const { keys, preview } = useDinerStore()
  const [list, setList] = useState<SavedAddress[] | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [revoked, setRevoked] = useState(false)
  useEffect(() => {
    if (!keys) return
    let alive = true
    Promise.resolve().then(() => savedAddresses(keys.rest)).then((l) => { if (alive && l) setList(l) }).catch(() => { if (alive) setList([]) })
    return () => { alive = false }
  }, [keys])
  if (!keys || !list || (!list.length && !revoked)) return null
  async function run(task: () => Promise<void>) {
    setBusy(true); setError('')
    try { await task() } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos completar la solicitud') } finally { setBusy(false) }
  }
  return <section className="sm-assistant-memory" aria-labelledby="sm-addresses-title">
    <h2 id="sm-addresses-title">Mis direcciones</h2>
    {revoked ? <p>Listo: retiraste la autorización y borramos tus direcciones.</p> : <>
      <ul className="sm-delivery-results">{list.map((a) => (
        <li key={a.id}><p><strong>{a.etiqueta || 'Dirección'}</strong> · {a.direccion}{a.indicaciones ? ` (${a.indicaciones})` : ''}</p>
          <button type="button" className="sm-text-button" disabled={busy || !!preview} onClick={() => void run(async () => { await deleteAddress(keys.rest, a.id); setList((l) => (l ?? []).filter((x) => x.id !== a.id)) })}>Borrar</button></li>))}</ul>
      <button type="button" className="sm-secondary" disabled={busy || !!preview} onClick={() => void run(async () => { await revokeData(keys.rest); setList([]); setRevoked(true) })}>Retirar la autorización de mis datos</button>
    </>}
    {error && <p className="sm-error" role="alert">{error}</p>}
  </section>
}
