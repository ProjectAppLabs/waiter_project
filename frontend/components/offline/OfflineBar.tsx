'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { effectiveRole } from '@/lib/domain/roles'
import { formatCop } from '@/lib/domain/money'
import { captureCacheContext, isCurrentCacheContext } from '@/lib/offline/cache'
import { activateEmergency, clearEmergency, operatesInEmergency, useEmergency, useEmergencyOrders } from '@/lib/offline/emergency'
import { markOffline, useNetworkStore } from '@/lib/offline/network'
import { useOutboxStore, type OutboxEntry, type PaymentReview } from '@/lib/offline/outbox'
import { coreFetch } from '@/lib/services/core/http'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { cn } from '@/lib/utils'

const PROBE_MS = 8_000
const OFFLINE_READS = ['products?kind=dish&q=', 'taxes']
const OFFLINE_ROUTES = ['/pedidos', '/pedidos/nuevo', '/salon', '/salon/nuevo', '/emergencia', '/historial', '/ventas']
const clock = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

// Plan U2 y V: mientras no hay conexión, prueba el servidor cada pocos segundos; al volver, envía la cola de salida.
// Pide al navegador almacenamiento persistente para que no borre la cola si se llena el disco, y cuando todo quedó
// enviado apaga el modo de emergencia. Si la sesión venció, la cola espera a que alguien entre y luego sigue.
export function useOfflineSync() {
  const online = useNetworkStore((s) => s.online)
  const pending = useOutboxStore((s) => s.entries.length)
  const sync = useOutboxStore((s) => s.sync)
  const accountId = useAuthStore((s) => s.user?.uid ?? null)
  const router = useRouter()
  // Con red, deja listas las pantallas de la caja para abrirlas sin red (en producción las guarda el service worker).
  useEffect(() => { if (online) for (const path of OFFLINE_ROUTES) router.prefetch?.(path) }, [online, router])
  // Y las lecturas que el asistente de pedidos solo hace al llegar al menú (platos con sus combos, impuestos): así
  // quedan guardadas aunque nadie haya abierto el menú antes del corte.
  useEffect(() => { if (online && accountId !== null) for (const path of OFFLINE_READS) void coreFetch(path).catch(() => undefined) }, [online, accountId])
  useEffect(() => {
    useOutboxStore.getState().hydrate()
    useEmergencyOrders.getState().hydrate()
    useEmergencyOrders.getState().prune()
    void navigator.storage?.persist?.().catch(() => false)
  }, [])
  useEffect(() => {
    const down = () => markOffline()
    const up = () => { void coreFetch('org').catch(() => undefined) }
    window.addEventListener('offline', down)
    window.addEventListener('online', up)
    return () => { window.removeEventListener('offline', down); window.removeEventListener('online', up) }
  }, [])
  useEffect(() => {
    if (online) return
    const timer = setInterval(() => { void coreFetch('org').catch(() => undefined) }, PROBE_MS)
    return () => clearInterval(timer)
  }, [online])
  useEffect(() => { if (online && pending > 0) void sync() }, [online, pending, sync])
  useEffect(() => { if (online && pending === 0) clearEmergency() }, [online, pending])
  // Alguien volvió a entrar (cambió la cuenta, no al montar): la cola que esperaba la sesión sigue.
  const lastAccount = useRef(accountId)
  useEffect(() => {
    if (accountId !== null && accountId !== lastAccount.current) useOutboxStore.getState().resumeAfterLogin()
    lastAccount.current = accountId
  }, [accountId])
}

const describe = (t: ReturnType<typeof useTranslations>, e: OutboxEntry) => `${t(`kind.${e.kind}`)} · ${e.label}`

// El aviso fijo del modo sin conexión y de emergencia, y la lista de lo que el servidor rechazó al sincronizar.
export function OfflineBar() {
  useOfflineSync()
  const online = useNetworkStore((s) => s.online)
  const quiet = useOutboxStore((s) => s.entries.length === 0 && s.failed.length === 0 && !s.needsLogin)
  return online && quiet ? null : <OfflineStatus />
}

