'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { GenericCode } from '@/components/templates/generic/GenericCode'
import { CODE_PATTERNS } from '@/components/templates/registry'
import { pathFor } from '@/lib/domain/route'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Entry } from '@/lib/types'

// Verificar el código (cuenta/codigo): en demo cualquier código de seis dígitos verifica. Sin registro pendiente no hay nada que verificar.
export function Code({ rest, venue, token }: { entry: Entry; rest: string; venue: string; token: string | null; id: string | null }) {
  const t = useTranslations('diner.account.code')
  const router = useRouter()
  const store = useDinerStore()
  const { pendingAccount, verify, resendCode, busy, error } = store
  const template = store.template ?? DEFAULT_TEMPLATE
  const Pattern = CODE_PATTERNS[template.layouts?.codigo] ?? GenericCode
  const go = (screen: Parameters<typeof pathFor>[3]) => router.push(pathFor(rest, venue, token, screen))
  if (!pendingAccount) {
    return (
      <section className="px-[18px] pt-[22px] flex flex-col items-start gap-4 text-t-tinta">
        <p className="text-base text-t-tinta-suave">{t('noPending')}</p>
        <button type="button" onClick={() => go('cuenta/registro')} className="h-tap px-6 rounded-t-boton bg-t-acento text-t-acento-tinta text-base font-medium">{t('start')}</button>
      </section>
    )
  }
  return (
    <Pattern
      template={template} email={pendingAccount.form.correo} busy={busy} error={error ?? null}
      onVerify={(code) => void verify(code).then((ok) => { if (ok) go('cuenta') })}
      onResend={() => void resendCode()} onOtherChannel={() => undefined} onBack={() => go('cuenta/registro')}
    />
  )
}
