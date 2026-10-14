import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { KitchenPaymentPolicyForm } from '../KitchenPaymentPolicyForm'
import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ coreFetch: jest.fn() }))
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: { getState: () => ({ employee: { id: 7, token: 'employee-session' } }) } }))
// Falla si la política no se guarda por rol o deja de exigir pago al comensal.
it('saves per-role restrictions using the employee session and keeps menu payment mandatory', async () => {
  jest.mocked(coreFetch).mockResolvedValue({ restaurant: { kitchen_prepay_roles: [] } })
  render(<KitchenPaymentPolicyForm configId={3} />)
  fireEvent.click(await screen.findByLabelText('Mesero: cobrar antes de enviar'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar permisos de cocina' }))
  await waitFor(() => expect(coreFetch).toHaveBeenCalledWith('settings?restaurant_id=3', { method: 'PATCH', body: { kitchen_prepay_roles: ['waiter'] } }))
  expect(screen.getByText(/Comensal desde el menú: siempre debe pagar primero/)).toBeInTheDocument()
})
