'use client'

import Link from 'next/link'
import { effectiveRole } from '@/lib/domain/roles'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { AmountInput, popDigit, pushDigit } from '@/components/cash/AmountInput'
import { AuroraBackground } from '@/components/kit/Aurora'
import { Icon } from '@/components/kit/Icon'
import { NumericKeypad } from '@/components/kit/NumericKeypad'
import { Button } from '@/components/ui/Button'
import { Select, TextInput } from '@/components/ui/Field'
import { listConfigs, type RegisterConfig } from '@/lib/services/cashRegister'
import { useAuthStore } from '@/lib/stores/authStore'

// Inicio del turno: cuenta el efectivo, abre la caja. Vive fuera del gate porque es justo lo que el gate exige.
// Estructura del pago en efectivo del kit (Payment / Cash / Pay.png): datos a la izquierda, importe y teclado a la derecha.
export default function CajaPage() {
  const t = useTranslations('cash.open')
  const router = useRouter()
  const { user, employee, session, hydrated, hydrate, openRegister } = useAuthStore()
  const [configs, setConfigs] = useState<RegisterConfig[]>([])
  const [configId, setConfigId] = useState<number | null>(null)
  const [cash, setCash] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { void hydrate() }, [hydrate])
  useEffect(() => {
    if (!hydrated) return
    if (!user) { router.replace('/login'); return }
    if (!employee) { router.replace('/login'); return }
    if (session) { router.replace('/salon'); return }
    void listConfigs().then((c) => { setConfigs(c); setConfigId((id) => id ?? c[0]?.id ?? null) })
  }, [hydrated, user, employee, session, router])

  async function open() {
    if (configId === null) return
    setBusy(true)
    try { await openRegister(configId, Number(cash || '0'), notes); router.replace('/salon') } finally { setBusy(false) }
  }
  if (!hydrated || !user || !employee || session) return null
  return (
    <main className="pos-ambient min-h-screen grid place-items-center text-ink p-6">
      <AuroraBackground />
      <form onSubmit={(e) => { e.preventDefault(); void open() }} className="w-[900px] max-w-full rounded-xl bg-surface border border-border shadow-xl overflow-hidden flex flex-col">
        <header className="h-[72px] px-6 flex items-center gap-3 border-b border-border">
          <span className="w-9 h-9 rounded-md bg-primary text-primary-ink grid place-items-center font-semibold">W</span>
          <span className="text-[20px] font-semibold">{t('title')}</span>
          <span className="ml-auto text-[14px] text-soft">{t('user', { name: user.name })}</span>
        </header>
        <div className="flex">
          <section className="w-[400px] shrink-0 p-6 border-r border-border flex flex-col gap-4">
            <p className="text-[15px] text-soft leading-relaxed">{t('body')}</p>
            {effectiveRole(user.role, employee.role) === 'admin' && <Link href="/dashboard" className="rounded-md border border-primary p-3 text-primary font-semibold">Entrar a administración sin abrir caja</Link>}
            <Select label={t('config')} value={configId ?? ''} onChange={(e) => setConfigId(Number(e.target.value))}>{configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            <TextInput label={t('notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </section>
          <section className="flex-1 p-6 flex flex-col items-center gap-3">
            <p className="text-[18px] font-semibold">{t('inputTitle')}</p>
            <p className="text-[13px] text-soft">{t('inputBody')}</p>
            <AmountInput label={t('openingCash')} value={cash} onChange={setCash} />
            <NumericKeypad onDigit={(d) => setCash((v) => pushDigit(v, d))} onBackspace={() => setCash(popDigit)} />
            <Button type="submit" variant="primary" size="money" className="w-full max-w-[420px] mt-2" disabled={busy || configId === null}><Icon name="cash" size={20} />{busy ? t('opening') : t('submit')}</Button>
          </section>
        </div>
      </form>
    </main>
  )
}
