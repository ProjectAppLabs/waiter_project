import { uuid } from '@/lib/domain/uuid'

// Falla si la app vuelve a depender de crypto.randomUUID: no existe en http://192.168.56.10 (contexto no seguro)
// y la pantalla de pedido crashea al abrir una mesa.
it('generates a v4 uuid without crypto.randomUUID', () => {
  const original = crypto.randomUUID
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
  const id = uuid()
  Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

// Falla si dos llamadas seguidas devuelven el mismo id (colisión de líneas en un pedido).
it('returns distinct ids on consecutive calls', () => {
  expect(uuid()).not.toBe(uuid())
})
