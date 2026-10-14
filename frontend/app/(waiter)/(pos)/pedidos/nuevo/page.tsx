'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { OrderWizard } from '@/components/orders/OrderWizard'
import { OrderStart } from '@/components/orders/OrderStart'

// "Create New Order" del kit. Con ?mesa=<id> el wizard salta el paso de mesa (se entra desde el plano del salón).
function NewOrder() {
  const params = useSearchParams()
  const mesa = Number(params.get('mesa'))
  const tableId = Number.isInteger(mesa) && mesa > 0 ? mesa : null
  const withoutTable = params.get('sinMesa') === '1'
  if (tableId === null && !withoutTable) return <OrderStart />
  return <OrderWizard key={params.toString()} presetTableId={withoutTable ? null : tableId} withoutTable={withoutTable} />
}

export default function NuevoPedidoPage() {
  return <><Suspense>{<NewOrder />}</Suspense></>
}
