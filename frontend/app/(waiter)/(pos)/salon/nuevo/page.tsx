'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { OrderWizard } from '@/components/orders/OrderWizard'

function NewTableOrder() {
  const params = useSearchParams()
  const mesa = Number(params.get('mesa'))
  return <OrderWizard key={params.toString()} withoutTable={params.get('sinMesa') === '1'} presetTableId={Number.isInteger(mesa) && mesa > 0 ? mesa : null} returnTo="/salon" />
}
export default function NewTableOrderPage() {
  return <Suspense><NewTableOrder /></Suspense>
}
