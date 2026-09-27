import type { NextConfig } from 'next'

// El comensal solo conoce al bloque 3 (experience/). El proxy same-origin traslada la cookie del comensal.
const experienceOrigin = (process.env.EXPERIENCE_ORIGIN || 'http://192.168.56.10:8001').replace(/\/$/, '')

const nextConfig: NextConfig = {
  // Django exige barra final en la API; Next la quitaría y entraría en bucle: se conserva en todas las rutas.
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  experimental: { useTypeScriptCli: false },
  transpilePackages: ['next-intl', 'use-intl', 'intl-messageformat', '@formatjs/fast-memoize', '@formatjs/icu-messageformat-parser', '@formatjs/icu-skeleton-parser', '@formatjs/intl-localematcher', '@schummar/icu-type-parser'],
  // El servidor de desarrollo se abre desde la IP de la red local (y el POS mete al comensal en un iframe):
  // sin esto Next responde 403 a sus propios chunks cuando el origen no es localhost.
  allowedDevOrigins: [process.env.WAITER_HOST || '192.168.56.10'],
  devIndicators: false,
  images: { unoptimized: true },
  async rewrites() {
    // :path* no captura la barra final; Django la exige (APPEND_SLASH). Se reenvía tal cual, con y sin barra.
    return [
      { source: '/api/:path*/', destination: `${experienceOrigin}/api/:path*/` },
      { source: '/api/:path*', destination: `${experienceOrigin}/api/:path*` },
    ]
  },
}

export default nextConfig
