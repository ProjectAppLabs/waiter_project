import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // La landing reproduce un diseño de Claude Design que no corre bajo StrictMode: el doble montaje de desarrollo
  // arrancaría dos veces las animaciones de GSAP.
  reactStrictMode: false,
  // Igual que el comensal: el servidor de desarrollo se abre por la IP de la red local y, en WSL2, por localhost.
  allowedDevOrigins: [process.env.WAITER_HOST || '192.168.56.10', 'localhost', '127.0.0.1'],
  devIndicators: false,
  images: { unoptimized: true },
}

export default nextConfig
