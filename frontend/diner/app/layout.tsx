import type { Metadata, Viewport } from 'next'

import './globals.css'
import Providers from './providers'

export const metadata: Metadata = { title: 'Carta', description: 'Pide desde tu mesa' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Ubuntu y Plex Mono son nuestras; la serif la elige el restaurante (seis curadas) y se carga por su nombre. */}
        <link href="https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif&family=Playfair+Display:wght@400;600&family=Fraunces:wght@400;600&family=DM+Serif+Display&family=Lora:wght@400;600&family=Cormorant+Garamond:wght@500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
