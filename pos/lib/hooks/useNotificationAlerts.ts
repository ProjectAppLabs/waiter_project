'use client'

import { useEffect, useRef } from 'react'

import { effectiveRole } from '@/lib/domain/roles'
import { zoneNoticeTargets } from '@/lib/services/floorPlan'
import { play, setStation, type SoundId } from '@/lib/audio/sounds'
import type { NotificationKind } from '@/lib/domain/notifications'
import { getNotifyPrefs, type NotifyPrefs } from '@/lib/services/employees'
import { useAuthStore } from '@/lib/stores/authStore'
import { useBusStore } from '@/lib/stores/busStore'
import { useNotificationStore } from '@/lib/stores/notificationStore'
import { toast } from '@/lib/stores/toastStore'

// Cinco segundos: la llamada es una sola y diminuta (49 KB/min con todo lo demás incluido), y es la que
// marca el ritmo de lo urgente. Los pedidos siguen releyéndose cada 10 s, pero un aviso nuevo los despierta
// en el acto, así que el sonido y la pantalla llegan juntos sin doblar el tráfico pesado.
const POLL_MS = 5_000
const POLL_WITH_BUS_MS = 60_000
const SOUND: Record<NotificationKind, SoundId> = { kitchen: 'listo', inventory: 'demora', system: 'tap', access: 'demora' }
const POPUP: Record<NotificationKind, keyof NotifyPrefs> = { kitchen: 'kitchen_popup', inventory: 'inventory_popup', system: 'system_popup', access: 'system_popup' }
const SOUND_PREF: Record<NotificationKind, keyof NotifyPrefs> = { kitchen: 'kitchen_sound', inventory: 'inventory_sound', system: 'system_sound', access: 'system_sound' }

// El mesero no vive mirando la pantalla: cuando cocina saca un plato hay que llamarle. Cada aviso nuevo
// suena y salta en pantalla según lo que el usuario tenga marcado en Ajustes › Notificaciones.
// La primera carga no suena: son los avisos que ya estaban, no novedades.
export function useNotificationAlerts() {
  const employee = useAuthStore((s) => s.employee)
  const user = useAuthStore((s) => s.user)
  const items = useNotificationStore((s) => s.items)
  const refresh = useNotificationStore((s) => s.refresh)
  const poll = useNotificationStore((s) => s.poll)
  const busUp = useBusStore((s) => s.up)
  const notifyTick = useBusStore((s) => s.ticks.notify)
  const prefs = useRef<NotifyPrefs | null>(null)
  const seen = useRef(new Set<number>())
  // Hasta que la primera carga termine no se avisa de nada: lo que ya estaba sin leer no es una novedad,
  // y sembrar con la lista vacía del arranque haría sonar todo el historial de golpe.
  const primed = useRef(false)

  useEffect(() => {
    setStation('tablet')
    primed.current = false
    seen.current = new Set()
    if (!user) { prefs.current = null; return }
    getNotifyPrefs(user.uid).then((p) => { prefs.current = p }).catch(() => undefined)
    void refresh().then(() => {
      useNotificationStore.getState().items.forEach((n) => seen.current.add(n.id))
      primed.current = true
    })
    const id = setInterval(() => void poll(), busUp ? POLL_WITH_BUS_MS : POLL_MS)
    return () => clearInterval(id)
  }, [user, refresh, poll, busUp])

  // El servidor avisa de que hay un aviso nuevo: se lee en el acto.
  useEffect(() => { if (user && notifyTick > 0) void poll() }, [notifyTick, user, poll])

  useEffect(() => {
    if (!user || !primed.current) return
    const fresh = items.filter((n) => !seen.current.has(n.id) && !n.read)
    items.forEach((n) => seen.current.add(n.id))
    if (fresh.length === 0) return
    const announce = (notices: typeof fresh) => {
      if (!notices.length) return
      const p = prefs.current, kind = notices[0].kind
      if (!p || p[SOUND_PREF[kind]]) play(SOUND[kind])
      notices.filter((n) => !p || p[POPUP[n.kind]]).slice(0, 3).forEach((n) => toast({ title: n.title, body: n.body }))
    }
    const ids = fresh.filter(n => n.resModel === 'pos.order' && n.resId).map(n => n.resId!)
    if (employee && effectiveRole(user.role, employee.role) === 'waiter' && ids.length) {
      void zoneNoticeTargets(ids).then(targets => announce(fresh.filter(n => {
        const assigned = n.resModel === 'pos.order' && n.resId ? targets[String(n.resId)] ?? [] : []
        return !assigned.length || assigned.includes(employee.id)
      }))).catch(() => announce(fresh))
    } else announce(fresh)
  }, [items, user, employee])
}
