// Plan Q: reglas puras de las vistas del negocio (periodos de consulta, variación, exportar).

export type PeriodPreset = 'today' | 'week' | 'month' | 'lastMonth' | 'last30'
export interface DateSpan { from: string; to: string }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// La semana empieza el lunes, como en el resto del POS. Las fechas salen en la hora local del dispositivo.
export function presetSpan(preset: PeriodPreset, now = new Date()): DateSpan {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (preset === 'today') return { from: iso(day), to: iso(day) }
  if (preset === 'week') {
    const monday = new Date(day); monday.setDate(day.getDate() - ((day.getDay() + 6) % 7))
    return { from: iso(monday), to: iso(day) }
  }
  // Por omisión en las vistas del negocio: no queda vacío el día 1 ni el lunes.
  if (preset === 'last30') { const from = new Date(day); from.setDate(day.getDate() - 29); return { from: iso(from), to: iso(day) } }
  if (preset === 'month') return { from: iso(new Date(day.getFullYear(), day.getMonth(), 1)), to: iso(day) }
  return { from: iso(new Date(day.getFullYear(), day.getMonth() - 1, 1)), to: iso(new Date(day.getFullYear(), day.getMonth(), 0)) }
}

export const validSpan = (s: DateSpan) => /^\d{4}-\d{2}-\d{2}$/.test(s.from) && /^\d{4}-\d{2}-\d{2}$/.test(s.to) && s.from <= s.to

// Variación frente al periodo anterior en %; sin base (0) no hay comparación posible.
export const change = (current: number, previous: number): number | null => (previous ? ((current - previous) / previous) * 100 : null)

// CSV con separador «;» y coma decimal (lo que abre bien Excel en Colombia); las celdas con «;» o comillas van entre comillas.
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const text = v === null ? '' : typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : v
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click(); URL.revokeObjectURL(url)
}
