import { getTimeline } from '@/lib/services/reservations'
import { useReservationsStore } from '@/lib/stores/reservationsStore'

jest.mock('@/lib/services/reservations', () => ({ ...jest.requireActual('@/lib/services/reservations'), getTimeline: jest.fn() }))
const m = getTimeline as jest.Mock

const table = (id: number, floorId: number) => ({ id, tableNumber: id, name: `Mesa ${id}`, seats: 4, floorId, reservations: [] })
const timeline = { date: '2030-10-15', slots: [], floors: [{ id: 1, name: 'Salón' }, { id: 2, name: 'Terraza' }], tables: [table(10, 1), table(20, 2)] }
const store = () => useReservationsStore.getState()

beforeEach(() => {
  m.mockReset(); m.mockResolvedValue(timeline)
  useReservationsStore.setState({ date: '2030-10-15', floorId: null, timeline: null, loadingKey: null, loadedKey: null })
})

// Falla si volver a pedir la grilla por el cambio de piso que hace la propia carga: al abrir Reservas se pedía sin piso,
// se fijaba el primero y ese cambio disparaba una segunda petición en serie (la página tardaba el doble).
it('shows the first floor from the first request without asking again', async () => {
  await store().load(7)
  expect(store().floorId).toBe(1)
  expect(store().timeline?.tables.map((t) => t.id)).toEqual([10]) // solo el primer piso, sin mezclar la terraza
  await store().load(7) // el efecto de la página se vuelve a disparar porque cambió el piso
  expect(m).toHaveBeenCalledTimes(1)
})

// Falla si dos cargas iguales a la vez (el modo desarrollo de React ejecuta cada efecto dos veces) hacen dos peticiones.
it('does not repeat a request that is already in flight', async () => {
  await Promise.all([store().load(7), store().load(7)])
  expect(m).toHaveBeenCalledTimes(1)
})

// Falla si una recarga a propósito (tras crear una reserva o cambiar su estado) se salta por creer que ya está, o si al
// volver a Reservas se muestra la grilla vieja: otro terminal pudo crear o cambiar reservas entre visitas.
it('reloads when forced and on the next visit', async () => {
  await store().load(7)
  await store().load(7, true)
  expect(m).toHaveBeenCalledTimes(2)
  store().forget() // se sale de Reservas
  await store().load(7)
  expect(m).toHaveBeenCalledTimes(3)
})

// Falla si cambiar de piso o de fecha no pide la grilla nueva.
it('asks again when the floor or the date changes', async () => {
  await store().load(7)
  store().setFloor(2); await store().load(7)
  store().setDate('2030-10-16'); await store().load(7)
  expect(m).toHaveBeenCalledTimes(3)
  expect(m).toHaveBeenLastCalledWith(7, '2030-10-16', 2)
})

// Hallazgos de la segunda revisión con Codex.
// Falla si volver a una fecha ya cargada mientras la otra aún llega deja la grilla de la otra fecha: la vuelta se
// saltaba por «ya cargada» y la respuesta lenta de la otra fecha se instalaba debajo de la fecha elegida.
it('never shows the timeline of a date that is no longer selected', async () => {
  const dayA = { ...timeline, date: '2030-10-15' }, dayB = { ...timeline, date: '2030-10-16', tables: [table(99, 1)] }
  m.mockResolvedValueOnce(dayA)
  await store().load(7)                                    // A cargada
  let answerB: (t: typeof dayB) => void = () => undefined
  m.mockReturnValueOnce(new Promise((resolve) => { answerB = resolve }))
  store().setDate('2030-10-16'); const pendingB = store().load(7)   // B, lenta
  m.mockResolvedValueOnce({ ...dayA, tables: [table(10, 1)] }) // con el piso ya elegido, el servidor devuelve solo el suyo
  store().setDate('2030-10-15'); await store().load(7)     // vuelta a A
  answerB(dayB); await pendingB                            // B llega tarde
  expect(store().date).toBe('2030-10-15')
  expect(store().timeline?.tables.map((t) => t.id)).toEqual([10]) // la de A, no la mesa 99 de B
})

// Falla si una respuesta que llega después de salir de Reservas restaura «ya cargado» y la visita siguiente no pide
// datos frescos (otro terminal pudo cambiar reservas entre medio).
it('asks again on the next visit even if the last request finished after leaving', async () => {
  let answer: (t: typeof timeline) => void = () => undefined
  m.mockReturnValueOnce(new Promise((resolve) => { answer = resolve }))
  const pending = store().load(7)
  store().forget()                                         // se sale con la petición en vuelo
  answer(timeline); await pending
  await store().load(7)                                    // se vuelve
  expect(m).toHaveBeenCalledTimes(2)
})
