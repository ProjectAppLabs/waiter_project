'use client'

import { NextIntlClientProvider } from 'next-intl'
import { useEffect } from 'react'

import messages from '@/lib/i18n/messages/es.json'
import { VenueMoveOverlay } from '@/components/smart/VenueMoveOverlay'

export default function Providers({ children }: { children: React.ReactNode }) {
  // PWA: registro del service worker (solo instalabilidad; el aviso exige HTTPS en producción).
  useEffect(() => { if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined) }, [])
  return (
    <NextIntlClientProvider locale="es" messages={messages} timeZone="America/Bogota">
      {children}
      <VenueMoveOverlay />
    </NextIntlClientProvider>
  )
}
