import { act } from '@testing-library/react'

import { fireUnsentLines } from '@/lib/services/kitchen'
import { addTip, closeOrder, listOpenOrders, payOrder, saveOrder, setChange } from '@/lib/services/orders'
import { useOrderStore } from '@/lib/stores/orderStore'

jest.mock('@/lib/services/orders', () => ({ saveOrder: jest.fn(), payOrder: jest.fn(), closeOrder: jest.fn(), listOpenOrders: jest.fn(), getShiftSummary: jest.fn(), addTip: jest.fn(), setChange: jest.fn() }))
jest.mock('@/lib/services/kitchen', () => ({ fireUnsentLines: jest.fn() }))
const mSave = saveOrder as jest.Mock
const mPay = payOrder as jest.Mock
const mClose = closeOrder as jest.Mock
const mList = listOpenOrders as jest.Mock
const angus = { id: 3, templateId: 2, name: 'Angus', price: 36900, categoryIds: [1], taxIds: [5], favorite: false, storable: false, soldOut: false, hasImage: false }
const saved = { id: 13, reference: '260-1-000009', state: 'draft' as const, total: 87822, tax: 14022, paid: 0 }

beforeEach(() => {
  jest.clearAllMocks()
  mList.mockResolvedValue([])
  useOrderStore.setState({ draft: null, saved: null, openOrders: [], shift: null, flags: {}, busy: false, error: null, receipt: null })
})

// Falla si enviar a cocina no dispara la comanda en Odoo o la marca solo en memoria (cocina no la vería).
it('sendToKitchen saves the draft and fires the unsent lines in Odoo, without local flags', async () => {
  mSave.mockResolvedValue(saved)
  ;(fireUnsentLines as jest.Mock).mockResolvedValue(21)
  act(() => { useOrderStore.getState().start(1, 6, 2); useOrderStore.getState().add(angus) })
  await act(() => useOrderStore.getState().sendToKitchen())
  expect(fireUnsentLines).toHaveBeenCalledWith(13)
  expect(useOrderStore.getState().flags[6]).toBeUndefined()
  expect(useOrderStore.getState().draft?.serverId).toBe(13)
})

const CTX = { existing: { orderId: 13, tableId: 6 }, tipProductId: 1, tableNumber: 6, company: 'Demo', lines: [], methodName: (id: number) => (id === 1 ? 'Efectivo' : 'Tarjeta') }

// Falla si un error de Odoo deja el store "ocupado" para siempre (botón bloqueado).
it('save surfaces the Odoo message and releases busy', async () => {
  mSave.mockRejectedValue(new Error('Invalid preset'))
  act(() => { useOrderStore.getState().start(1, 6, 2); useOrderStore.getState().add(angus) })
  await act(() => useOrderStore.getState().save())
  expect(useOrderStore.getState()).toMatchObject({ busy: false, error: 'Invalid preset' })
})

// Falla si un pedido hecho en otro dispositivo (o por el comensal) no se puede cobrar sin borrador local:
// es el caso normal del cajero, que cobra desde Pedidos lo que tomó el mesero. Sustituye a la cobertura de
// `chargeExisting`, el cobro de un solo método que se retiró con el camino de Mesas.
it('settles an order created elsewhere, with no local draft', async () => {
  mPay.mockResolvedValue({ ...saved, paid: 87822 }); mClose.mockResolvedValue({ ...saved, state: 'paid', total: 87822, tax: 0, paid: 87822 })
  useOrderStore.setState({ draft: null, saved: null, flags: { 6: { billing: true } } })
  const ok = await useOrderStore.getState().settle({ tip: 0, payments: [{ methodId: 1, type: 'cash', amount: 87822, received: 87822, reference: '' }] }, CTX)
  expect(ok).toBe(true)
  // El efectivo recibido y el voucher viajan con el pago: el sistema propio calcula el cambio con ellos (T2).
  expect(mPay).toHaveBeenCalledWith(13, 1, 87822, 87822, '')
  expect(mClose).toHaveBeenCalledWith(13)
  expect(useOrderStore.getState().flags[6]).toEqual({})
})



// Falla si el cobro mixto no registra cada pago, la propina o el cambio en Odoo, o si no deja recibo.
it('settle tips, records every payment and the change, closes and leaves a receipt', async () => {
  mClose.mockResolvedValue({ ...saved, state: 'paid', total: 95822, tax: 14022, paid: 95822 })
  ;(addTip as jest.Mock).mockResolvedValue({ ...saved, total: 95822 })
  const ok = await useOrderStore.getState().settle({ tip: 8000, payments: [{ methodId: 2, type: 'bank', amount: 50000, received: 50000, reference: 'A1' }, { methodId: 1, type: 'cash', amount: 45822, received: 50000, reference: '' }] }, CTX)
  expect(ok).toBe(true)
  expect(addTip).toHaveBeenCalledWith(13, 1, 8000)
  expect(mPay.mock.calls.map((c) => c.slice(1))).toEqual([[2, 50000, 50000, 'A1'], [1, 45822, 50000, '']])
  expect(setChange).toHaveBeenCalledWith(13, 4178)
  expect(useOrderStore.getState().receipt).toMatchObject({ total: 95822, tip: 8000, change: 4178, payments: [{ method: 'Tarjeta', amount: 50000, reference: 'A1' }, { method: 'Efectivo', amount: 45822, reference: '' }] })
})


// Falla si un corte de red durante el sondeo del salón deja un rechazo sin capturar o borra lo último conocido.
test('a network error while polling keeps the last known open orders', async () => {
  const known = [{ id: 1, uuid: 'u1', tableId: 3, lines: [], amountTotal: 0, state: 'draft' }] as never
  useOrderStore.setState({ openOrders: known })
  mList.mockRejectedValueOnce(new Error('Network Error'))
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  await expect(useOrderStore.getState().refreshOpenOrders(7)).resolves.toBeUndefined()
  expect(useOrderStore.getState().openOrders).toBe(known)
  warn.mockRestore()
})
