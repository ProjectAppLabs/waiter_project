import { listPeople } from '@/lib/services/team'
import { callKw } from '@/lib/services/odoo'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn() }))
const rpc = callKw as jest.Mock

// Falla si la persona que ya entra (como `admin`, que nunca activó por código) sale con la invitación pendiente, o si
// quien aún no pone su contraseña sale activa.
it('distingue la invitación pendiente de la cuenta que ya entra', async () => {
  rpc.mockResolvedValueOnce([
    { id: 1, name: 'Administrator', waiter_role: 'owner', waiter_config_ids: [], shift_start: 0, shift_end: 0, user_id: [2, 'Administrator'], work_email: false },
    { id: 9, name: 'Nueva', waiter_role: 'waiter', waiter_config_ids: [1], shift_start: 14, shift_end: 22, user_id: [12, 'Nueva'], work_email: 'nueva@x.co' },
    { id: 5, name: 'Sin cuenta', waiter_role: 'waiter', waiter_config_ids: [1], shift_start: 0, shift_end: 0, user_id: false, work_email: false },
  ]).mockResolvedValueOnce([
    { id: 2, login: 'admin', email: false, waiter_activated: false, login_date: '2026-10-01 12:00:00' },
    { id: 12, login: 'nueva', email: 'nueva@x.co', waiter_activated: false, login_date: false },
  ])
  const [admin, nueva, sin] = await listPeople()
  expect(admin).toMatchObject({ username: 'admin', status: 'active' })
  expect(nueva).toMatchObject({ username: 'nueva', email: 'nueva@x.co', status: 'pending', shift: { from: 14, to: 22 } })
  expect(sin.status).toBe('no_account')
})
