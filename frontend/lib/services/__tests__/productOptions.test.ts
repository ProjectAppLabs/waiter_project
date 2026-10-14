import { coreFetch } from '@/lib/services/core/http'
import { loadMenuExtras, loadTaxes, resetMenuExtras, withComboChildren } from '@/lib/services/productOptions'

jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
const dish = (id: number, price: number, attrs: Record<string, unknown> = {}, description = '') => ({ id, kind: 'dish', name: `Plato ${id}`, price, description, diner_attributes: attrs })
beforeEach(() => {
  m.mockReset(); resetMenuExtras()
  m.mockResolvedValue({ products: [
    dish(1, 30000, { tamanos: [{ nombre: 'Sencilla', precio: 30000 }, { nombre: 'Doble', precio: 38000 }], extras: [2], acompanamientos: [3, 99] }, 'Con queso'),
    dish(2, 4000), dish(3, 7000), dish(4, 45000, { combo: [{ producto: 1, cantidad: 1 }, { producto: 3, cantidad: 2 }] }),
  ] })
})

// Falla si el tamaño deja de ser obligatorio, cobra el precio completo en vez de la diferencia, o si las adiciones
// muestran productos que ya no existen en la carta.
it('arma tamaños, adiciones y acompañamientos desde la carta', async () => {
  const { options, descriptions } = await loadMenuExtras([1, 2])
  const [size, extras, sides] = options.get(1)!
  expect(size).toMatchObject({ name: 'Tamaño', required: true, multiple: false })
  expect(size.choices.map((c) => [c.name, c.priceExtra])).toEqual([['Sencilla', 0], ['Doble', 8000]])
  expect(extras.choices.map((c) => [c.name, c.priceExtra])).toEqual([['Plato 2', 4000]])
  expect(sides.choices.map((c) => c.id)).toEqual([3])
  expect(options.has(2)).toBe(false)
  expect(descriptions.get(1)).toBe('Con queso')
  expect(m).toHaveBeenCalledWith('products?kind=dish&q=')
})

// Falla si un combo sale sin sus componentes, con cantidades que no multiplican las unidades, o con uuid que cambian
// entre reintentos (el servidor rechazaría el pedido o lo duplicaría).
it('agrega los componentes del combo con su cantidad', async () => {
  const uuid = '0f8b6c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b'
  const [line, plain] = await withComboChildren([{ uuid, product_id: 4, qty: 2 }, { uuid, product_id: 2, qty: 1 }])
  expect('children' in plain).toBe(false)
  expect(line.children?.map((c) => [c.product_id, c.qty])).toEqual([[1, 2], [3, 4]])
  expect(line.children?.[0].uuid).toMatch(/^[0-9a-f-]{36}$/)
  expect((await withComboChildren([{ uuid, product_id: 4, qty: 2 }]))[0].children).toEqual(line.children)
})

// Falla si el carrito calcula con impuestos que no son los del plato o pierde si el precio ya los incluye.
it('lee las tasas de los impuestos de la carta', async () => {
  m.mockResolvedValue({ taxes: [{ id: 5, name: 'INC', amount: 8, included: true }, { id: 6, name: 'IVA', amount: 19, included: false }], regime: 'inc' })
  await expect(loadTaxes([5])).resolves.toEqual([{ id: 5, name: 'INC', amount: 8, amountType: 'percent', priceInclude: true }])
  await expect(loadTaxes([])).resolves.toEqual([])
})
