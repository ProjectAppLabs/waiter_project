'use client'

import { useTranslations } from 'next-intl'

export function useAutomationSubnav(active: 'roi' | 'ai' | 'config') {
  const t = useTranslations('pos.nav')
  return {
    label: t('automationSection'),
    items: [
      { key: 'roi', label: t('roi'), href: '/automatizacion', active: active === 'roi' },
      { key: 'ai', label: t('aiAnalytics'), href: '/automatizacion/ia', active: active === 'ai' },
      { key: 'config', label: t('aiConfig'), href: '/automatizacion/ia/configurar', active: active === 'config' },
    ],
  }
}
