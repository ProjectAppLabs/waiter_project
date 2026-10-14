import type { Metadata } from 'next'
import { PaginaLegal } from '@/components/legal/PaginaLegal'
import { EliminacionDatos } from '@/components/legal/EliminacionDatos'

export const metadata: Metadata = {
  title: 'Eliminación de datos de Waiter',
  description: 'Paso a paso para pedir la eliminación de tus datos de Waiter: cuenta del menú, conversaciones con el asistente y mensajes de WhatsApp.',
}

export default function Page() {
  return <PaginaLegal><EliminacionDatos /></PaginaLegal>
}
