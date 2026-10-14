import type { Metadata } from 'next'

import './globals.css'
import Providers from './providers'

export const metadata: Metadata = { title: 'Waiter · POS', description: 'Punto de venta del operador' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
