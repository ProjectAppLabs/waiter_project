'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { AccountHome } from '@/components/templates/generic/AccountHome'
import { EmptyHistory } from '@/components/templates/generic/EmptyHistory'
import { GenericHistory } from '@/components/templates/generic/GenericHistory'
import { HISTORY_PATTERNS } from '@/components/templates/registry'
import { pathFor } from '@/lib/domain/route'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { AccountOrder, Entry } from '@/lib/types'

// Mi cuenta (igual para las 30) + historial según el patrón de la plantilla (o el vacío). Sin cuenta ligada a la cookie: invita a crearla.
export function Account({ rest, venue, token }: { entry: Entry; rest: string; venue: string; token: string | null; id: string | null }) {
  const router = useRouter()
  const store = useDinerStore()
  const { account, accountOrders, loadAccount, logout, add, busy } = store
  const template = store.template ?? DEFAULT_TEMPLATE
  useEffect(() => { void loadAccount() }, [loadAccount])
  const go = (screen: Parameters<typeof pathFor>[3]) => router.push(pathFor(rest, venue, token, screen))
  const pct = template.descuento?.porcentaje ?? 5
  const orders = accountOrders ?? []
  const discountUsed = account?.descuentoDisponible === false || orders.some((o) => o.descuento > 0)
  const History = HISTORY_PATTERNS[template.layouts?.historial] ?? GenericHistory
  // Volver a pedir: las mismas líneas al carrito de esta mesa, una a una (el servidor recalcula), y se abre el pedido.
  // Si el restaurante rechaza un plato (agotado, cerrado), se para ahí y no navega: el comensal ve el aviso en vez de
  // llegar a un carrito incompleto como si todo hubiera salido bien.
  const reorder = async (order: AccountOrder) => {
    useDinerStore.setState({ error: null })
    for (const l of order.lineas ?? []) {
      await add(l.producto_id, l.cantidad, '')
      if (useDinerStore.getState().error) return
    }
    go('pedido')
  }
  return (
    <div className="flex flex-col pb-[18px]">
      <AccountHome account={account ?? null} orders={orders} discountPct={pct} discountUsed={discountUsed} onSignup={() => go('cuenta/registro')} onLogout={() => void logout()} busy={busy} />
      {account && (orders.length > 0
        ? <History template={template} account={account} orders={orders} onReorder={(o) => void reorder(o)} />
        : <EmptyHistory discountPct={pct} discountUsed={discountUsed} onSeeMenu={() => go('carta')} />)}
    </div>
  )
}
