'use client'

import { NextIntlClientProvider } from 'next-intl'

import { ServiceWorkerSetup } from '@/components/app/ServiceWorkerSetup'
import { ThemeBoot } from '@/components/kit/ThemeBoot'
import { Toaster } from '@/components/kit/Toaster'
import { SupportBanner } from '@/components/support/SupportBanner'

import { messages } from '@/lib/i18n/messages'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="es" messages={messages} timeZone="America/Bogota">
      <ThemeBoot />
      <ServiceWorkerSetup />
      {children}
      <Toaster />
      <SupportBanner />
    </NextIntlClientProvider>
  )
}
