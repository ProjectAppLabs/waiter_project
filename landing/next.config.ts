import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // La landing reproduce un diseño de Claude Design que no corre bajo StrictMode: el doble montaje de desarrollo
  // arrancaría dos veces las animaciones de GSAP.
  reactStrictMode: false,
  // Igual que el comensal: el servidor de desarrollo se abre por la IP de la red local y, en WSL2, por localhost.
  allowedDevOrigins: [process.env.WAITER_HOST || '192.168.56.10', 'localhost', '127.0.0.1'],
  devIndicators: false,
  // La landing vive en la raíz de waiter.projectapp.co junto al POS, que sirve /login (el inicio de sesión universal):
  // sus archivos van bajo /_landing/_next para no chocar con los del POS en /_next (las «zonas» de Next). Caddy manda a
  // la landing sus páginas, /img y /_landing; lo demás al POS (deploy/Caddyfile).
  assetPrefix: '/_landing',
  images: { unoptimized: true },
}

export default nextConfig
