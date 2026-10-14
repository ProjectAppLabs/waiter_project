'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { Brand } from '@/lib/types'

export function BrandHeader({ brand, table }: { brand: Brand; table: number | null }) {
  const t = useTranslations('diner.common')
  // Si el logo no carga (logo/ en 404 porque Odoo no responde, binario no ráster, red), el encabezado vuelve al nombre:
  // nunca un hueco vacío donde debía estar la marca. Se recuerda la URL que falló para reintentar si la marca cambia de logo.
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  const logo = brand.logo && brand.logo !== failedLogo ? brand.logo : null
  return (
    <header className="px-[18px] pt-[18px] flex items-start justify-between gap-3">
      <div className="flex flex-col min-w-0">
        {logo ? <img src={logo} alt={brand.nombre} onError={() => setFailedLogo(logo)} className="h-8 w-auto object-contain self-start" /> : <span className="font-display text-[25px] leading-tight truncate">{brand.nombre}</span>}
        {brand.lema && <span className="text-[10px] tracking-[0.22em] uppercase text-ink-3 mt-0.5">{brand.lema}</span>}
      </div>
      <span className="inline-flex items-center h-9 px-3 rounded-full bg-t-superficie border border-t-borde text-t-tinta text-sm font-medium shrink-0">{table !== null ? t('table', { n: table }) : t('delivery')}</span>
    </header>
  )
}
