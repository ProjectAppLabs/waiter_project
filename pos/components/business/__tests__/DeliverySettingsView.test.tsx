import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { DeliverySettingsView } from '@/components/business/DeliverySettingsView'
import { deliverySettings, saveDeliverySettings, type RestaurantDelivery } from '@/lib/services/core/delivery'

jest.mock('@/lib/services/core/delivery', () => ({ deliverySettings: jest.fn(), saveDeliverySettings: jest.fn() }))

const SEDE: RestaurantDelivery = { restaurant_id: 25, name: 'El Poblado', has_location: true,
  settings: { enabled: true, radius_km: 5, tiers: [{ up_to_km: 2, fee: 4000 }, { up_to_km: 5, fee: 6000 }], min_order: 20000, methods: ['online'], notes: '',
    fee_mode: 'distance', flat_fee: 0, free_from: 0, markup_percent: 0 } }
beforeEach(() => jest.clearAllMocks())

// Falla si el dueño no puede ajustar tramos, métodos y mínimo de una sede, o si lo que guarda no es lo que vio.
it('guarda los domicilios de una sede', async () => {
  jest.mocked(deliverySettings).mockResolvedValue([SEDE])
  jest.mocked(saveDeliverySettings).mockImplementation(async (_, s) => s)
  render(<DeliverySettingsView />)
  const form = await screen.findByRole('form', { name: 'Domicilios de El Poblado' })
  fireEvent.click(within(form).getByLabelText(/Efectivo contra entrega/))
  fireEvent.change(within(form).getByLabelText('Envío ($) · tramo 2'), { target: { value: '7000' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(saveDeliverySettings).toHaveBeenCalledWith(25, expect.objectContaining({
    methods: ['online', 'cash'], tiers: [{ up_to_km: 2, fee: 4000 }, { up_to_km: 5, fee: 7000 }], min_order: 20000, radius_km: 5 })))
  expect(await within(form).findByText('Guardado.')).toBeInTheDocument()
})

// Falla si se puede activar sin ubicación de la sede, sin métodos de pago o con tramos que no llegan al radio.
it('no deja guardar una configuración que no sirve', async () => {
  jest.mocked(deliverySettings).mockResolvedValue([{ ...SEDE, has_location: false }])
  render(<DeliverySettingsView />)
  const form = await screen.findByRole('form', { name: 'Domicilios de El Poblado' })
  expect(within(form).getByText(/Ubica la sede en el mapa/, { selector: '[role=alert]' })).toBeInTheDocument()
  expect(within(form).getByRole('button', { name: 'Guardar' })).toBeDisabled()
  fireEvent.click(within(form).getByLabelText(/Hacer domicilios/))
  expect(within(form).getByRole('button', { name: 'Guardar' })).toBeEnabled()
})

// Falla si los tramos que no llegan al radio o la falta de métodos de pago pasan sin aviso.
it('valida tramos y métodos', async () => {
  jest.mocked(deliverySettings).mockResolvedValue([SEDE])
  render(<DeliverySettingsView />)
  const form = await screen.findByRole('form', { name: 'Domicilios de El Poblado' })
  fireEvent.change(within(form).getByLabelText('Radio máximo (km)'), { target: { value: '8' } })
  expect(within(form).getByText('El último tramo debe llegar hasta el radio.')).toBeInTheDocument()
  fireEvent.change(within(form).getByLabelText('Radio máximo (km)'), { target: { value: '5' } })
  fireEvent.click(within(form).getByLabelText(/Pago en línea/))
  expect(within(form).getByText('Activa al menos un método de pago.')).toBeInTheDocument()
  fireEvent.click(within(form).getByRole('button', { name: 'Agregar tramo' }))
  expect(within(form).getByLabelText('Hasta (km) · tramo 3')).toHaveValue(7)
})

// Falla si el dueño no puede escoger tarifa fija o envío gratis con recargo y «gratis desde», si la tarifa fija en cero
// pasa sin aviso o si no se le explica cómo verá el cliente los precios con recargo.
it('escoge cómo se cobra el envío', async () => {
  jest.mocked(deliverySettings).mockResolvedValue([SEDE])
  jest.mocked(saveDeliverySettings).mockImplementation(async (_, s) => s)
  render(<DeliverySettingsView />)
  const form = await screen.findByRole('form', { name: 'Domicilios de El Poblado' })
  fireEvent.click(within(form).getByLabelText(/Tarifa fija/))
  expect(within(form).queryByLabelText('Envío ($) · tramo 1')).toBeNull()
  expect(within(form).getByText(/Escribe el valor de la tarifa fija/)).toBeInTheDocument()
  fireEvent.change(within(form).getByLabelText('Tarifa fija del envío ($)'), { target: { value: '5000' } })
  fireEvent.change(within(form).getByLabelText('Envío gratis desde ($ en platos, 0 = no)'), { target: { value: '60000' } })
  fireEvent.click(within(form).getByLabelText(/^Gratis/))
  expect(within(form).queryByLabelText('Envío gratis desde ($ en platos, 0 = no)')).toBeNull()
  fireEvent.change(within(form).getByLabelText('Recargo en los platos a domicilio (%)'), { target: { value: '8' } })
  expect(within(form).getByText(/se verá a \$ 32\.400/)).toBeInTheDocument()
  fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(saveDeliverySettings).toHaveBeenCalledWith(25, expect.objectContaining({ fee_mode: 'free', flat_fee: 5000, markup_percent: 8 })))
})
