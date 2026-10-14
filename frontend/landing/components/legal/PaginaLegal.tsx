import type { ReactNode } from 'react'
import { Nav } from '../Nav'
import { Pie } from '../sections/Pie'
import { WhatsAppFlotante } from '../sections/WhatsAppFlotante'
import { enlaceWhatsApp } from '@landing/lib/whatsapp'

// Las páginas legales llevan la misma navegación, el mismo pie y el mismo botón de WhatsApp que el inicio.
export function PaginaLegal({ children }: { children: ReactNode }) {
  const waHref = enlaceWhatsApp()
  return (
    <>
      <Nav waHref={waHref} inicio={false} />
      <main className="legal-main">{children}</main>
      <Pie v={{ waHref }} />
      <WhatsAppFlotante v={{ waHref }} />
    </>
  )
}
