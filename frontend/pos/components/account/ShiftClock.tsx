'use client'

import { useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { formatElapsed } from '@/lib/domain/employees'
import { cn } from '@/lib/utils'

// Cronómetro de la tarjeta "Tiempo" del modal Setting: cuenta desde el check_in de la asistencia (rojo mientras corre).
export function ShiftClock({ checkIn }: { checkIn: string | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!checkIn) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [checkIn])
  const elapsed = checkIn ? formatElapsed(now - new Date(checkIn).getTime()) : '00:00:00'
  return (
    <span className={cn('inline-flex items-center gap-1 text-[13px] font-semibold tabular-nums', checkIn ? 'text-danger-ink' : 'text-ink')}>
      <Icon name="alarm" size={14} /><span data-testid="shift-clock">{elapsed}</span>
    </span>
  )
}
