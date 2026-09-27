'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useLayoutEffect, useRef, useState } from 'react'

import { BrandMark } from '@/components/kit/BrandMark'
import { Icon, type KitIcon } from '@/components/kit/Icon'
import { NotificationPopover } from '@/components/notifications/NotificationPopover'
import { TAB_ROUTES, adminSubtabsFor, tabsFor, type AdminSubtab, type KitTab } from '@/lib/domain/navigation'
import type { RolePolicy } from '@/lib/domain/permissions'
import { homePath } from '@/lib/domain/navigation'
import type { Role } from '@/lib/domain/roles'
import { useNotificationStore } from '@/lib/stores/notificationStore'
import { cn, initials } from '@/lib/utils'

const ICON: Record<KitTab, KitIcon> = { dashboard: 'dashboard', orders: 'orders', tables: 'tables', reservations: 'reservations', history: 'history', inventory: 'inventory', kitchen: 'kitchen', admin: 'admin' }

// Barra superior del kit (Dashboard / Filled.png): logo, pestañas en píldora gris, campana con punto, chip de usuario.
// `unread` fuerza el conteo (galería y pruebas); sin él, la campana lee las no leídas del centro de notificaciones.
export function TopBar({ active, role, policy, userName, unread, activeSubtab, onOpenSettings, administrationOnly = false }: { policy?: RolePolicy; administrationOnly?: boolean; active: KitTab | null; role: Role; userName: string; unread?: number; activeSubtab?: AdminSubtab | null; onOpenSettings: () => void }) {
  const t = useTranslations('pos.kit.nav')
  const storeUnread = useNotificationStore((s) => s.unread())
  const count = unread ?? storeUnread
  const [bell, setBell] = useState(false)
  // La píldora azul es un solo elemento que se mueve entre pestañas, no una clase que salta de una a otra:
  // se mide la pestaña activa y se desliza hasta ella. Sin medida todavía, no se pinta.
  const nav = useRef<HTMLElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const move = () => {
      const el = nav.current?.querySelector<HTMLElement>('[aria-current="page"]')
      setPill(el && nav.current ? { left: el.offsetLeft, width: el.offsetWidth } : null)
    }
    move()
    const ro = new ResizeObserver(move)
    if (nav.current) ro.observe(nav.current)
    return () => ro.disconnect()
  }, [active, role, administrationOnly, policy])
  const tr = useTranslations('pos.nav.roles')
  const tabs = tabsFor(role, policy).filter((tab) => !administrationOnly || !['orders', 'kitchen'].includes(tab))
  const subtabs = adminSubtabsFor(role, policy)
  return (
    <header className="kit-topbar shrink-0">
      <div className="h-topbar px-5 flex items-center gap-4">
        <BrandMark href={homePath(role, !administrationOnly, policy)} />
        <nav ref={nav} aria-label={t('main')} className="relative min-w-0 flex items-center gap-0.5 p-1 rounded-lg bg-muted overflow-x-auto">
          {pill && <span aria-hidden className="absolute top-1 bottom-1 rounded-md bg-primary transition-[left,width] duration-300 ease-out" style={{ left: pill.left, width: pill.width }} />}
          {tabs.map((tab) => (
            <Link key={tab} href={TAB_ROUTES[tab]} aria-current={tab === active ? 'page' : undefined}
              className={cn('relative flex items-center gap-1.5 h-11 px-2.5 rounded-md text-[15px] font-semibold whitespace-nowrap transition-colors', tab === active ? 'text-primary-ink' : 'text-dim hover:text-soft')}>
              <Icon name={ICON[tab]} size={20} /><span>{t(tab)}</span>
            </Link>
          ))}
        </nav>
        {/* Con la caja cerrada, la acción de abrirla va junto a los módulos, separada: es una acción, no una pantalla. */}
        {administrationOnly && <>
          <span aria-hidden className="shrink-0 w-px h-8 bg-border" />
          <Link href="/caja" className="shrink-0 h-11 px-4 flex items-center gap-2 rounded-md bg-primary text-primary-ink text-[15px] font-semibold whitespace-nowrap shadow-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary">
            <Icon name="wallet" size={20} />{t('openRegister')}
          </Link>
        </>}
        <div className="ml-auto shrink-0 flex items-center gap-3 relative">
          <button type="button" aria-label={t('bell', { count })} aria-expanded={bell} onClick={() => setBell((v) => !v)} className={cn('relative w-12 h-12 rounded-md border border-border grid place-items-center', bell ? 'text-primary border-primary/40' : 'text-soft')}>
            <Icon name="bell" size={22} />
            {count > 0 && <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-danger border-2 border-surface" />}
          </button>
          <NotificationPopover open={bell} onClose={() => setBell(false)} />
          {/* En 1194 px con ocho pestañas el nombre no cabe: bajo 1400 px queda solo el avatar; la etiqueta accesible lleva nombre y rol. */}
          <button type="button" onClick={onOpenSettings} aria-label={`${userName} / ${tr(role)}`} className="h-12 px-1.5 min-[1400px]:pr-4 rounded-md border border-border flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full bg-primary-soft text-primary grid place-items-center text-[14px] font-semibold">{initials(userName)}</span>
            <span className="hidden min-[1400px]:inline text-[15px] text-ink font-semibold">{userName}<span className="text-dim font-normal"> / {tr(role)}</span></span>
          </button>
        </div>
      </div>
      {active === 'admin' && subtabs.length > 0 && (
        <nav aria-label={t('adminRow')} className="h-14 px-6 flex items-center gap-2">
          {subtabs.map(([key, href]) => (
            <Link key={key} href={href} aria-current={key === activeSubtab ? 'page' : undefined}
              className={cn('h-10 px-4 rounded-md border text-[15px] font-semibold inline-flex items-center', key === activeSubtab ? 'bg-primary-soft border-primary/40 text-primary' : 'bg-surface border-border text-soft')}>{t(`sub.${key}`)}</Link>
          ))}
        </nav>
      )}
    </header>
  )
}
