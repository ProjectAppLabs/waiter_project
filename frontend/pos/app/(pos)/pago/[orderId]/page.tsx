'use client'

import { useParams, useRouter } from 'next/navigation'

import { PaymentModal } from '@/components/payment/PaymentModal'

// Ruta de cobro del kit (9 – Payment): el modal sobre la pantalla, con salida al listado de pedidos.
export default function PagoPage() {
  const router = useRouter()
  const orderId = Number(useParams<{ orderId: string }>().orderId)
  const leave = () => router.push('/pedidos')
  if (!Number.isFinite(orderId)) return null
  return <><PaymentModal orderId={orderId} onClose={leave} onPaid={leave} /></>
}
