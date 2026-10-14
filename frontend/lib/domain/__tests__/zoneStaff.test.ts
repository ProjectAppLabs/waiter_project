import { initials, sameStaff, staffNames, toggleStaff, unassigned, zonesWithoutStaff } from '@/lib/domain/zoneStaff'

// Falla si tocar a un mesero deja de alternarlo, si una zona vacía queda guardada como lista vacía (el servidor la
// rechazaría al borrarse la zona) o si tocar una zona altera otra.
it('toggles one employee in one zone and drops zones left empty', () => {
  const one = toggleStaff({ bar: [7] }, 'terraza', 4)
  expect(one).toEqual({ bar: [7], terraza: [4] })
  expect(toggleStaff(one, 'terraza', 5)).toEqual({ bar: [7], terraza: [4, 5] })
  expect(toggleStaff(one, 'terraza', 4)).toEqual({ bar: [7] })
})

// Falla si el botón Guardar se enciende solo por haber tocado a los meseros en otro orden.
it('compares assignments as sets, ignoring order and empty zones', () => {
  expect(sameStaff({ a: [1, 2], b: [] }, { a: [2, 1] })).toBe(true)
  expect(sameStaff({ a: [1] }, { a: [1, 2] })).toBe(false)
  expect(sameStaff({ a: [1] }, { b: [1] })).toBe(false)
})

// Falla si el aviso «zonas sin mesero», la lista de empleados sin zona o los rótulos del plano dejan de salir del reparto.
it('reports uncovered zones, free employees and first names per zone', () => {
  const zones = [{ id: 'a' }, { id: 'b' }]
  const people = [{ id: 1, name: 'Sofía Mesera' }, { id: 2, name: 'Carlos Cajero' }]
  expect(zonesWithoutStaff(zones, { a: [1] })).toEqual([{ id: 'b' }])
  expect(unassigned(people, { a: [1] })).toEqual([people[1]])
  expect(staffNames(zones, { a: [1, 99], b: [2] }, people)).toEqual({ a: ['Sofía'], b: ['Carlos'] })
  expect(initials('Laura Encargada Pérez')).toBe('LE')
})
