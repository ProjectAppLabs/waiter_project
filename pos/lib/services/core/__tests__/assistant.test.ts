import { assistantStatus, liftRestriction, proposeTags, restrictedParticipants, saveTags } from '@/lib/services/core/assistant'
import { coreFetch } from '@/lib/services/core/http'

jest.mock('@/lib/services/core/http', () => ({ coreFetch: jest.fn() }))
beforeEach(() => jest.clearAllMocks())

// Falla si la consola lee mal el estado de las claves y los cupos, o el nivel de restricción que manda el servidor.
it('traduce el estado y los clientes restringidos', async () => {
  jest.mocked(coreFetch).mockResolvedValueOnce({ configured: { jev: false, voice: true }, models: {}, day: '2026-10-09', usage: { messages: 4, restaurants: [] }, limits: { per_participant: 30, per_restaurant: 200 } })
  expect(await assistantStatus()).toEqual({ evaluator: false, voice: true, messages: 4, perRestaurant: 200, perParticipant: 30 })
  jest.mocked(coreFetch).mockResolvedValueOnce({ participants: [{ id: 3, participant: 'huella', channel: 'menu', status: 'paused', reason: 'Fuera de tema', until: null }] })
  expect(await restrictedParticipants()).toEqual([{ id: 3, channel: 'menu', standing: 'paused', reason: 'Fuera de tema', until: null }])
  expect(coreFetch).toHaveBeenLastCalledWith('assistant/participants?restricted=1')
})

// Falla si guardar, proponer o quitar la restricción van a otra ruta o con otro cuerpo.
it('envía las acciones a sus rutas', async () => {
  const plato = { id: 1, name: 'Sopa', tags: ['saludable'], reviewed: true }
  jest.mocked(coreFetch).mockResolvedValueOnce({ product: plato }).mockResolvedValueOnce({ products: [plato] }).mockResolvedValueOnce({ participant: {} })
  expect(await saveTags(1, ['saludable'])).toEqual(plato)
  expect(coreFetch).toHaveBeenLastCalledWith('assistant/tags/1', { method: 'PATCH', body: { tags: ['saludable'] } })
  expect(await proposeTags(null)).toEqual([plato])
  expect(coreFetch).toHaveBeenLastCalledWith('assistant/tags/propose', { method: 'POST', body: { product_ids: null } })
  await liftRestriction(3)
  expect(coreFetch).toHaveBeenLastCalledWith('assistant/participants/3/lift', { method: 'POST' })
})
