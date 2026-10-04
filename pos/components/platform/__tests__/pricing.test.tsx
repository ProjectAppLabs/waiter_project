import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { useState } from 'react'

import { ClientPricingForm, effectiveLocal, pricingSummary } from '@/components/platform/ClientPricingForm'
import { OrganizationCreditsPanel } from '@/components/platform/OrganizationCredits'
import { PriceBookView } from '@/components/platform/PriceBookView'
import { grantCredits, organizationCredits, priceBook, savePriceBook, type ClientPricing, type PriceBook } from '@/lib/services/core/platform'
import { messages } from '@/lib/i18n/messages'
import { usePlatformStore } from '@/lib/stores/platformStore'

jest.mock('@/lib/services/core/platform', () => ({ priceBook: jest.fn(), savePriceBook: jest.fn(), organizationCredits: jest.fn(), grantCredits: jest.fn() }))

const book: PriceBook = {
  local_monthly: 150000, modules: { reservas: 0 }, on_exhausted: 'cobrar',
  unit_prices: { 'asistente_menu.mensaje_ia': 0, 'asistente_whatsapp.pedido_asistente': 500 },
  whatsapp_plans: [{ key: 'inicial', name: 'Inicial', monthly_price: 50000, included: { pedido_asistente: 100 } }],
  recharge_packs: [{ key: 'pedidos_100', name: '100 pedidos', module: 'asistente_whatsapp', unit: 'pedido_asistente', quantity: 100, price: 50000 }],
}
beforeEach(() => { jest.mocked(priceBook).mockResolvedValue(book); usePlatformStore.setState({ user: { id: '1', name: 'Ana', username: 'ana', email: '', role: 'admin' } }) })

