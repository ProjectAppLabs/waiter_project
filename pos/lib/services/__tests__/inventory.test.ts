import { stockStatus } from '@/lib/domain/inventory'
import { setStock } from '@/lib/services/inventory'
import { callKw } from '@/lib/services/odoo'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn(), inRestaurant: (d: unknown[]) => d, currentConfigId: () => null }))
const m = callKw as jest.Mock
beforeEach(() => m.mockReset())

// Falla si el ajuste crea un quant duplicado cuando ya existe, o si no aplica el conteo (Odoo lo deja "por aplicar").
it('updates the existing quant and applies the inventory count', async () => {
  m.mockResolvedValueOnce([{ id: 7 }]).mockResolvedValueOnce(true).mockResolvedValueOnce(true)
  await setStock(3, 5, 12)
  expect(m.mock.calls[1].slice(0, 3)).toEqual(['stock.quant', 'write', [[7], { inventory_quantity: 12 }]])
  expect(m.mock.calls[2].slice(0, 3)).toEqual(['stock.quant', 'action_apply_inventory', [[7]]])
})

// Falla si un producto sin quant no se puede contar por primera vez.
it('creates the quant when the product was never counted', async () => {
  m.mockResolvedValueOnce([]).mockResolvedValueOnce(9).mockResolvedValueOnce(true)
  await setStock(3, 5, 4)
  expect(m.mock.calls[1][1]).toBe('create')
  expect(m.mock.calls[2][2]).toEqual([[9]])
})

// Falla si "bajo stock" no avisa a 5 unidades o si 0 no cuenta como agotado.
it('grades stock levels', () => {
  expect([stockStatus(0), stockStatus(5), stockStatus(6)]).toEqual(['out', 'low', 'ok'])
})
