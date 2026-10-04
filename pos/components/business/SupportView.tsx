'use client'

import { useEffect, useState } from 'react'

import { SupportGrantsTable } from '@/components/support/SupportGrantsTable'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TextInput } from '@/components/ui/Field'
import { approveSupport, grantSupport, listSupport, revokeSupport, SUPPORT_MAX_HOURS, type SupportGrant } from '@/lib/services/core/support'
import { useAuthStore } from '@/lib/stores/authStore'

// Plan Y4: el dueño decide si ProjectApp puede entrar a ver lo que él ve, por cuánto tiempo, y lo quita cuando quiera.
// Todo lo que haga el soporte queda en el Historial de cambios.
export function SupportView() {
  const inSupport = !!useAuthStore((s) => s.support)
  const [grants, setGrants] = useState<SupportGrant[] | null>(null)
  const [hours, setHours] = useState(24), [reason, setReason] = useState('')
  const [revoking, setRevoking] = useState<SupportGrant | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [version, setVersion] = useState(0)
  useEffect(() => {
    let alive = true
    listSupport().then((g) => { if (alive) setGrants(g) }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudieron leer los accesos.') })
    return () => { alive = false }
  }, [version])
  const act = async (run: () => Promise<unknown>, done: string) => {
    setBusy(true); setError(''); setNotice('')
    try { await run(); setNotice(done); setVersion((v) => v + 1) } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar.') } finally { setBusy(false) }
  }
  const validHours = Number.isInteger(hours) && hours >= 1 && hours <= SUPPORT_MAX_HOURS
  return (
    <section className="max-w-5xl flex flex-col gap-5">
      <div><h1 className="text-[26px] font-bold">Soporte de ProjectApp</h1>
        <p className="mt-1 text-soft">Con tu permiso, ProjectApp puede entrar a tu consola para ayudarte. Ve lo mismo que tú, no puede cambiar tu contraseña ni ver las claves de tus pasarelas, y todo lo que haga queda en el Historial de cambios.</p></div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      {/* Una sesión de soporte no puede dar más accesos de soporte: el servidor lo rechaza y aquí ni se ofrece. */}
      {!inSupport && (
        <form aria-label="Dar acceso de soporte" className="rounded-lg border border-border p-5 grid gap-4 md:grid-cols-[1fr_2fr_auto] items-end" onSubmit={(e) => { e.preventDefault(); void act(() => grantSupport(hours, reason.trim()), `Acceso dado por ${hours} horas.`).then(() => setReason('')) }}>
          <TextInput label={`Horas (máximo ${SUPPORT_MAX_HOURS})`} type="number" min={1} max={SUPPORT_MAX_HOURS} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
          <TextInput label="Motivo" value={reason} placeholder="Ej.: revisar el cierre de caja de ayer" onChange={(e) => setReason(e.target.value)} />
          <Button type="submit" variant="primary" disabled={busy || !validHours}>Dar acceso</Button>
        </form>
      )}
      {grants === null ? !error && <p role="status" className="text-soft">Leyendo los accesos…</p> : (
        <SupportGrantsTable grants={grants} actions={(g) => inSupport ? null : <>
          {g.state === 'pedido' && <Button size="compact" variant="primary" disabled={busy} onClick={() => void act(() => approveSupport(g.id), 'Acceso aprobado.')}>Aprobar</Button>}
          {(g.state === 'pedido' || g.state === 'vigente') && <Button size="compact" disabled={busy} onClick={() => setRevoking(g)}>{g.state === 'pedido' ? 'Rechazar' : 'Quitar'}</Button>}
        </>} />
      )}
      <ConfirmDialog open={!!revoking} title={revoking?.state === 'pedido' ? '¿Rechazar el pedido de soporte?' : '¿Quitar el acceso de soporte?'} destructive confirmLabel={revoking?.state === 'pedido' ? 'Rechazar' : 'Quitar'} cancelLabel="Cancelar"
        body="Si ProjectApp tiene una sesión abierta, se cierra al instante."
        onCancel={() => setRevoking(null)} onConfirm={() => { const g = revoking; setRevoking(null); if (g) void act(() => revokeSupport(g.id), 'Acceso quitado.') }} />
    </section>
  )
}
