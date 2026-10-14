import type { NextConfig } from 'next'

import { SITIO, SITIOS } from './lib/sitio'

// Waiter es una sola app: el POS, el comensal (menu.*) y la landing comparten este servidor y proxy.ts los reparte por
// host. El navegador nunca habla con experience por su URL pública: el POS pasa por /experience y el comensal por /api.
// Sin EXPERIENCE_ORIGIN, el build apunta al gunicorn local del servidor (staging del fleet: 127.0.0.1:8107) y el
// servidor de desarrollo a la VM.
const experienceOrigin = (process.env.EXPERIENCE_ORIGIN
  || (process.env.NODE_ENV === 'production' ? 'http://127.0.0.1:8107' : 'http://192.168.56.10:8001')).replace(/\/$/, '')

// La IP de desarrollo que exporta scripts/dev.sh (la red host-only de la VM, si no se indica otra).
const devHost = process.env.WAITER_HOST || '192.168.56.10'

const nextConfig: NextConfig = {
  // Django exige la barra final en la API (APPEND_SLASH): sin redirecciones de Next, cada ruta llega tal cual, con y sin
  // barra. Antes el comensal usaba trailingSlash: true; con una sola app vale la regla del POS para las tres.
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
  // Plan T: cada organización entra por su subdominio (`frisby.localhost:3000`) y el comensal por `menu.localhost:3000`;
  // desde la red, el comensal y la landing por menu.<IP>.nip.io y www.<IP>.nip.io (scripts/dev.sh).
  allowedDevOrigins: [devHost, `*.${devHost}.nip.io`, 'localhost', '*.localhost', '127.0.0.1'],
  devIndicators: false,
  images: { unoptimized: true },
  async rewrites() {
    return {
      // El comensal y la landing: proxy.ts anota el sitio en SITIO y aquí la ruta pasa a su prefijo interno, tal cual
      // (con su barra final, si la trae). Es una reescritura de la configuración y no un NextResponse.rewrite del proxy:
      // con `next start -H 127.0.0.1` Next convierte 127.0.0.1 en localhost, toma esa reescritura por externa y la
      // reenvía por HTTP. Una sola regla por sitio: las de beforeFiles se encadenan sobre la ruta ya reescrita.
      beforeFiles: SITIOS.map((sitio) => ({
        source: '/:ruta(.*)',
        has: [{ type: 'header' as const, key: SITIO, value: sitio }],
        destination: `/${sitio}/:ruta`,
      })),
      afterFiles: [
        // :path* no captura la barra final y Django la exige (APPEND_SLASH): se reenvía tal cual, con y sin barra.
        { source: '/experience/:path*/', destination: `${experienceOrigin}/:path*/` },
        { source: '/experience/:path*', destination: `${experienceOrigin}/:path*` },
        // La API del comensal, mismo origen que su carta: el proxy same-origin traslada su cookie.
        { source: '/api/:path*/', destination: `${experienceOrigin}/api/:path*/` },
        { source: '/api/:path*', destination: `${experienceOrigin}/api/:path*` },
      ],
    }
  },
}

export default nextConfig
