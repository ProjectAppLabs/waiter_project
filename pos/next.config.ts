import type { NextConfig } from 'next'

const odooOrigin = (process.env.ODOO_ORIGIN || 'http://192.168.56.10:8069').replace(/\/$/, '')

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  experimental: {
    // La plantilla fija TypeScript 7 para el CLI; Next sigue usando la API de TypeScript 6.
    useTypeScriptCli: false,
  },
  // next-intl y su cadena de runtime (use-intl → intl-messageformat → @formatjs/*) se publican como
  // ESM puro; next/jest lee esta lista para transformarlos en los tests (el patrón manual no puede).
  transpilePackages: ['next-intl', 'use-intl', 'intl-messageformat', '@formatjs/fast-memoize', '@formatjs/icu-messageformat-parser', '@formatjs/icu-skeleton-parser', '@formatjs/intl-localematcher', '@schummar/icu-type-parser'],
  // El servidor de desarrollo se abre desde la IP de la red local (y el POS mete al comensal en un iframe):
  // sin esto Next responde 403 a sus propios chunks cuando el origen no es localhost.
  allowedDevOrigins: [process.env.WAITER_HOST || '192.168.56.10'],
  devIndicators: false,
  images: { unoptimized: true },
  async rewrites() {
    return [{ source: '/odoo/:path*', destination: `${odooOrigin}/:path*` }]
  },
}

export default nextConfig
