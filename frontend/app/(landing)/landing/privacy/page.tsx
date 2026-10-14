import type { Metadata } from 'next'
import { PaginaLegal } from '@/components/legal/PaginaLegal'
import { Privacidad } from '@/components/legal/Privacidad'

export const metadata: Metadata = {
  title: 'Política de privacidad de Waiter',
  description: 'Cómo ProjectApp trata los datos personales en Waiter: menú digital, punto de venta, asistente con inteligencia artificial y mensajes de WhatsApp, según la Ley 1581 de 2012.',
}

export default function Page() {
  return <PaginaLegal><Privacidad /></PaginaLegal>
}
