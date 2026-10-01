import { filterRows, nextSort, sortRows } from '@/lib/hooks/useTableView'

const rows = [{ n: 'Ñame', v: 3 }, { n: 'árbol', v: null }, { n: 'Zanahoria', v: 10 }, { n: 'agua 2', v: 1 }, { n: 'agua 10', v: 2 }]
const sorters = { n: (r: typeof rows[number]) => r.n, v: (r: typeof rows[number]) => r.v }

// Falla si el orden no es el del español (tildes, ñ, números dentro del texto) o si los vacíos no quedan al final.
it('ordena como en español y deja los vacíos al final', () => {
  expect(sortRows(rows, { key: 'n', dir: 'asc' }, sorters).map((r) => r.n)).toEqual(['agua 2', 'agua 10', 'árbol', 'Ñame', 'Zanahoria'])
  expect(sortRows(rows, { key: 'v', dir: 'desc' }, sorters).map((r) => r.v)).toEqual([10, 3, 2, 1, null])
  expect(sortRows(rows, { key: 'v', dir: 'asc' }, sorters).map((r) => r.v)).toEqual([1, 2, 3, 10, null])
  expect(sortRows(rows, null, sorters)).toBe(rows)
})

// Falla si el tercer clic no devuelve el orden original o si cambiar de columna no empieza ascendente.
it('alterna ascendente, descendente y original', () => {
  expect(nextSort(null, 'n')).toEqual({ key: 'n', dir: 'asc' })
  expect(nextSort({ key: 'n', dir: 'asc' }, 'n')).toEqual({ key: 'n', dir: 'desc' })
  expect(nextSort({ key: 'n', dir: 'desc' }, 'n')).toBeNull()
  expect(nextSort({ key: 'n', dir: 'desc' }, 'v')).toEqual({ key: 'v', dir: 'asc' })
})

// Falla si la búsqueda distingue tildes o mayúsculas, o si exige el texto en orden en vez de todas las palabras.
it('busca sin tildes y con todas las palabras', () => {
  expect(filterRows(rows, 'ARBOL', (r) => r.n).map((r) => r.n)).toEqual(['árbol'])
  expect(filterRows(rows, '10 agua', (r) => r.n).map((r) => r.n)).toEqual(['agua 10'])
  expect(filterRows(rows, '  ', (r) => r.n)).toBe(rows)
})
