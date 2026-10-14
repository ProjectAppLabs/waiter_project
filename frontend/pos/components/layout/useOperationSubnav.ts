'use client'

import { useTranslations } from 'next-intl'

// Salón, en vivo y cocina cuelgan de "Operación": la subnav las hace visibles sin inventar entradas en el sidebar.
export function useOperationSubnav(active: 'salon' | 'live' | 'kitchen') {
  const t = useTranslations('pos.nav')
  return {
    label: t('operationSection'),
    items: [
      { key: 'salon', label: t('salon'), href: '/salon', active: active === 'salon' },
      { key: 'live', label: t('live'), href: '/operacion', active: active === 'live' },
      { key: 'kitchen', label: t('kitchenScreen'), href: '/kds', active: active === 'kitchen' },
    ],
  }
}
