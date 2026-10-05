import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import { coreFetch } from '@/lib/services/core/http'
import {
  createReservation, getAvailableTables, getReservation, getSlots, getTimeline, listByTable, markDepositPaid,
  reservedAtByTable, setDeposit, setReservationState, setReservationTables,
} from '@/lib/services/reservations'

jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
jest.mock('@/lib/services/core/catalogBridge', () => ({ currentRestaurantId: jest.fn(() => 1) }))
const m = jest.mocked(coreFetch)
beforeEach(() => { m.mockReset(); jest.mocked(currentRestaurantId).mockReturnValue(1) })

const rawCard = (over: Record<string, unknown> = {}) => ({
  id: 5, name: 'RV005', customer_name: 'Eva', people: 4, baby_chair: true, state: 'confirmed', date: '2030-10-15', time_start: 20, time_end: 21.5,
  label: '20:00', time_label: '20:00 – 21:30', table_id: 3, table_number: 7, floor_id: 1, floor_name: 'Salón', ...over,
})
const rawDetail = (over: Record<string, unknown> = {}) => ({
  ...rawCard(), customer_email: 'eva@x.co', customer_phone: '300', notes: 'Ventana', amount_total: 54000,
  lines: [{ id: 1, product_id: 11, product_tmpl_id: 12, name: 'Hamburguesa', qty: 2, price_unit: 27000, price_subtotal_incl: 54000, note: 'Sin cebolla' }],
  deposit_amount: 20000, deposit_state: 'pending', deposit_reference: 'R1', deposit_paid_at: '', pay_token: 'tok', pay_url: 'https://pagar', restaurant_name: 'Centro', ...over,
})
const path = () => String(m.mock.calls[0][0])
const init = () => m.mock.calls[0][1] as { method?: string; body?: Record<string, unknown> }

// Falla si la línea de tiempo pierde las mesas o las reservas, o si una reserva sin varias mesas no queda con la suya
// como única (el grupo y el margen por defecto de 30 min dependen de esto).
it('la línea de tiempo trae mesas y reservas con sus valores por defecto', async () => {
  m.mockResolvedValue({ date: '2030-10-15', slots: [{ time: 20, label: '20:00', past: false }], floors: [{ id: 1, name: 'Salón' }],
    tables: [{ id: 3, table_number: 7, name: 'Mesa 7', seats: 4, floor_id: 1, floor_name: 'Salón', shape: 'square', reservations: [rawCard()] }] })
  const t = await getTimeline(1, '2030-10-15', 2)
  expect(path()).toBe('reservations/timeline?restaurant_id=1&date=2030-10-15&floor_id=2')
  expect(t.tables[0]).toMatchObject({ id: 3, tableNumber: 7, seats: 4, floorId: 1 })
  expect(t.tables[0].reservations[0]).toMatchObject({ customerName: 'Eva', babyChair: true, tableNumbers: [7], tableIds: [3], prepMinutes: '30', depositState: 'none', timeLabel: '20:00 – 21:30' })
})

// Falla si una reserva de grupo pierde sus mesas al convertirse, o si se pide la lista de otra mesa.
it('las reservas de una mesa conservan todas las mesas del grupo', async () => {
  m.mockResolvedValue({ reservations: [rawCard({ table_numbers: [7, 8], table_ids: [3, 4], prep_minutes: '60', deposit_state: 'paid' })] })
  const rows = await listByTable(3)
  expect(path()).toBe('reservations?table_id=3')
  expect(rows[0]).toMatchObject({ tableNumbers: [7, 8], tableIds: [3, 4], prepMinutes: '60', depositState: 'paid' })
})

// Falla si las franjas o las mesas libres se piden sin la fecha, hora, personas, margen o la reserva que se edita, o si
// la mesa pierde su estado de disponibilidad.
it('pide franjas y mesas libres con todos sus criterios', async () => {
  m.mockResolvedValueOnce([{ time: 19, label: '19:00', past: false }])
  expect(await getSlots(1, '2030-10-15')).toHaveLength(1)
  expect(path()).toBe('reservations/slots?restaurant_id=1&date=2030-10-15')
  m.mockReset()
  m.mockResolvedValue([{ id: 3, table_number: 7, name: 'Mesa 7', seats: 4, floor_id: 1, floor_name: 'Salón', shape: 'round', status: 'reserved', available: false, reserved_at: '19:00' }])
  const tables = await getAvailableTables(1, '2030-10-15', 20, 4, '60', 9)
  expect(path()).toMatch(/date=2030-10-15/); expect(path()).toMatch(/people=4/); expect(path()).toMatch(/60/); expect(path()).toMatch(/9/)
  expect(tables[0]).toEqual({ id: 3, tableNumber: 7, name: 'Mesa 7', seats: 4, floorId: 1, floorName: 'Salón', shape: 'round', status: 'reserved', available: false, reservedAt: '19:00' })
})

