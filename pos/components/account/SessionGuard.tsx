'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { guardState, IDLE_MS, rememberLogoutReason, type GuardState } from '@/lib/domain/sessionGuard'
import { useAuthStore } from '@/lib/stores/authStore'

const ACTIVITY = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const
const TICK_MS = 15_000

// Plan P: cierra la sesión sola tras 15 minutos sin uso (en las pantallas de operación) y al terminar el turno del mesero
// o del cajero, con un aviso 5 minutos antes. Cerrar es lo mismo que «Cerrar sesión»: termina el turno y la sesión de Odoo.
export function SessionGuard({ idle }: { idle: boolean }) {
  const t = useTranslations('account.guard')
  const router = useRouter()
  const sessionEnds = useAuthStore((s) => s.employee?.sessionEnds ?? null)
  const active = useAuthStore((s) => !!s.employee)
  const logout = useAuthStore((s) => s.logout)
  const lastActivity = useRef(0)
  const closing = useRef(false)
  const [state, setState] = useState<GuardState>({ expired: null, warning: null, minutesLeft: 0 })

  useEffect(() => {
    if (!active) return
    lastActivity.current = Date.now()
    const touch = () => { lastActivity.current = Date.now() }
    const check = () => {
      const next = guardState(Date.now(), lastActivity.current, sessionEnds, idle ? IDLE_MS : null)
      setState((prev) => prev.expired === next.expired && prev.warning === next.warning && prev.minutesLeft === next.minutesLeft ? prev : next)
      if (next.expired && !closing.current) {
        closing.current = true
        rememberLogoutReason(next.expired)
        void logout().finally(() => { closing.current = false; router.replace('/login') })
      }
    }
    ACTIVITY.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const timer = setInterval(check, TICK_MS)
    check()
    return () => { clearInterval(timer); ACTIVITY.forEach((e) => window.removeEventListener(e, touch)) }
  }, [active, sessionEnds, idle, logout, router])

  if (!state.warning) return null
  return (
    <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-32px)] flex items-center gap-4 rounded-lg border border-border bg-surface px-5 py-3 shadow-lg">
      <p className="text-[15px] text-ink">{t(state.warning === 'shift' ? 'shiftEnding' : 'idleEnding', { minutes: state.minutesLeft })}</p>
      {/* Tocar el aviso ya cuenta como actividad; el botón lo deja claro. El fin del turno no se aplaza. */}
      {state.warning === 'idle' && <Button size="compact" onClick={() => setState({ expired: null, warning: null, minutesLeft: 0 })}>{t('stay')}</Button>}
    </div>
  )
}
