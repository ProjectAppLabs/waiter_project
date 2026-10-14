'use client'

import { useTranslations } from 'next-intl'

import { Seal } from '@/components/ui/Seal'

// Raíz sin restaurante: quien llega aquí no tocó un NFC ni un enlace de la mesa. Sirve también de comprobación de vida.
export default function RootPage() {
  const t = useTranslations('diner.common')
  return (
    <main className="min-h-screen grid place-items-center p-8 text-center">
      <div className="flex flex-col gap-3 max-w-sm">
        <span className="font-display text-[32px] leading-tight">{t('rootTitle')}</span>
        <p className="text-base text-soft">{t('rootBody')}</p>
        <Seal />
      </div>
    </main>
  )
}
