import type { NextConfig } from 'next'

const odooOrigin = (process.env.ODOO_ORIGIN || 'http://192.168.56.10:8069').replace(/\/$/, '')
// El navegador nunca habla con experience por su URL pública: catálogo, miniaturas y decoraciones pasan por aquí.
const experienceOrigin = (process.env.EXPERIENCE_ORIGIN || 'http://192.168.56.10:8001').replace(/\/$/, '')

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  experimental: {
    // La plantilla fija TypeScript 7 para el CLI; Next sigue usando la API de TypeScript 6.
    useTypeScriptCli: false,
  },
  // next-intl y su cadena de runtime (use-intl → intl-messageformat → @formatjs/*) se publican como
  // ESM puro; next/jest lee esta lista para transformarlos en los tests (el patrón manual no puede).
  transpilePackages: ['next-intl', 'use-intl', 'intl-messageformat', '@formatjs/fast-memoize', '@formatjs/icu-messageformat-parser', '@formatjs/icu-skeleton-parser', '@formatjs/intl-localematcher', '@schummar/icu-type-parser'],
  // El servidor de desarrollo se abre desde la IP de la red local (y el POS mete al comensal en un iframe) y, en WSL2 con
  // red en espejo, desde Windows por localhost a través del puente (scripts/verificador/puente.js): sin esto Next
  // responde 403 a sus propios chunks cuando el origen no coincide con el que escucha.
  // Plan T: cada organización entra por su subdominio (`frisby.localhost:3000`).
  allowedDevOrigins: [process.env.WAITER_HOST || '192.168.56.10', 'localhost', '*.localhost', '127.0.0.1'],
  devIndicators: false,
  images: { unoptimized: true },
  async rewrites() {
    return [
      { source: '/odoo/:path*', destination: `${odooOrigin}/:path*` },
      // :path* no captura la barra final y Django la exige (APPEND_SLASH): se reenvía tal cual, con y sin barra.
      { source: '/experience/:path*/', destination: `${experienceOrigin}/:path*/` },
      { source: '/experience/:path*', destination: `${experienceOrigin}/:path*` },
    ]
  },
}

export default nextConfig
