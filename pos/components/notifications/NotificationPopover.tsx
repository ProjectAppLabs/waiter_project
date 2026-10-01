'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { canRequest, filterByTab, productOf, type Notification, type NotificationKind, type NotificationTab } from '@/lib/domain/notifications'
import { requestIngredient } from '@/lib/services/notifications'
import { useAuthStore } from '@/lib/stores/authStore'
import { useNotificationStore } from '@/lib/stores/notificationStore'
import { toast } from '@/lib/stores/toastStore'
import { cn } from '@/lib/utils'

const TABS: NotificationTab[] = ['all', 'inventory', 'kitchen']
const ICON: Record<NotificationKind, KitIcon> = { inventory: 'inventory', kitchen: 'chef', system: 'settings', access: 'lock' }
const TONE: Record<NotificationKind, string> = {
  inventory: 'bg-progress-soft border-progress/40 text-progress-ink',
  kitchen: 'bg-info-soft border-info/40 text-info-ink',
  system: 'bg-primary-soft border-primary/40 text-primary',
  access: 'bg-danger-soft border-danger/40 text-danger-ink',
}

// Popover de la campana (3 – Dashboard / Notification Expand.png): pestañas Todas / Inventario / Cocina,
// "Marcar todas como leídas", tarjetas "¡Stock bajo!" (con "Solicitar ingredientes" o "Ya solicitado") y
// "¡Plato listo para servir!". Lee `waiter.notification` de Odoo y sondea cada 30 s mientras hay sesión.
export function NotificationPopover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('notifications')
  const user = useAuthStore((s) => s.user)
  const items = useNotificationStore((s) => s.items)
  const refresh = useNotificationStore((s) => s.refresh)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const setActionDone = useNotificationStore((s) => s.setActionDone)
  const [tab, setTab] = useState<NotificationTab>('all')
  const [busy, setBusy] = useState<number | null>(null)

  // El sondeo lo lleva el armazón (useNotificationAlerts): aquí solo se relee al abrir.
  useEffect(() => { if (open && user) void refresh() }, [open, user, refresh])

  async function request(n: Notification) {
    const productId = productOf(n)
    if (productId === null) return
    setBusy(n.id)
    try {
      const purchase = await requestIngredient(productId)
      setActionDone(productId)
      toast({ title: t('lowStock.sent'), body: t('lowStock.sentBody', { order: purchase.name, partner: purchase.partnerName }) })
    } catch (e) {
      toast({ title: t('lowStock.failed'), body: e instanceof Error ? e.message : '', tone: 'danger' })
    } finally { setBusy(null) }
  }

  if (!open) return null
  const visible = filterByTab(items, tab)
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div role="dialog" aria-label={t('title')} className="absolute right-0 top-full mt-3 w-[480px] max-h-[630px] z-40 flex flex-col rounded-lg border border-border bg-surface shadow-2xl overflow-hidden">
        <header className="px-4 pt-4 flex items-center justify-between">
          <span className="text-[20px] font-semibold text-ink">{t('title')}</span>
          <button type="button" onClick={() => void markAllRead()} className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-primary"><Icon name="checks" size={20} />{t('markAllRead')}</button>
        </header>
        <div role="tablist" className="px-4 mt-2 flex gap-5 border-b border-border">
          {TABS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn('h-11 text-[17px] font-semibold border-b-2 -mb-px', tab === k ? 'text-primary border-primary' : 'text-soft border-transparent')}>{t(`tabs.${k}`)}</button>
          ))}
        </div>
        <ul className="flex-1 min-h-0 overflow-auto p-3 flex flex-col gap-3">
          {visible.length === 0 && <li className="py-10 text-center text-[15px] text-dim">{t('empty')}</li>}
          {visible.map((n) => (
            <li key={n.id} data-read={n.read} className={cn('rounded-md p-4 flex gap-4', n.read ? 'bg-surface border border-border' : 'bg-muted')}>
              <span className={cn('w-14 h-14 shrink-0 rounded-md border grid place-items-center', TONE[n.kind])}><Icon name={ICON[n.kind]} size={26} /></span>
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <p className="text-[16px] font-semibold text-ink">{t(`kind.${n.kind}`)} {n.title}</p>
                <p className="text-[15px] text-soft leading-relaxed">{n.body}</p>
                {n.action === 'serve' && (
                  <Link href="/dashboard" onClick={onClose} className="mt-1 self-start h-9 px-3 rounded-md bg-primary text-primary-ink text-[14px] font-semibold inline-flex items-center gap-1.5">
                    <Icon name="check" size={16} />{t('kitchenReady.deliver')}
                  </Link>
                )}
                {n.action === 'request_ingredient' && (canRequest(n)
                  ? <Button variant="primary" size="compact" className="mt-1 self-start" disabled={busy === n.id} onClick={() => void request(n)}>{t('lowStock.request')}</Button>
                  : <span className="mt-1 text-[15px] font-semibold text-dim">{t('lowStock.requested')}</span>)}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
