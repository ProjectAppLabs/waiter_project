import { cn, initials } from '@/lib/utils'

// Las cuentas no tienen foto de perfil; se muestran las iniciales de la persona.
export function EmployeeAvatar({ name, size = 44, className }: { id: number; name: string; size?: number; className?: string }) {
  return <span style={{ width: size, height: size }} className={cn('shrink-0 rounded-md bg-primary-soft text-primary grid place-items-center font-semibold', className)}>{initials(name)}</span>
}
