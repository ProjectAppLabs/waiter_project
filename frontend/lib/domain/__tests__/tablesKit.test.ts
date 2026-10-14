import {
  GRID, TEMPLATES, canPlace, chairsFor, floorName, floorNumber, hourLabel, kitState, layoutSummary, nextFloorNumber, orderCode, orderPrefix,
  overlaps, parseFloorName, parseTableName, planSize, progressPercent, remainingByTemplate, rotated, snap, templateFor,
} from '@/lib/domain/tablesKit'
import type { TableView } from '@/lib/domain/tableState'

const geo = { floorId: 1, shape: 'square' as const, color: null }
const small = { id: 1, number: 1, seats: 4, x: 40, y: 40, width: 110, height: 110, ...geo }
const largeH = { id: 2, number: 2, seats: 6, x: 200, y: 40, width: 240, height: 120, ...geo }
const largeV = { id: 3, number: 3, seats: 8, x: 500, y: 40, width: 120, height: 240, ...geo }
const view = (table: typeof small, state: TableView['state']): TableView => ({ table, state, total: 0, tax: 0, orderId: null, startedAt: null, waiter: null, callSince: null })

// Falla si una mesa del servidor (110×110) deja de dibujarse como pequeña, o si la apaisada y la vertical se confunden.
it('classifies tables into the three kit templates by width and height', () => {
  expect([templateFor(small), templateFor(largeH), templateFor(largeV)]).toEqual(['small', 'largeH', 'largeV'])
  expect(TEMPLATES.largeH).toEqual({ width: 240, height: 120, seats: 6 })
  expect(TEMPLATES.largeV).toEqual({ width: 120, height: 240, seats: 8 })
})

// Falla si las sillas dibujadas dejan de ser las del kit: 4 en la pequeña, 3+3+1+1 en la apaisada, 1+1+3+3 en la vertical.
it('draws the chairs of each template as in the kit', () => {
  expect(chairsFor('small')).toEqual({ top: 1, bottom: 1, left: 1, right: 1 })
  expect(chairsFor('largeH')).toEqual({ top: 3, bottom: 3, left: 1, right: 1 })
  expect(chairsFor('largeV')).toEqual({ top: 1, bottom: 1, left: 3, right: 3 })
})

// Falla si el snapping deja de caer en la cuadrícula o si rotar no intercambia ancho y alto (el servidor no guarda rotación).
it('snaps to the grid and rotates by swapping width and height', () => {
  expect([snap(57), snap(63), snap(-5)]).toEqual([GRID, 2 * GRID, 0])
  expect(rotated(largeH)).toMatchObject({ width: 120, height: 240 })
  expect(rotated(rotated(largeH))).toMatchObject({ width: 240, height: 120 })
})

// Falla si dos mesas pueden soltarse encima (o sin espacio para las sillas), o si una mesa se solapa consigo misma.
it('rejects a placement that overlaps another table, itself excluded', () => {
  expect(overlaps(small, { ...small, x: 100 })).toBe(true)
  expect(overlaps(small, { ...small, x: 200 })).toBe(false)
  const placed = [{ ...small, key: 'a' }, { ...largeH, key: 'b' }]
  expect(canPlace({ ...small, x: 200 }, placed)).toBe(false)
  expect(canPlace({ ...small, x: 40, y: 40 }, placed, 'a')).toBe(true)
})

// Falla si un estado del salón deja de mapear a los tres del kit, o si una mesa con pedido pasa por reservada.
it('maps salon states to the kit legend', () => {
  expect(kitState('free')).toBe('available')
  expect((['occupied', 'kitchen', 'served', 'billing', 'assist', 'ordering', 'closed', 'paid'] as const).map((s) => kitState(s))).toEqual(Array(8).fill('unavailable'))
  expect(kitState('free', true)).toBe('reserved')
  expect(kitState('occupied', true)).toBe('unavailable')
})

// Falla si la hora de una reserva del servidor (float) deja de leerse como "17:00" o si media hora se pierde.
it('reads the reservation hour as the kit badge shows it', () => {
  expect([hourLabel(17), hourLabel(17.5), hourLabel(9.25)]).toEqual(['17:00', '17:30', '09:15'])
})

// Falla si el prefijo del pedido deja de seguir el preset (mesa DI, mostrador TA, domicilio DE) o si sin preset no es DI.
it('builds the order code from the preset service and the tracking number', () => {
  expect([orderPrefix('table'), orderPrefix('counter'), orderPrefix('delivery'), orderPrefix(null)]).toEqual(['DI', 'TA', 'DE', 'DI'])
  expect(orderCode('DI', '104', 9)).toBe('DI104')
  expect(orderCode('TA', null, 9)).toBe('TA9')
})

// Falla si el % de progreso se calcula sobre líneas no enviadas o si divide por cero cuando nada se envió.
it('computes the served percentage over the lines sent to the kitchen', () => {
  expect([progressPercent(0, 0), progressPercent(1, 3), progressPercent(3, 3)]).toEqual([0, 33, 100])
})

// Falla si el tipo de piso deja de viajar como sufijo del nombre (el servidor no tiene floor_type) o si el número no se extrae.
it('encodes the floor type as a name suffix and reads it back', () => {
  expect(floorName('4', 'outdoor')).toBe('Piso 4 · Exterior')
  expect(floorName('4', 'indoor')).toBe('Piso 4')
  expect(floorName('Terraza', 'outdoor')).toBe('Terraza · Exterior')
  expect(parseFloorName('Piso 4 · Exterior')).toEqual({ label: 'Piso 4', type: 'outdoor' })
  expect(parseFloorName('Terraza')).toEqual({ label: 'Terraza', type: 'indoor' })
  expect([floorNumber('Piso 4 · Exterior'), floorNumber('Terraza')]).toEqual([4, null])
  expect(nextFloorNumber([{ name: 'Piso 2' }, { name: 'Terraza' }, { name: 'Piso 5 · Exterior' }])).toBe(6)
})

// Falla si el resumen del éxito cuenta mal grandes y pequeñas, o si el tamaño del lienzo no cubre la mesa más lejana.
it('summarizes a layout and sizes the plan canvas', () => {
  expect(layoutSummary([small, largeH, largeV])).toEqual({ large: 2, small: 1, total: 3 })
  expect(planSize([small, largeV])).toEqual({ width: 500 + 120 + 60, height: 40 + 240 + 60 })
  expect(planSize([])).toEqual({ width: 0, height: 0 })
})

// Falla si "Mesa 12" no se reduce al número 12 (el servidor solo guarda table_number) o si un nombre sin dígitos pasa.
it('reads the table number out of a free-text table name', () => {
  expect(parseTableName('12')).toEqual({ number: 12, exact: true })
  expect(parseTableName('Mesa A12')).toEqual({ number: 12, exact: false })
  expect(parseTableName('Ventana')).toEqual({ number: null, exact: false })
})

// Falla si el chip "Info del piso" cuenta mesas ocupadas como libres.
it('counts remaining large and small tables among the available ones', () => {
  expect(remainingByTemplate([view(small, 'free'), view(largeH, 'occupied'), view(largeV, 'free')])).toEqual({ large: 1, small: 1 })
})