function OfflineStatus() {
  const t = useTranslations('pos.offline')
  const emergency = useEmergency()
  const { entries, failed, syncing, sync, discard, needsLogin } = useOutboxStore()
  const { user, employee } = useAuthStore()
  const role = user ? effectiveRole(user.role, employee?.role) : null
  const caja = operatesInEmergency(role)
  const [open, setOpen] = useState(false)
  const n = entries.length
  const context = captureCacheContext()
  const text = needsLogin ? t('needsLogin', { n })
    : emergency.active ? t('emergency', { n })
    : emergency.offline ? t('countdown', { time: clock(emergency.remainingMs), n })
    : syncing ? t('syncing', { n }) : n > 0 ? t('pending', { n }) : t('failed', { n: failed.length })
  const alarm = emergency.offline || needsLogin
  return (
    <>
      <div role="status" aria-live="polite" className={cn('fixed bottom-4 left-1/2 -translate-x-1/2 z-50 min-h-11 max-w-[94vw] pl-4 pr-2 py-1.5 rounded-full shadow-lg flex flex-wrap items-center gap-3 text-[14px] font-semibold',
        alarm ? 'bg-danger text-white' : 'bg-surface border border-border text-ink')}>
        <Icon name={emergency.active ? 'alarm' : alarm ? 'alert' : 'refresh'} size={18} />
        <span>{text}</span>
        {emergency.offline && !emergency.active && role === 'admin' && (
          <button type="button" onClick={activateEmergency} className="h-8 px-3 rounded-full border border-current">{t('activate')}</button>
        )}
        {emergency.active && caja && <Link href="/emergencia" className="h-8 px-3 rounded-full bg-white text-danger-ink grid place-items-center">{t('emergencyOrders')}</Link>}
        {needsLogin && <Link href="/login" className="h-8 px-3 rounded-full bg-white text-danger-ink grid place-items-center">{t('login')}</Link>}
        {!emergency.offline && !needsLogin && n > 0 && !syncing && <button type="button" onClick={() => void sync()} className="h-8 px-3 rounded-full bg-primary text-primary-ink">{t('retry')}</button>}
        {failed.length > 0 && <button type="button" onClick={() => setOpen(true)} className="h-8 px-3 rounded-full border border-current">{t('review', { n: failed.length })}</button>}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t('failedTitle')} size="center">
        <p className="text-[14px] text-soft">{t('failedHint')}</p>
        <ul className="mt-3 flex flex-col gap-2">
          {failed.map(({ entry, error }) => (
            <li key={entry.id} className="rounded-md border border-border p-3 flex items-start gap-3">
              {entry.kind === 'payment' || entry.kind === 'pay' ? (
                <PaymentReviewRow key={`${entry.id}:${user?.uid}:${context.organization}:${context.version}`} entry={entry} error={error} />
              ) : <>
                <div className="flex-1 min-w-0"><p className="text-[15px] font-semibold text-ink">{describe(t, entry)}</p><p className="text-[14px] text-danger-ink">{error}</p></div>
                <button type="button" onClick={() => discard(entry.id)} className="h-9 px-3 rounded-sm border border-border text-[14px] font-semibold">{t('discard')}</button>
              </>}
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}

function PaymentReviewRow({ entry, error }: { entry: Extract<OutboxEntry, { kind: 'payment' | 'pay' }>; error: string }) {
  const t = useTranslations('pos.offline')
  const [result, setResult] = useState<PaymentReview | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const generation = useRef(0)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1 } }, [])
  const orderId = useOutboxStore((s) => s.serverId(entry.order))
  const accountId = useAuthStore((s) => s.user?.uid ?? null)
  const method = useCatalogStore((s) => entry.kind === 'payment' ? s.catalog?.paymentMethods.find((m) => m.id === entry.methodId)?.name : null)
  const run = async (confirm: boolean) => {
    if (inFlight.current) return
    inFlight.current = true
    const revision = ++generation.current
    const context = captureCacheContext()
    setBusy(true)
    setResult(null)
    setMessage('')
    const current = () => mounted.current && revision === generation.current && isCurrentCacheContext(context)
      && accountId === (useAuthStore.getState().user?.uid ?? null)
    try {
      const state = useOutboxStore.getState()
      const fresh = await (confirm ? state.confirmReview(entry.id) : state.review(entry.id))
      if (current()) setResult(fresh)
    } catch (e) {
      if (current()) setMessage(e instanceof Error ? e.message : t('reviewUnavailable'))
    } finally {
      inFlight.current = false
      if (current()) setBusy(false)
    }
  }
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2">
      <p className="text-[15px] font-semibold text-ink">{describe(t, entry)}</p>
      <p className="text-[14px] text-soft">{t('reviewOrder', { id: orderId ?? ('uuid' in entry.order ? entry.order.uuid : entry.order.id) })}</p>
      {entry.kind === 'payment' && <>
        <p className="text-[14px] text-soft">{method || t('reviewMethod', { id: entry.methodId })} · {t('reviewReference', { reference: entry.reference || t('reviewNoReference') })}</p>
        <p className="text-[14px] text-soft">{typeof entry.amount === 'number' ? t('reviewAmount', { amount: formatCop(entry.amount) }) : t('reviewUnknownAmount')}</p>
      </>}
      <p className="text-[14px] text-danger-ink">{error}</p>
      <p className="text-[14px] text-soft">{t('reviewProofHint')}</p>
      {result && <div className="rounded-md bg-muted p-2 text-[14px] flex flex-col gap-1" aria-label={t('reviewServer')}>
        <p>{t('reviewServerOrder', { number: result.order.number, balance: formatCop(Math.max(0, result.order.total - result.order.paid)) })}</p>
        {result.order.payments.map((payment) => <p key={payment.id}>{payment.method} · $ {formatCop(payment.amount)} · {payment.reference || t('reviewNoReference')}</p>)}
        {!result.canConfirm && <p>{t('reviewNoProof')}</p>}
      </div>}
      {message && <p role="alert" className="text-[14px] text-danger-ink">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void run(false)} className="min-h-11 px-3 rounded-sm border border-border text-[14px] disabled:opacity-50">{busy ? t('reviewBusy') : t('reviewConsult')}</button>
        {result?.canConfirm && <button type="button" disabled={busy} onClick={() => void run(true)} className="min-h-11 px-3 rounded-sm bg-primary text-primary-ink text-[14px] disabled:opacity-50">
          {entry.kind === 'payment' ? t('reviewConfirm') : result.order.state === 'paid' ? t('reviewResolveClosing') : t('reviewResumeClosing')}
        </button>}
      </div>
    </div>
  )
}

// Plan V: en emergencia la tableta de un mesero no toma pedidos ni cobra; dice a dónde ir.
export function EmergencyLock() {
  const emergency = useEmergency()
  const { user, employee } = useAuthStore()
  const role = user ? effectiveRole(user.role, employee?.role) : null
  if (!emergency.active || !role || operatesInEmergency(role)) return null
  return <EmergencyLockScreen />
}

function EmergencyLockScreen() {
  const t = useTranslations('pos.offline')
  return (
    <div role="alertdialog" aria-modal="true" aria-label={t('lockTitle')} className="fixed inset-0 z-[60] bg-overlay/80 grid place-items-center p-6">
      <div className="max-w-md rounded-xl bg-surface p-6 flex flex-col items-center gap-3 text-center">
        <span className="w-14 h-14 rounded-full bg-danger text-white grid place-items-center"><Icon name="alarm" size={28} /></span>
        <h2 className="text-[22px] font-semibold text-ink">{t('lockTitle')}</h2>
        <p className="text-[16px] text-soft">{t('lockBody')}</p>
      </div>
    </div>
  )
}
