import type { Schedule } from '@/lib/domain/reservationHours'
import * as coreRes from '@/lib/services/core/reservations'

// El servidor siempre devuelve el horario completo: sin configurar, el anterior (10:00–22:00) repetido los siete días.
export const getSchedule = (configId: number): Promise<Schedule> => (coreRes.schedule<Schedule>(configId))
export const saveSchedule = (configId: number, schedule: Schedule): Promise<Schedule> =>
  coreRes.saveSchedule<Schedule>(configId, schedule)
