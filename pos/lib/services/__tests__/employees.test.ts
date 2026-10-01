import { endShift, getEmployeeProfile, listPosEmployees, startMyShift } from '@/lib/services/employees'
import { callKw } from '@/lib/services/odoo'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn(), inRestaurant: (d: unknown[]) => d, currentConfigId: () => null }))
const rpc = callKw as jest.Mock

beforeEach(() => rpc.mockReset())

// Falla si el selector pierde el código WT-0001, el rol o el turno de hoy de hr.employee.
it('lists the terminal employees with code, role and today shift', async () => {
  rpc.mockResolvedValueOnce([
    { id: 2, name: 'Sofía Mesera', waiter_role: 'waiter', employee_code: 'WT-0001', shift_start: 8, shift_end: 16 },
    { id: 3, name: 'Carlos Cajero', waiter_role: 'cashier', employee_code: false, shift_start: false, shift_end: false },
  ])
  const list = await listPosEmployees(1)
  expect(rpc).toHaveBeenCalledWith('hr.employee', 'waiter_login_list', [1])
  expect(list[0]).toEqual({ id: 2, name: 'Sofía Mesera', code: 'WT-0001', role: 'waiter', shift: { from: 8, to: 16 } })
  expect(list[1]).toMatchObject({ code: null, shift: null })
})

// Falla si abrir el turno no pide al servidor el de la cuenta conectada en su restaurante, o pierde el fin de la sesión
// y el motivo de un rechazo (plan P).
it('startMyShift opens the shift of the signed-in account and maps the refusals', async () => {
  rpc.mockResolvedValueOnce({ ok: true, attendance_id: 9, token: 'tok', session_ends: '2026-10-01T22:30:00Z', config_ids: [1],
    employee: { id: 2, name: 'Sofía Mesera', waiter_role: 'waiter', employee_code: 'WT-0001', shift_start: 14, shift_end: 22, user_id: 5 } })
  expect(await startMyShift(1)).toEqual({ ok: true, attendanceId: 9, token: 'tok', sessionEnds: '2026-10-01T22:30:00Z', configIds: [1],
    employee: { id: 2, name: 'Sofía Mesera', code: 'WT-0001', role: 'waiter', shift: { from: 14, to: 22 }, userId: 5 } })
  expect(rpc).toHaveBeenCalledWith('hr.employee', 'waiter_start_my_shift', [], { config_id: 1 })
  rpc.mockResolvedValueOnce({ ok: false, reason: 'outside_hours', window: '14:00–22:00' })
  expect(await startMyShift(null)).toEqual({ ok: false, reason: 'outside_hours', window: '14:00–22:00' })
  expect(rpc).toHaveBeenLastCalledWith('hr.employee', 'waiter_start_my_shift', [], {})
})

// Falla si cerrar el turno deja de usar el método del servidor.
it('endShift calls its server method', async () => {
  rpc.mockResolvedValueOnce({ ok: true, attendance_id: 9, worked_hours: 4.25 })
  expect(await endShift(2, 'tok-demo')).toEqual({ ok: true, attendanceId: 9, workedHours: 4.25 })
  expect(rpc).toHaveBeenCalledWith('hr.employee', 'waiter_end_shift', [2, 'tok-demo'])
})

// Falla si un usuario sin RR. HH. deja el perfil sin cargar en vez de mostrar "—" en los campos privados.
it('profile degrades to nulls when the private fields are denied', async () => {
  rpc.mockImplementation(async (model: string, method: string, args: unknown[]) => {
    if ((args[1] as string[]).includes('private_street')) throw new Error('denied')
    return [{
      id: 2, name: 'Sofía Mesera', waiter_role: 'waiter', employee_code: 'WT-0001', shift_start: 8, shift_end: 16,
      work_phone: '300', mobile_phone: false, work_email: 'sofia@example.com', job_title: false,
      parent_id: [1, 'Administrator'], joining_date: '2026-01-01', employment_status: 'full_time',
    }]
  })
  expect(await getEmployeeProfile(2)).toMatchObject({
    code: 'WT-0001', phone: '300', email: 'sofia@example.com', address: null,
    joiningDate: '2026-01-01', accessRole: 'waiter', employmentStatus: 'full_time', manager: 'Administrator',
  })
})
