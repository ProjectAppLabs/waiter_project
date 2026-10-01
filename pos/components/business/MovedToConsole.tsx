'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { homePath } from '@/lib/domain/navigation'
import { effectiveRole, isOwner } from '@/lib/domain/roles'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'

// Plan Q: lo del negocio (facturación contable, clientes, retorno de inversión) se mudó a la consola del dueño. Los
// enlaces viejos del POS llevan al dueño a su sección y devuelven a cualquier otro a su inicio, sin pantalla de error.
export function MovedToConsole({ to }: { to: string }) {
  const router = useRouter()
  const { user, employee, session } = useAuthStore()
  const policy = useCatalogStore((s) => s.catalog?.settings.rolePermissions)
  useEffect(() => {
    if (!user) return
    router.replace(isOwner(user.role, employee?.role) ? to : homePath(effectiveRole(user.role, employee?.role), !!session, policy))
  }, [user, employee, session, policy, router, to])
  return null
}
