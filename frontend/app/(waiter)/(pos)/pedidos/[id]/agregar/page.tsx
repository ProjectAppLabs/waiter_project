'use client'

import { useParams, usePathname } from 'next/navigation'

import { AddRoundScreen } from '@/components/orders/AddRoundScreen'

export default function AgregarRondaPage() {
  const params = useParams<{ id: string }>()
  const returnTo = usePathname().startsWith('/salon') ? '/salon' : '/pedidos'
  return <AddRoundScreen orderId={Number(params.id)} returnTo={returnTo} />
}
