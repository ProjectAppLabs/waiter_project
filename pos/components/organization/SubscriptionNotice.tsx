'use client'

import { useEffect, useState } from 'react'

import { formatCop } from '@/lib/domain/money'
import { subscription, type Subscription } from '@/lib/services/core/business'

// Contrato M: si la cuenta de Waiter del mes está vencida, el dueño lo ve arriba de su consola con cuándo se suspende.
export function SubscriptionNotice() {
  const [sub, setSub] = useState<Subscription | null>(null)
  useEffect(() => { let alive = true; subscription().then((s) => { if (alive) setSub(s) }).catch(() => undefined); return () => { alive = false } }, [])
  if (!sub || sub.overdue <= 0) return null
  return (
    <p role="alert" className="mb-5 rounded-lg border border-danger bg-danger-soft text-danger-ink px-4 py-3 text-[15px]">
      Tu suscripción de Waiter tiene $ {formatCop(Math.round(sub.overdue))} vencidos.{sub.suspend_on ? ` Si no se registra el pago, la cuenta se suspende el ${sub.suspend_on}.` : ''} Escribe a ProjectApp para pagar.
    </p>
  )
}
