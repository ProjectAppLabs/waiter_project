import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { CustomersView } from '@/components/business/CustomersView'
import { messages } from '@/lib/i18n/messages'
import { downloadExport } from '@/lib/services/core/exports'
import { customerOrders, listCustomers, saveCustomer, type Customer } from '@/lib/services/customers'

const customer = (over: Partial<Customer>): Customer => ({ id: 1, name: 'Ana Gómez', phone: '3001112233', email: '', vat: '1020', idTypeId: null, street: '', city: '', orders: 3, invoiced: 0, ...over })
const PEOPLE = [customer({}), customer({ id: 2, name: 'Luis Pardo', phone: '', vat: '', orders: 0 }), customer({ id: 3, name: 'Empresa SAS', vat: '900', orders: 5, invoiced: 450000 })]
jest.mock('@/lib/services/customers', () => ({
  listCustomers: jest.fn(), identificationTypes: jest.fn(async () => []), customerOrders: jest.fn(async () => []),
  loyaltyCard: jest.fn(async () => null), saveCustomer: jest.fn(),
}))
jest.mock('@/lib/services/core/exports', () => ({ downloadExport: jest.fn(async () => 'clientes.csv') }))
jest.mock('@/lib/stores/toastStore', () => ({ toast: jest.fn() }))
// El formulario tiene sus propias pruebas: aquí solo importa qué hace la vista con lo que guarda.
jest.mock('@/components/customers/CustomerForm', () => ({
  CustomerForm: ({ onSave, isNew }: { onSave: (input: unknown) => Promise<void>; isNew: boolean }) => (
    <button onClick={() => void onSave({ name: 'Nuevo', phone: '', email: '', vat: '', idTypeId: null, street: '', city: '' })}>{isNew ? 'Guardar nuevo' : 'Guardar cambios'}</button>
  ),
}))

const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><CustomersView /></NextIntlClientProvider>)
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); jest.mocked(listCustomers).mockResolvedValue(PEOPLE) })
afterEach(() => jest.useRealTimers())
const settle = async () => { await act(async () => { jest.advanceTimersByTime(300) }) }

// Falla si los filtros «Con pedidos» y «Facturados» no separan a los clientes, o si la búsqueda no llega al servidor
// (con espera para no consultar en cada tecla).
it('filtra por pedidos y facturación, y busca en el servidor', async () => {
  wrap()
  await settle()
  expect(screen.getByRole('button', { name: /Ana Gómez/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Con pedidos/ }))
  expect(screen.queryByRole('button', { name: /Luis Pardo/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Facturados/ }))
  expect(screen.queryByRole('button', { name: /Ana Gómez/ })).toBeNull()
  expect(screen.getByRole('button', { name: /Empresa SAS/ })).toHaveTextContent('450.000')
  fireEvent.change(screen.getByPlaceholderText('Buscar por nombre, documento o teléfono'), { target: { value: 'emp' } })
  expect(listCustomers).not.toHaveBeenCalledWith('emp')
  await settle()
  expect(listCustomers).toHaveBeenCalledWith('emp')
})

// Falla si al elegir un cliente no se pide su historial, o si crear uno no lo deja elegido y la lista sin recargar.
it('elige un cliente y crea uno nuevo', async () => {
  jest.mocked(saveCustomer).mockResolvedValue(9)
  wrap()
  await settle()
  fireEvent.click(screen.getByRole('button', { name: /Ana Gómez/ }))
  await waitFor(() => expect(customerOrders).toHaveBeenCalledWith(1))
  fireEvent.click(screen.getByRole('button', { name: /Nuevo cliente/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nuevo' }))
  await waitFor(() => expect(saveCustomer).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Nuevo' })))
  await waitFor(() => expect(customerOrders).toHaveBeenCalledWith(9))
  expect(listCustomers).toHaveBeenCalledTimes(2)
})

// Falla si «Exportar CSV» de Clientes no pide el exporte de clientes al servidor (plan Y1).
it('exporta los clientes', async () => {
  wrap()
  await settle()
  fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }))
  await waitFor(() => expect(downloadExport).toHaveBeenCalledWith('clientes', {}))
})
