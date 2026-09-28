import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { KitchenPaymentPolicyForm } from '../KitchenPaymentPolicyForm'
import { callKw } from '@/lib/services/odoo'
jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn(), inRestaurant: (d: unknown[]) => d, currentConfigId: () => null }))
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: { getState: () => ({ employee: { id: 7, token: 'employee-session' } }) } }))
it('saves per-role restrictions using the employee session and keeps menu payment mandatory', async () => {
  jest.mocked(callKw).mockResolvedValue({ require_payment_roles: [] })
  render(<KitchenPaymentPolicyForm configId={3} />)
  fireEvent.click(await screen.findByLabelText('Mesero: cobrar antes de enviar'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar permisos de cocina' }))
  await waitFor(() => expect(callKw).toHaveBeenCalledWith('pos.config', 'waiter_kitchen_policy', [[3], 7, 'employee-session', ['waiter']]))
  expect(screen.getByText(/Comensal desde el menú: siempre debe pagar primero/)).toBeInTheDocument()
})
