'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { coreFetch } from '@/lib/services/core/http'
import { markOffline, useNetworkStore } from '@/lib/offline/network'
import { useOutboxStore, type OutboxEntry } from '@/lib/offline/outbox'
import { cn } from '@/lib/utils'

const PROBE_MS = 8_000

// Plan U2: mientras no hay conexión, prueba el servidor cada pocos segundos; al volver, envía la cola de salida.
export function useOfflineSync() {
  const online = useNetworkStore((s) => s.online)
  const pending = useOutboxStore((s) => s.entries.length)
  const sync = useOutboxStore((s) => s.sync)
  useEffect(() => { useOutboxStore.getState().hydrate() }, [])
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
}

const describe = (t: ReturnType<typeof useTranslations>, e: OutboxEntry) => `${t(`kind.${e.kind}`)} · ${e.label}`

// El aviso fijo del modo sin conexión y la lista de lo que el servidor rechazó al sincronizar.
export function OfflineBar() {
  useOfflineSync()
  const online = useNetworkStore((s) => s.online)
  const quiet = useOutboxStore((s) => s.entries.length === 0 && s.failed.length === 0)
  return online && quiet ? null : <OfflineStatus />
}

function OfflineStatus() {
  const t = useTranslations('pos.offline')
  const online = useNetworkStore((s) => s.online)
  const { entries, failed, syncing, sync, discard } = useOutboxStore()
  const [open, setOpen] = useState(false)
  const text = !online ? t('offline', { n: entries.length }) : syncing ? t('syncing', { n: entries.length }) : entries.length > 0 ? t('pending', { n: entries.length }) : t('failed', { n: failed.length })
  return (
    <>
      <div role="status" className={cn('fixed bottom-4 left-1/2 -translate-x-1/2 z-50 h-11 pl-4 pr-2 rounded-full shadow-lg flex items-center gap-3 text-[14px] font-semibold',
        online ? 'bg-surface border border-border text-ink' : 'bg-danger text-white')}>
        <Icon name={online ? 'refresh' : 'alert'} size={18} />
        <span>{text}</span>
        {online && entries.length > 0 && !syncing && <button type="button" onClick={() => void sync()} className="h-8 px-3 rounded-full bg-primary text-primary-ink">{t('retry')}</button>}
        {failed.length > 0 && <button type="button" onClick={() => setOpen(true)} className="h-8 px-3 rounded-full border border-current">{t('review', { n: failed.length })}</button>}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t('failedTitle')} size="center">
        <p className="text-[14px] text-soft">{t('failedHint')}</p>
        <ul className="mt-3 flex flex-col gap-2">
          {failed.map(({ entry, error }) => (
            <li key={entry.id} className="rounded-md border border-border p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0"><p className="text-[15px] font-semibold text-ink">{describe(t, entry)}</p><p className="text-[14px] text-danger-ink">{error}</p></div>
              <button type="button" onClick={() => discard(entry.id)} className="h-9 px-3 rounded-sm border border-border text-[14px] font-semibold">{t('discard')}</button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}
