import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TaxRegimeForm } from '@/components/settings/TaxRegimeForm'
import { taxRegime } from '@/lib/services/taxRegime'

jest.mock('@/lib/services/taxRegime', () => ({ taxRegime: jest.fn() }))

const mock = taxRegime as jest.Mock

beforeEach(() => { mock.mockReset(); mock.mockResolvedValue({ regime: 'inc', products: 22, taxes: [8] }) })

// Falla si la pantalla deja de explicar las tres situaciones reales. Un restaurante cobra INC del 8 %;
// el IVA del 19 % es solo para franquicias, y confundirlos le cuesta dinero al dueño o a su cliente.
it('offers the three regimes a Colombian restaurant can be in', async () => {
  render(<TaxRegimeForm configId={1} />)
  expect(await screen.findByText(/INC 8 %/)).toBeInTheDocument()
  expect(screen.getByText(/IVA 19 %/)).toBeInTheDocument()
  expect(screen.getByText(/No responsable/)).toBeInTheDocument()
  expect(screen.getAllByText(/franquicia/).length).toBeGreaterThan(0)
})

// Falla si desaparece el tope: son DOS condiciones a la vez, y el dueño tiene que poder comprobarlas.
it('states both conditions and the threshold in pesos', async () => {
  render(<TaxRegimeForm configId={1} />)
  expect(await screen.findByText(/3.500 UVT/)).toBeInTheDocument()
  expect(screen.getByText(/183.309.000/)).toBeInTheDocument()
  expect(screen.getByText(/un solo establecimiento/)).toBeInTheDocument()
})

// Falla si el cambio no llega al servidor: la carta seguiría cobrando lo de antes.
it('sends the chosen regime and reports what it now affects', async () => {
  mock.mockResolvedValueOnce({ regime: 'inc', products: 22, taxes: [8] })
  mock.mockResolvedValueOnce({ regime: 'none', products: 22, taxes: [] })
  render(<TaxRegimeForm configId={1} />)
  await userEvent.click(await screen.findByRole('radio', { name: /No responsable/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Guardar régimen' }))
  await waitFor(() => expect(mock).toHaveBeenCalledWith(1, 'none'))
  expect(await screen.findByRole('status')).toHaveTextContent('Régimen guardado')
})

// Falla si con la carta a medio cambiar la pantalla afirma un régimen limpio en vez de avisar.
it('warns when the menu mixes tax rates instead of claiming one', async () => {
  mock.mockResolvedValue({ regime: 'mixed', products: 22, taxes: [8, 19] })
  render(<TaxRegimeForm configId={1} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('impuestos distintos')
  expect(screen.getByRole('button', { name: 'Guardar régimen' })).toBeDisabled()
})

// Falla si un fallo del servidor (un mesero intentándolo, sin conexión) se traga en silencio.
it('shows why the change was refused', async () => {
  mock.mockResolvedValueOnce({ regime: 'inc', products: 22, taxes: [8] })
  mock.mockRejectedValueOnce(new Error('Solo un administrador puede cambiar el régimen tributario.'))
  render(<TaxRegimeForm configId={1} />)
  await userEvent.click(await screen.findByRole('radio', { name: /No responsable/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Guardar régimen' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Solo un administrador')
})
