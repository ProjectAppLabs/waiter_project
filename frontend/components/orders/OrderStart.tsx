'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/kit/Icon'
import { Modal } from '@/components/kit/Modal'
import { TableStep } from '@/components/orders/TableStep'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useOrderStore } from '@/lib/stores/orderStore'

// Caja elige el destino antes de abrir los datos del pedido, dentro de Pedidos.
export function OrderStart() {
  const router = useRouter()
  const catalog = useCatalogStore((s) => s.catalog)
  const session = useAuthStore((s) => s.session)
  const { openOrders, refreshOpenOrders } = useOrderStore()
  const [choosingTable, setChoosingTable] = useState(false)
  const [tableId, setTableId] = useState<number | null>(null)
  useEffect(() => { if (session) void refreshOpenOrders(session.id) }, [session, refreshOpenOrders])
  if (!catalog) return null
  if (!choosingTable) return <Modal open title="Crear pedido" onClose={() => router.push('/pedidos')}>
    <div className="p-6 space-y-5">
      <p className="text-soft">¿Dónde se atenderá este pedido?</p>
      <Button variant="primary" className="w-full justify-center" onClick={() => setChoosingTable(true)}><Icon name="tables" size={18} />Seleccionar una mesa</Button>
      <Button className="w-full justify-center" onClick={() => router.replace('/pedidos/nuevo?sinMesa=1')}><Icon name="bag" size={18} />Para llevar o domicilio</Button>
    </div>
  </Modal>
  return <div className="flex-1 min-h-0 p-3">
    <div className="h-full ambient-panel rounded-xl border border-border flex flex-col overflow-hidden">
      <header className="px-6 py-3 border-b border-border flex items-center gap-3">
        <button type="button" aria-label="Volver" onClick={() => setChoosingTable(false)} className="h-10 w-10 grid place-items-center rounded-md bg-ink text-surface"><Icon name="chevronLeft" size={20} /></button>
        <h1 className="text-lg font-semibold">Seleccionar una mesa</h1>
      </header>
      <div className="flex-1 min-h-0"><TableStep floors={catalog.floors} tables={catalog.tables} orders={openOrders} selected={tableId} onSelect={setTableId} onContinue={() => { if (tableId !== null) router.replace(`/pedidos/nuevo?mesa=${tableId}`) }} /></div>
    </div>
  </div>
}
