'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

import { openPayLink } from '@/lib/services/api'

// Plan D: el enlace de pago que manda el mesero por WhatsApp. Abre la visita del pedido en este navegador y lleva al pago.
function Page() {
  const token = useSearchParams().get('token') ?? ''
  const router = useRouter()
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    openPayLink(token).then((r) => { if (alive) router.replace(`/${encodeURIComponent(r.restaurante)}/${encodeURIComponent(r.sede)}/pago`) })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'El enlace de pago venció.') })
    return () => { alive = false }
  }, [token, router])
  return <main className="min-h-screen grid place-items-center p-6 text-center">
    {error ? <p role="alert">{error}</p> : <p role="status">Abriendo el pago de tu pedido…</p>}
  </main>
}

export default function PayDeliveryPage() {
  return <Suspense fallback={null}><Page /></Suspense>
}
