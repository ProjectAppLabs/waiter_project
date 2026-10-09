import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { readPayableOrder, redeemPoints } from '@/lib/services/paymentKit'
import { coreOrder } from '@/lib/testFixtures/core'
// Falla si el cajero no puede cobrar un pedido de otro dispositivo con sus líneas y pagos previos.
it('lee el pedido completo para cobrarlo', async () => {
 m.mockResolvedValue({ order: coreOrder() })
 const order = await readPayableOrder(13)
 // Contrato vigente del cliente (core/sales.ts: `getOrder`): la lectura en línea viaja sin opciones de respaldo.
 expect(m).toHaveBeenCalledWith('orders/13', {})
 expect(order).toMatchObject({ id: 13, customerName: 'Zahir', tableNumber: '8', total: 73800, paid: 20000 })
 expect(order.lines[0]).toMatchObject({ uuid: 'linea-1', name: 'Angus', qty: 2, total: 73800 })
})
// Falla si un saldo cambiado se cobra sin pedir revisar el total.
it('avisa cuando el canje calculado por el servidor cambió', async () => {
 m.mockResolvedValue({ amount: 90, points: 9 })
 await expect(redeemPoints(13, { cardId: 2, code: 'ABCDEFGH', name: 'Ana', phone: '', points: 10 }, { id: 1, name: 'Puntos', copPerPoint: 10, rewardId: 1, rewardProductId: null }, 10, 100, 73800)).rejects.toThrow('saldo disponible cambió')
})
