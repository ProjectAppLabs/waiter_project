'use client'

import { useTranslations } from 'next-intl'

import { Chip } from '@/components/kit/Chip'
import { BrandMark } from '@/components/kit/BrandMark'
import { PageTitle } from '@/components/ui/PageHeader'
import { ALL, LATE, formatClock } from '@/lib/domain/kitchen'

interface KdsHeaderProps { tabs: string[]; counts: Record<string, number>; active: string; onTab: (tab: string) => void; avgSeconds: number | null; now: number }

// Cabecera del kit para la pantalla de cocina: logo, título, chips de estación con conteo, tiempo medio y reloj.
// No lleva la barra de pestañas: la cocina es un dispositivo fijo, no un mesero.
export function KdsHeader({ tabs, counts, active, onTab, avgSeconds, now }: KdsHeaderProps) {
  const t = useTranslations('kds')
  const label = (tab: string) => (tab === ALL ? t('tabs.all') : tab === LATE ? t('tabs.late') : tab)
  return (
    <header className="shrink-0 bg-surface border-b border-border">
      <div className="min-h-topbar lg:h-topbar px-5 py-3 lg:py-0 flex flex-wrap lg:flex-nowrap items-center gap-4">
        <BrandMark />
        <PageTitle>{t('title')}</PageTitle>
        <nav aria-label={t('grid')} className="min-w-0 flex items-center gap-2 overflow-x-auto">
          {tabs.map((tab) => <Chip key={tab} label={label(tab)} count={counts[tab] ?? 0} active={tab === active} onClick={() => onTab(tab)} icon={tab === LATE ? 'alarm' : undefined} />)}
        </nav>
        <div className="ml-auto shrink-0 flex items-center gap-5">
          <p className="text-[14px] text-soft flex items-baseline gap-2">{t('avg')}<span className="font-mono tabular text-[20px] font-semibold text-ink">{avgSeconds === null ? t('avgNone') : formatClock(avgSeconds)}</span></p>
          <time className="font-mono tabular text-[30px] font-semibold leading-none text-ink" dateTime={new Date(now).toISOString()}>
            {new Date(now).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </time>
        </div>
      </div>
    </header>
  )
}
