import type { Metadata, Viewport } from 'next'

import './globals.css'
import './hover.css'
import './nav.css'
import './legal.css'
import './aurora.css'

export const metadata: Metadata = {
  title: 'Waiter · Tu restaurante atiende, cobra y lleva domicilios',
  description: 'El cliente pide desde su mesa con un toque, la cocina recibe la comanda al instante y tú ves todo en un solo lugar. Sin comisiones de apps de domicilio.',
  // Antes era app/icon.svg de la app aparte; con una sola app vive en public/ para no depender de una ruta interna.
  icons: { icon: '/icon.svg' },
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* Las fuentes del diseño de Claude Design; Open Sans 300 es para los enlaces grandes del menú móvil. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Open+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        {/* Sin JavaScript la página no se anima, pero se ve. */}
        <noscript><style>{'body>div{visibility:visible!important}'}</style></noscript>
      </head>
      <body>{children}</body>
    </html>
  )
}
