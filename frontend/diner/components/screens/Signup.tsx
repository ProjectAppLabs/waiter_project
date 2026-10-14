'use client'

import { useRouter } from 'next/navigation'

import { GenericSignup } from '@diner/components/templates/generic/GenericSignup'
import { SIGNUP_PATTERNS } from '@diner/components/templates/registry'
import { pathFor } from '@diner/lib/domain/route'
import { DEFAULT_TEMPLATE } from '@diner/lib/domain/template'
import { useDinerStore } from '@diner/lib/stores/dinerStore'
import type { Entry } from '@diner/lib/types'

// Crear cuenta (cuenta/registro): dos campos y sin contraseña. Si experience creó la cuenta pendiente, se pasa a verificar el código.
export function Signup({ rest, venue, token }: { entry: Entry; rest: string; venue: string; token: string | null; id: string | null }) {
  const router = useRouter()
  const store = useDinerStore()
  const { register, busy, error } = store
  const template = store.template ?? DEFAULT_TEMPLATE
  const Pattern = SIGNUP_PATTERNS[template.layouts?.registro] ?? GenericSignup
  const go = (screen: Parameters<typeof pathFor>[3]) => router.push(pathFor(rest, venue, token, screen))
  return (
    <Pattern
      template={template} busy={busy} error={error ?? null} discountPct={template.descuento?.porcentaje ?? 5}
      onSubmit={(form) => void register(form).then((id) => { if (id) go('cuenta/codigo') })}
      onSkip={() => go('pago')}
    />
  )
}
