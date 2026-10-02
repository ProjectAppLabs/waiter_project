import { act } from '@testing-library/react'

import { newLine } from '@/lib/domain/orderWizard'
import { fireUnsentLines } from '@/lib/services/kitchen'
import { createKitOrder } from '@/lib/services/orderCreate'
import { currentStep, useOrderWizardStore } from '@/lib/stores/orderWizardStore'

jest.mock('@/lib/services/orderCreate', () => ({ createKitOrder: jest.fn() }))
jest.mock('@/lib/services/kitchen', () => ({ fireUnsentLines: jest.fn() }))
jest.mock('@/lib/services/productOptions', () => ({ loadMenuExtras: jest.fn(), loadTaxes: jest.fn() }))
const mCreate = createKitOrder as jest.Mock
const angus = { id: 3, templateId: 3, name: 'Hamburguesa Angus', price: 36900, categoryIds: [1], taxIds: [55], favorite: true, storable: false, soldOut: false, hasImage: true }
const labels = { babyChair: '[Silla de bebé]', delivery: (a: string, p: string) => `[Domicilio: ${a} · ${p}]` }

beforeEach(() => { jest.clearAllMocks(); useOrderWizardStore.getState().reset() })

// Falla si cambiar de tipo no vuelve al primer paso o si los pasos no siguen al tipo elegido.
it('steps follow the order type and changing type restarts the wizard', () => {
  act(() => { useOrderWizardStore.getState().next(); useOrderWizardStore.getState().next() })
  expect(currentStep(useOrderWizardStore.getState())).toBe('menu')
  act(() => useOrderWizardStore.getState().setInfo({ type: 'takeAway' }))
  expect(useOrderWizardStore.getState().stepIndex).toBe(0)
  act(() => { useOrderWizardStore.getState().next(); useOrderWizardStore.getState().next(); useOrderWizardStore.getState().next(); useOrderWizardStore.getState().next() })
  expect(currentStep(useOrderWizardStore.getState())).toBe('payment')
})

// Falla si el pedido en mesa se crea sin la mesa o sin la nota de silla de bebé en la nota.
it('createOrder sends preset, table and baby chair note and keeps the created order', async () => {
  mCreate.mockResolvedValue({ id: 40, reference: '260-1-000040', trackingNumber: '40', total: 43911, tax: 7011 })
  act(() => { useOrderWizardStore.getState().setInfo({ babyChair: true, name: 'Zahir' }); useOrderWizardStore.getState().setTable(9); useOrderWizardStore.getState().add(newLine(angus, 1, 'sin cebolla', [])) })
  const created = await act(() => useOrderWizardStore.getState().createOrder(16, labels))
  expect(created?.id).toBe(40)
  expect(mCreate.mock.calls[0][0]).toMatchObject({ type: 'dineIn', tableId: 9, note: '[Silla de bebé]', name: 'Zahir' })
  expect(useOrderWizardStore.getState().created?.trackingNumber).toBe('40')
})

// Falla si un error del servidor deja el wizard ocupado o si enviar a cocina no dispara el curso.
it('errors release busy and fireKitchen fires the unsent lines', async () => {
  mCreate.mockRejectedValue(new Error('Invalid preset'))
  act(() => useOrderWizardStore.getState().add(newLine(angus, 1, '', [])))
  await act(() => useOrderWizardStore.getState().createOrder(16, labels))
  expect(useOrderWizardStore.getState()).toMatchObject({ busy: false, error: 'Invalid preset', created: null })
  ;(fireUnsentLines as jest.Mock).mockResolvedValue(5)
  await act(() => useOrderWizardStore.getState().fireKitchen(40))
  expect(fireUnsentLines).toHaveBeenCalledWith(40)
})

// Falla si reintentar cocina crea un segundo pedido.
it('retries a failed kitchen dispatch without creating a duplicate order', async () => {
  mCreate.mockResolvedValue({ id: 40, reference: '40', trackingNumber: '40', total: 100, tax: 0 })
  await useOrderWizardStore.getState().createOrder(16, labels)
  ;(fireUnsentLines as jest.Mock).mockRejectedValueOnce(new Error('Cocina no responde'))
  expect(await useOrderWizardStore.getState().fireKitchen(40)).toBe(false)
  expect((await useOrderWizardStore.getState().createOrder(16, labels))?.id).toBe(40)
  expect(mCreate).toHaveBeenCalledTimes(1)
})