// Falla si la lista estándar no guarda el precio por local, un plan de WhatsApp nuevo o un paquete de recarga, o si
// quien solo opera la plataforma puede cambiarla.
it('edita la lista de precios estándar', async () => {
  jest.mocked(savePriceBook).mockImplementation(async (b) => b as PriceBook)
  render(<PriceBookView />)
  fireEvent.change(await screen.findByLabelText('Precio por local al mes ($)'), { target: { value: '160000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Agregar plan' }))
  const plans = screen.getByRole('region', { name: 'Planes del asistente de WhatsApp' })
  fireEvent.change(within(plans).getAllByLabelText('Nombre del plan')[1], { target: { value: 'Pro WhatsApp' } })
  fireEvent.change(within(plans).getAllByLabelText('Pedidos incluidos')[1], { target: { value: '500' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar precios' }))
  await waitFor(() => expect(savePriceBook).toHaveBeenCalled())
  const saved = jest.mocked(savePriceBook).mock.calls[0][0] as PriceBook
  expect(saved.local_monthly).toBe(160000)
  expect(saved.whatsapp_plans[1]).toEqual({ key: 'pro_whatsapp', name: 'Pro WhatsApp', monthly_price: 0, included: { pedido_asistente: 500 } })
  expect(saved.recharge_packs).toEqual(book.recharge_packs)
})
// Falla si un operador de la plataforma puede editar o guardar la lista de precios.
it('solo lectura para quien opera', async () => {
  usePlatformStore.setState({ user: { id: '1', name: 'Ana', username: 'ana', email: '', role: 'operator' } })
  render(<PriceBookView />)
  expect(await screen.findByLabelText('Precio por local al mes ($)')).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Guardar precios' })).toBeNull()
})

function Harness({ initial }: { initial: ClientPricing }) {
  const [value, setValue] = useState(initial)
  return <><ClientPricingForm value={value} onChange={setValue} book={book} /><output data-testid="value">{JSON.stringify(value)}</output></>
}
const value = () => JSON.parse(screen.getByTestId('value').textContent!) as ClientPricing

// Falla si un cliente Estándar guarda valores propios (dejaría de seguir la lista), si Personalizado no deja cambiar el
// precio por local o los pedidos incluidos de su plan, o si lo vacío no vuelve al estándar.
it('precios estándar o personalizados del cliente', () => {
  render(<Harness initial={{ mode: 'estandar', whatsapp_plan: null }} />)
  expect(screen.queryByLabelText('Precio por local al mes (COP)')).toBeNull()
  fireEvent.change(screen.getByLabelText('Plan del asistente de WhatsApp'), { target: { value: 'inicial' } })
  expect(value()).toEqual({ mode: 'estandar', whatsapp_plan: 'inicial', whatsapp: null })
  fireEvent.click(screen.getByRole('radio', { name: /Personalizado/ }))
  fireEvent.change(screen.getByLabelText('Precio por local al mes (COP)'), { target: { value: '120000' } })
  fireEvent.change(screen.getByLabelText('Pedidos incluidos al mes'), { target: { value: '300' } })
  fireEvent.change(screen.getByLabelText('Pedido de WhatsApp extra ($)'), { target: { value: '400' } })
  expect(value()).toMatchObject({ mode: 'personalizado', local_monthly: 120000, whatsapp: { monthly_price: 50000, included: { pedido_asistente: 300 } }, unit_prices: { 'asistente_whatsapp.pedido_asistente': 400 } })
  fireEvent.change(screen.getByLabelText('Pedido de WhatsApp extra ($)'), { target: { value: '' } })
  expect(value().unit_prices).toEqual({})
  fireEvent.click(screen.getByRole('radio', { name: /Estándar/ }))
  expect(value()).toEqual({ mode: 'estandar', whatsapp_plan: 'inicial' })
})

// Falla si el precio que se cobra no es el personalizado cuando lo hay, o el estándar cuando no.
it('precio por local que se aplica y resumen', () => {
  expect(effectiveLocal({ mode: 'estandar', local_monthly: 1 }, book)).toBe(150000)
  expect(effectiveLocal({ mode: 'personalizado', local_monthly: 90000 }, book)).toBe(90000)
  expect(effectiveLocal({ mode: 'personalizado' }, book)).toBe(150000)
  expect(pricingSummary({ mode: 'personalizado', local_monthly: 90000, whatsapp_plan: 'inicial' }, book)).toBe('Precios personalizados · $ 90.000 por local al mes · WhatsApp Inicial')
})

// Falla si el saldo de recargas no se ve por unidad con sus movimientos, si una cortesía se da sin motivo, o si quien
// opera puede darla.
it('saldo de recargas y cortesías', async () => {
  const credits = { balances: [{ module: 'asistente_whatsapp', unit: 'pedido_asistente', unit_name: 'Pedidos del asistente', balance: 150 }],
    movements: [{ id: 1, at: '2026-10-03T15:00:00Z', kind: 'recarga' as const, module: 'asistente_whatsapp', unit: 'pedido_asistente', quantity: 100, amount: 50000, reference: 'Cuenta 12', actor: null }] }
  jest.mocked(organizationCredits).mockResolvedValue(credits)
  jest.mocked(grantCredits).mockResolvedValue({ ...credits, balances: [{ ...credits.balances[0], balance: 200 }] })
  const { unmount } = render(<NextIntlClientProvider locale="es" messages={messages}><OrganizationCreditsPanel slug="frisby" canEdit /></NextIntlClientProvider>)
  expect(await screen.findByRole('list', { name: 'Saldo de recargas' })).toHaveTextContent('Pedidos del asistente: 150')
  expect(screen.getByRole('table', { name: 'Movimientos de recargas' })).toHaveTextContent('Recarga pagada')
  fireEvent.click(screen.getByRole('button', { name: 'Dar saldo de cortesía' }))
  const dialog = screen.getByRole('dialog', { name: 'Saldo de cortesía' })
  fireEvent.change(within(dialog).getByLabelText('Cantidad'), { target: { value: '50' } })
  expect(within(dialog).getByRole('button', { name: 'Dar saldo' })).toBeDisabled()
  fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Compensación por caída' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Dar saldo' }))
  await waitFor(() => expect(grantCredits).toHaveBeenCalledWith('frisby', { module: 'asistente_whatsapp', unit: 'pedido_asistente', quantity: 50, reason: 'Compensación por caída' }))
  expect(await screen.findByRole('list', { name: 'Saldo de recargas' })).toHaveTextContent('200')
  unmount()
  render(<OrganizationCreditsPanel slug="frisby" canEdit={false} />)
  await screen.findByRole('list', { name: 'Saldo de recargas' })
  expect(screen.queryByRole('button', { name: 'Dar saldo de cortesía' })).toBeNull()
})
