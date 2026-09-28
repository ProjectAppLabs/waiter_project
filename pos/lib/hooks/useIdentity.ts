'use client'

import { useMemo } from 'react'

import { effectiveRole, isOwner, type Role } from '@/lib/domain/roles'
import { useAuthStore } from '@/lib/stores/authStore'

export interface Identity { name: string; firstName: string; role: Role; owner: boolean }

// Quién está usando la tablet ahora mismo: el empleado que marcó su PIN manda sobre la credencial del terminal,
// tanto para el nombre que se saluda como para los permisos. Misma regla que la barra superior.
export function useIdentity(): Identity {
  const user = useAuthStore((s) => s.user)
  const employee = useAuthStore((s) => s.employee)
  return useMemo(() => {
    const name = employee?.name ?? user?.name ?? ''
    return { name, firstName: name.split(' ')[0] ?? '', role: effectiveRole(user?.role, employee?.role), owner: isOwner(user?.role, employee?.role) }
  }, [user, employee])
}
