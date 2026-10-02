import { onCore } from '@/lib/domain/backend'
import type { Schedule } from '@/lib/domain/reservationHours'
import * as coreRes from '@/lib/services/core/reservations'
import { callKw } from '@/lib/services/odoo'

// El servidor siempre devuelve el horario completo: sin configurar, el anterior (10:00–22:00) repetido los siete días.
export const getSchedule = (configId: number): Promise<Schedule> => (onCore() ? coreRes.schedule<Schedule>(configId) : callKw<Schedule>('pos.config', 'waiter_reservation_schedule', [[configId]]))
export const saveSchedule = (configId: number, schedule: Schedule): Promise<Schedule> =>
  onCore() ? coreRes.saveSchedule<Schedule>(configId, schedule) : callKw<Schedule>('pos.config', 'waiter_save_reservation_schedule', [[configId], schedule])
