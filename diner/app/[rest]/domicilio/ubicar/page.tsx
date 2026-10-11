'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { LocateDelivery } from '@/components/smart/LocateDelivery'

// Plan D: el enlace «Ubica la entrega» que el mesero manda por WhatsApp, para ubicar una casa en el mapa (por ejemplo,
// si el pedido es para otra persona). Al confirmar, la conversación sigue en WhatsApp.
function Page() {
  const token = useSearchParams().get('token') ?? ''
  return <LocateDelivery token={token} />
}

export default function LocateDeliveryPage() {
  return <Suspense fallback={null}><Page /></Suspense>
}
