'use client'

import { useEffect, useId, useRef, useState } from 'react'

import { placeDetails, suggestAddresses, type AddressSuggestion } from '@/lib/services/api'

// Plan D: el campo de dirección con sugerencias mientras se escribe, como en las apps de transporte: arriba la calle
// y el número (o el lugar conocido), abajo el barrio y la ciudad. Escoger una lleva el mapa hasta allá. Con Google,
// cada búsqueda es una «sesión» (un token): las sugerencias no se cobran y solo se paga el lugar que se escoge.
export type PickedAddress = AddressSuggestion & { lat: number; lng: number }
const newSession = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`)

export function AddressAutocomplete({ rest, value, onType, onPick, enabled, disabled = false, placeholder }: {
  rest: string | null | undefined; value: string; onType: (text: string) => void; onPick: (s: PickedAddress) => void
  enabled: boolean; disabled?: boolean; placeholder?: string
}) {
  const id = useId()
  const [items, setItems] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1)
  const typing = useRef(false), session = useRef('')
  useEffect(() => {
    const text = value.trim()
    if (!enabled || !rest || !typing.current || text.length < 3) { setItems([]); return }
    let alive = true
    // Se espera a que haga una pausa: no se consulta en cada letra.
    const timer = setTimeout(() => {
      if (!session.current) session.current = newSession()
      Promise.resolve().then(() => suggestAddresses(rest, text, session.current)).then((found) => { if (alive) { setItems(found ?? []); setOpen(true); setActive(-1) } }).catch(() => { if (alive) setItems([]) })
    }, 350)
    return () => { alive = false; clearTimeout(timer) }
  }, [value, rest, enabled])
  async function pick(s: AddressSuggestion) {
    typing.current = false
    setOpen(false); setItems([])
    const token = session.current
    session.current = ''
    if (s.lat !== null && s.lng !== null) { onPick({ ...s, lat: s.lat, lng: s.lng }); return }
    if (!rest || !s.place_id) return
    try { const found = await placeDetails(rest, s.place_id, token); onPick({ ...s, lat: found.lat, lng: found.lng }) } catch { /* se sigue con el mapa */ }
  }
  const shown = open && items.length > 0
  return (
    <div className="sm-autocomplete">
      <label className="sm-field"><span>Dirección</span>
        <input value={value} disabled={disabled} maxLength={200} placeholder={placeholder} autoComplete="off"
          role="combobox" aria-expanded={shown} aria-controls={`${id}-lista`} aria-autocomplete="list" aria-activedescendant={shown && active >= 0 ? `${id}-${active}` : undefined}
          onChange={(e) => { typing.current = true; onType(e.target.value) }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!shown) return
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
            else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); void pick(items[active]) }
            else if (e.key === 'Escape') setOpen(false)
          }} /></label>
      {shown && <ul id={`${id}-lista`} role="listbox" aria-label="Direcciones sugeridas" className="sm-autocomplete-list">{items.map((s, i) => (
        <li key={s.place_id ?? `${s.titulo}-${s.lat}-${s.lng}`} id={`${id}-${i}`} role="option" aria-selected={i === active}
          onMouseDown={(e) => { e.preventDefault(); void pick(s) }}>
          <strong>{s.titulo}</strong>{s.detalle && <small>{s.detalle}</small>}
        </li>))}</ul>}
    </div>
  )
}
