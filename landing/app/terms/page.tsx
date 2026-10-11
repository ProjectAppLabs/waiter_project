import type { Metadata } from 'next'
import { PaginaLegal } from '@/components/legal/PaginaLegal'
import { Condiciones } from '@/components/legal/Condiciones'

export const metadata: Metadata = {
  title: 'Condiciones del servicio de Waiter',
  description: 'Condiciones del servicio de Waiter, el software para restaurantes de ProjectApp: cuentas, uso aceptable, WhatsApp, asistente, datos, pagos y soporte.',
}

export default function Page() {
  return <PaginaLegal><Condiciones /></PaginaLegal>
}
