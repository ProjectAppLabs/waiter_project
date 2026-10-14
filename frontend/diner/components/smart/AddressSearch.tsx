'use client'

import { useRef, useState } from 'react'

import { searchAddress } from '@/lib/services/api'
import { NO_COVERAGE } from './zone'

export interface FoundAddress { texto: string; lat: number; lng: number }

// Plan D: la dirección se escribe completa y se busca una sola vez (cada búsqueda es una consulta a Google); el ajuste
// fino lo hace el cliente moviendo el mapa, que es gratis. Si hay varias coincidencias, escoge una sin otra consulta.
export function AddressSearch({ rest, value, onType, onPick, enabled, disabled = false }: {
  rest: string | null | undefined; value: string; onType: (text: string) => void; onPick: (found: FoundAddress) => void
  enabled: boolean; disabled?: boolean
}) {
  const [results, setResults] = useState<FoundAddress[]>([])
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const last = useRef('')
  async function search() {
    const text = value.trim()
    if (!rest || !enabled || busy) return
    if (text.length < 6) { setMessage('Escribe la dirección completa: calle, número y barrio.'); return }
    // La misma búsqueda no se repite: ya están sus resultados.
    if (text === last.current) return
    last.current = text
    setBusy(true); setMessage(''); setResults([])
    try {
      const { resultados: found, fueraDeCobertura } = (await searchAddress(rest, text)) ?? { resultados: [], fueraDeCobertura: false }
      if (found.length === 1) onPick(found[0])
      else if (found.length > 1) setResults(found)
      else if (fueraDeCobertura) setMessage(NO_COVERAGE)
      else setMessage('No encontramos esa dirección. Mueve el mapa hasta la puerta de la entrega.')
    } catch { setMessage('No pudimos buscar la dirección. Mueve el mapa hasta la puerta de la entrega.'); last.current = '' }
    finally { setBusy(false) }
  }
  return (
    <div className="sm-address-search">
      <div className="sm-address-row">
        <label className="sm-field"><span>Dirección</span>
          <input value={value} disabled={disabled} maxLength={200} autoComplete="street-address" enterKeyHint="search"
            placeholder={enabled ? 'Ej.: Calle 10 # 43-12, El Poblado' : 'Calle, número y barrio'}
            onChange={(e) => { onType(e.target.value); setResults([]); setMessage('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search() } }} /></label>
        {enabled && <button type="button" className="sm-secondary" disabled={disabled || busy || value.trim().length < 3} onClick={() => void search()}>{busy ? 'Buscando…' : 'Buscar'}</button>}
      </div>
      {results.length > 0 && <div role="group" aria-label="Escoge tu dirección" className="sm-address-results">
        <p className="sm-note">Encontramos varias. ¿Cuál es?</p>
        {results.map((r) => <button type="button" key={`${r.lat},${r.lng}`} disabled={disabled} onClick={() => { setResults([]); onPick(r) }}>{r.texto}</button>)}
      </div>}
      {message && <p className="sm-note" role="status">{message}</p>}
    </div>
  )
}
