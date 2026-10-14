'use client'

import { Receipt } from '@/components/pay/Receipt'
import type { ReceiptData } from '@/lib/stores/orderStore'

// La hoja de impresión solo deja visible `.receipt` (globals.css): una pantalla que no muestra el documento
// —el aviso de cobro exitoso, el detalle de Historial— no puede imprimir nada si no lo tiene en el DOM.
// Esto lo mantiene montado fuera de la vista. Sin él, "Imprimir" saca una hoja en blanco.
export function PrintableReceipt({ data }: { data: ReceiptData }) {
  return (
    <div aria-hidden="true" className="fixed -left-[9999px] top-0 w-[400px]">
      <Receipt data={data} onClose={() => undefined} />
    </div>
  )
}
