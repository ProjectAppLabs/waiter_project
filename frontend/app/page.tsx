'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { homePath } from '@/lib/domain/navigation'
import { effectiveRole } from '@/lib/domain/roles'
import { useAuthStore } from '@/lib/stores/authStore'

// Entrada de la app (también el `start_url` de la app instalada en la tablet). Antes mandaba siempre a Mesas; ahora cada
// rol va a su pantalla de inicio (`homePath`): el administrador a Inicio. Sin sesión, al login.
export default function Home() {
  const router = useRouter()
  const { user, session, employee, hydrated, hydrate } = useAuthStore()
  useEffect(() => { if (!hydrated) void hydrate() }, [hydrated, hydrate])
  useEffect(() => {
    if (!hydrated) return
    if (!user || !employee) { router.replace('/login'); return }
    router.replace(homePath(effectiveRole(user.role, employee.role), session !== null))
  }, [hydrated, user, employee, session, router])
  return null
}