// Falla si crear la reserva no manda el restaurante, las mesas, el margen, el anticipo y el pre-pedido, o si el detalle
// devuelto pierde las líneas, el anticipo o el enlace de pago.
it('crea la reserva con su pre-pedido y devuelve el detalle completo', async () => {
  m.mockResolvedValue(rawDetail())
  const created = await createReservation({ customerName: 'Eva', customerEmail: '', customerPhone: '300', people: 4, babyChair: true, notes: '', date: '2030-10-15', timeStart: 20,
    tableIds: [3, 4], configId: 1, prepMinutes: '60', depositAmount: 20000 }, [{ productId: 11, qty: 2, note: 'Sin cebolla' }, { productId: 12, qty: 1 }])
  expect(path()).toBe('reservations'); expect(init().method).toBe('POST')
  expect(init().body).toMatchObject({ restaurant_id: 1, table_ids: [3, 4], prep_minutes: '60', deposit_amount: 20000, customer_email: '', notes: '',
    lines: [{ product_id: 11, qty: 2, note: 'Sin cebolla' }, { product_id: 12, qty: 1, note: '' }] })
  expect(init().body).not.toHaveProperty('config_id')
  expect(created).toMatchObject({ customerEmail: 'eva@x.co', amountTotal: 54000, depositAmount: 20000, depositState: 'pending', payUrl: 'https://pagar', restaurantName: 'Centro' })
  expect(created.lines[0]).toEqual({ id: 1, productId: 11, productTmplId: 12, name: 'Hamburguesa', qty: 2, priceUnit: 27000, total: 54000, note: 'Sin cebolla' })
})

// Falla si un detalle viejo sin datos de anticipo rompe la conversión en vez de quedar sin anticipo.
it('un detalle sin datos de anticipo queda sin costo', async () => {
  m.mockResolvedValue(rawDetail({ deposit_amount: undefined, deposit_state: undefined, deposit_reference: undefined, deposit_paid_at: undefined, pay_token: undefined, pay_url: undefined, restaurant_name: undefined }))
  expect(await getReservation(5)).toMatchObject({ depositAmount: 0, depositState: 'none', depositReference: '', payUrl: '', restaurantName: '' })
  expect(path()).toBe('reservations/5')
})

// Falla si una reserva que no existe o un error del servidor revienta la pantalla en vez de devolver null.
it('una reserva que no se puede leer devuelve null', async () => {
  m.mockRejectedValue(new Error('404'))
  expect(await getReservation(99)).toBeNull()
})

// Falla si cambiar mesas, el costo o marcar el anticipo pagado va a otra ruta, con otro método o sin sus datos.
it('cambia mesas, costo y anticipo pagado en sus rutas', async () => {
  m.mockResolvedValue(rawDetail())
  await setReservationTables(5, [4, 3])
  expect(m.mock.calls[0]).toEqual(['reservations/5/tables', { method: 'PUT', body: { table_ids: [4, 3] } }])
  await setDeposit(5, 0)
  expect(m.mock.calls[1]).toEqual(['reservations/5/deposit', { method: 'PUT', body: { amount: 0 } }])
  await markDepositPaid(5)
  expect(m.mock.calls[2]).toEqual(['reservations/5/deposit/paid', { method: 'POST', body: { reference: '' } }])
  await markDepositPaid(5, 'Nequi 123')
  expect(m.mock.calls[3][1]).toEqual({ method: 'POST', body: { reference: 'Nequi 123' } })
})

// Falla si sentar, marcar no llegó o cancelar llaman a la acción equivocada del servidor.
it('cada cambio de estado usa su acción', async () => {
  m.mockResolvedValue({})
  await expect(setReservationState(5, 'seated')).resolves.toBe(true)
  await setReservationState(5, 'no_show'); await setReservationState(5, 'cancelled')
  expect(m.mock.calls.map((c) => c[0])).toEqual(['reservations/5/seat', 'reservations/5/no-show', 'reservations/5/cancel'])
})

// Falla si el plano marca una mesa como reservada por una reserva ya sentada o cancelada, o si pide la línea de tiempo
// sin restaurante elegido.
it('el plano solo marca la próxima reserva confirmada de cada mesa', async () => {
  m.mockResolvedValue({ date: '2030-10-15', slots: [], floors: [], tables: [
    { id: 3, reservations: [rawCard({ state: 'seated', label: '18:00' }), rawCard({ label: '20:00' })] },
    { id: 4, reservations: [rawCard({ state: 'cancelled' })] },
  ] })
  expect(await reservedAtByTable('2030-10-15')).toEqual({ 3: { label: '20:00' }, 4: false })
  m.mockReset()
  jest.mocked(currentRestaurantId).mockReturnValue(null)
  expect(await reservedAtByTable('2030-10-15')).toEqual({})
  expect(m).not.toHaveBeenCalled()
})
