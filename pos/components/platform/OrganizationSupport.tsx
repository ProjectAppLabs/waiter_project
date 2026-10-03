'use client'

import { useEffect, useState } from 'react'

import { SupportGrantsTable } from '@/components/support/SupportGrantsTable'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { organizationSupport, requestSupport, supportEntryUrl, supportWhen, SUPPORT_MAX_HOURS, type SupportGrant } from '@/lib/services/core/support'

// Plan Y4: en la ficha del cliente, pedir acceso de soporte (el dueño lo aprueba en su consola), ver su estado y entrar
// con uno vigente. Entrar abre el POS del cliente en otra pestaña con un enlace de un solo uso.
export function OrganizationSupportPanel({ slug }: { slug: string }) {
  const [grants, setGrants] = useState<SupportGrant[] | null>(null)
  const [reason, setReason] = useState(''), [hours, setHours] = useState(24)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [version, setVersion] = useState(0)
  useEffect(() => {
    let alive = true
    organizationSupport(slug).then((g) => { if (alive) setGrants(g) }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudieron leer los accesos.') })
    return () => { alive = false }
  }, [slug, version])
  const active = grants?.find((g) => g.state === 'vigente')
  const pending = grants?.find((g) => g.state === 'pedido')
  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await task() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar.') } finally { setBusy(false) }
  }
  const ask = () => run(async () => { await requestSupport(slug, reason.trim(), hours); setReason(''); setNotice('Pedido enviado. Le avisamos al dueño para que lo apruebe.'); setVersion((v) => v + 1) })
  // La pestaña se abre antes de pedir el enlace para que el navegador no la bloquee como ventana emergente.
  const enter = () => run(async () => {
    const tab = window.open('about:blank', '_blank')
    try { const url = await supportEntryUrl(slug); if (tab) tab.location.href = url; else window.location.href = url } catch (e) { tab?.close(); throw e }
  })
  return (
    <section aria-label="Soporte" className="rounded-lg border border-border p-5 flex flex-col gap-4">
      <h2 className="text-[17px] font-semibold">Soporte</h2>
      <p className="text-[14px] text-soft">Para entrar a la consola del cliente hace falta su permiso. Todo lo que hagas queda en su Historial de cambios como soporte.</p>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      {active ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[15px]"><strong>Acceso vigente</strong> hasta {supportWhen(active.ends_at)}{active.approved_by ? `, aprobado por ${active.approved_by.name}` : ''}.</p>
          <Button variant="primary" disabled={busy} onClick={() => void enter()}>Entrar como soporte</Button>
        </div>
      ) : pending ? (
        <p className="text-[15px]">Pedido enviado {supportWhen(pending.created_at)}; esperando que el dueño lo apruebe.</p>
      ) : (
        <form className="grid gap-3 md:grid-cols-[2fr_1fr_auto] items-end" onSubmit={(e) => { e.preventDefault(); void ask() }}>
          <TextInput label="Motivo (lo ve el dueño)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <TextInput label={`Horas (máximo ${SUPPORT_MAX_HOURS})`} type="number" min={1} max={SUPPORT_MAX_HOURS} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
          <Button type="submit" disabled={busy || reason.trim().length < 5 || !(hours >= 1 && hours <= SUPPORT_MAX_HOURS)}>Pedir acceso</Button>
        </form>
      )}
      {grants && grants.length > 0 && <SupportGrantsTable grants={grants} />}
    </section>
  )
}
