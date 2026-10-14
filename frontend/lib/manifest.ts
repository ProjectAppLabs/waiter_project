import type { MetadataRoute } from 'next'

// PWA instalable (tablet del mesero, caja). El aviso de instalación exige HTTPS en producción.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Waiter · POS', short_name: 'Waiter', description: 'Punto de venta del operador', start_url: '/', display: 'standalone',
    // Colores del kit: el lienzo del salón y el azul de la marca. Los de antes eran del diseño anterior.
    orientation: 'landscape', background_color: '#F8FAFC', theme_color: '#447DFC', lang: 'es',
    icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
  }
}
