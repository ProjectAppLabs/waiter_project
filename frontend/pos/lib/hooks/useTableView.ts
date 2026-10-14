'use client'

import { useMemo, useState } from 'react'

// Plan R: ordenar y buscar en las tablas, como en una lista de reproducción. Un clic en la cabecera ordena ascendente,
// otro descendente y el tercero vuelve al orden original. La búsqueda filtra por el texto de cada fila mientras se escribe.
export type SortDir = 'asc' | 'desc'
export interface TableSort { key: string; dir: SortDir }
export type SortValue = string | number | null | undefined
export type Sorters<T> = Record<string, (row: T) => SortValue>

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })
// Sin tildes ni mayúsculas: «jose» encuentra a «José».
export const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Los vacíos (sin costo, sin turno…) van siempre al final, en los dos sentidos: no tapan lo que sí tiene dato.
export function sortRows<T>(rows: T[], sort: TableSort | null, sorters: Sorters<T>): T[] {
  if (!sort || !sorters[sort.key]) return rows
  const get = sorters[sort.key]
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b)
    const ex = x === null || x === undefined || x === '', ey = y === null || y === undefined || y === ''
    if (ex || ey) return ex === ey ? 0 : ex ? 1 : -1
    return sign * (typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y)))
  })
}

export function filterRows<T>(rows: T[], query: string, text: (row: T) => string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  return words.length ? rows.filter((r) => { const t = fold(text(r)); return words.every((w) => t.includes(w)) }) : rows
}

export const nextSort = (current: TableSort | null, key: string): TableSort | null =>
  current?.key !== key ? { key, dir: 'asc' } : current.dir === 'asc' ? { key, dir: 'desc' } : null

export function useTableView<T>(rows: T[], sorters: Sorters<T>, text: (row: T) => string, initial: TableSort | null = null) {
  const [sort, setSort] = useState<TableSort | null>(initial)
  const [query, setQuery] = useState('')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sorters y text se definen en cada render; cambian con rows
  const view = useMemo(() => sortRows(filterRows(rows, query, text), sort, sorters), [rows, query, sort])
  return { view, sort, toggle: (key: string) => setSort((s) => nextSort(s, key)), query, setQuery }
}
