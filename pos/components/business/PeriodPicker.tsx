'use client'

import { useState } from 'react'

import { Chip } from '@/components/kit/Chip'
import { presetSpan, validSpan, type DateSpan, type PeriodPreset } from '@/lib/domain/business'

const PRESETS: [PeriodPreset, string][] = [['today', 'Hoy'], ['week', 'Esta semana'], ['month', 'Este mes'], ['lastMonth', 'Mes pasado']]
const DATE = 'h-11 px-3 rounded-md border border-border bg-surface text-[15px] text-ink'

// Periodo de las vistas del negocio: los atajos de siempre o un rango. Mientras el rango esté a medio escribir no se
// consulta nada (onChange solo recibe rangos válidos).
export function PeriodPicker({ onChange, initial = 'month' }: { onChange: (span: DateSpan) => void; initial?: PeriodPreset }) {
  const [preset, setPreset] = useState<PeriodPreset | 'range'>(initial)
  const [range, setRange] = useState<DateSpan>(() => presetSpan(initial))
  const pick = (p: PeriodPreset) => { setPreset(p); const span = presetSpan(p); setRange(span); onChange(span) }
  const edit = (next: DateSpan) => { setPreset('range'); setRange(next); if (validSpan(next)) onChange(next) }
  return (
    <div role="group" aria-label="Periodo" className="flex flex-wrap items-center gap-2">
      {PRESETS.map(([p, label]) => <Chip key={p} label={label} active={preset === p} onClick={() => pick(p)} />)}
      <label className="flex items-center gap-2 text-[14px] text-soft">Desde<input aria-label="Desde" type="date" className={DATE} value={range.from} onChange={(e) => edit({ ...range, from: e.target.value })} /></label>
      <label className="flex items-center gap-2 text-[14px] text-soft">Hasta<input aria-label="Hasta" type="date" className={DATE} value={range.to} onChange={(e) => edit({ ...range, to: e.target.value })} /></label>
    </div>
  )
}
