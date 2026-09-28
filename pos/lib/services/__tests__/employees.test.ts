import { changePin, checkPin, endShift, forgotPin, getEmployeeProfile, listPosEmployees } from '@/lib/services/employees'
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

// Falla si el PIN se compara en el cliente en vez de en `waiter_check_pin`, o si el bloqueo se lee como error genérico.
it('checkPin delegates to the server and maps every refusal', async () => {
  rpc.mockResolvedValueOnce({ ok: true, attendance_id: 9, employee: { id: 2, name: 'Sofía Mesera', waiter_role: 'waiter', employee_code: 'WT-0001', shift_start: 8, shift_end: 16, user_id: false } })
  const ok = await checkPin(2, '123456')
  expect(rpc).toHaveBeenCalledWith('hr.employee', 'waiter_check_pin', [2, '123456'])
  expect(ok).toMatchObject({ ok: true, attendanceId: 9, employee: { id: 2, userId: null } })
  rpc.mockResolvedValueOnce({ ok: false, reason: 'wrong', attempts_left: 3 })
  expect(await checkPin(2, '000000')).toEqual({ ok: false, reason: 'wrong', attemptsLeft: 3 })
  rpc.mockResolvedValueOnce({ ok: false, reason: 'locked', locked_until: '2026-09-06 10:10:00' })
  expect(await checkPin(2, '000000')).toEqual({ ok: false, reason: 'locked', lockedUntil: '2026-09-06 10:10:00' })
})

// Falla si cambiar el PIN, pedirlo por correo o cerrar el turno dejan de usar los métodos del servidor.
it('changePin, forgotPin and endShift call their server methods', async () => {
  rpc.mockResolvedValue(true)
  await changePin(2, '654321', 'tok-demo')
  expect(rpc).toHaveBeenCalledWith('hr.employee', 'waiter_change_pin', [2, '654321', 'tok-demo'])
  await forgotPin('sofia.mesera@example.com')
  expect(rpc).toHaveBeenCalledWith('hr.employee', 'waiter_forgot_pin', ['sofia.mesera@example.com'])
  rpc.mockResolvedValueOnce({ ok: true, attendance_id: 9, worked_hours: 4.25 })
  expect(await endShift(2, 'tok-demo')).toEqual({ ok: true, attendanceId: 9, workedHours: 4.25 })
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
