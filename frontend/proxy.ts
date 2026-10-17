import { NextResponse, type NextRequest } from 'next/server'

import { isLocalHost, isPlatformHost, orgFromHost } from '@/lib/domain/tenant'
import { SITIO, type Sitio } from '@/lib/sitio'

// Waiter es una sola app de Next que sirve tres sitios según el host:
// - menu.<dominio> es el comensal. Sus páginas, su /sw.js, sus /icons y su manifiesto viven bajo el prefijo interno
//   /diner; la URL del navegador no cambia, así que los QR y NFC impresos y el service worker instalado siguen igual.
// - El dominio central con nombre (waiter.projectapp.co) muestra la landing en sus cuatro páginas; lo demás es del POS
//   (/login, /entrar…).
// - Todo lo demás es el POS, como antes: las organizaciones por subdominio, la consola (platform.), las IP y
//   «localhost» del desarrollo y de las tabletas de la LAN, y cualquier otro host, con la misma lógica de tenant.
// El proxy sólo decide y anota el sitio en el encabezado SITIO; la reescritura al prefijo la hace next.config.ts.
const LANDING = new Set(['/', '/privacy', '/terms', '/data-deletion'])
// Lo que el comensal comparte con el resto de la app: los archivos de Next, su API (el rewrite a experience) y los
// recursos públicos que no chocan con los del POS.
const COMPARTIDO = ['/_next/', '/api/', '/smart-menu/', '/mapas/']
// Los prefijos internos sólo se alcanzan por la reescritura, nunca pidiéndolos directo: si no, el comensal y la landing
// aparecerían también bajo los hosts del POS.
const INTERNO = /^\/(diner|landing)(\/|$)/
// La consola de ProjectApp pasó de /plataforma a /platform el 17-10-2026: un enlace o un marcador viejo llega a la misma
// pantalla en la ruta nueva, con su consulta. En el host del menú /plataforma sigue siendo del comensal.
const CONSOLA_VIEJA = /^\/plataforma(?=\/|$)/

export const esHostDelMenu = (host: string): boolean => {
  const labels = host.split(':')[0].toLowerCase().split('.')
  return labels.length >= 2 && labels[0] === 'menu'
}

// El host viejo de la consola (plataforma.) dejó de existir el 17-10-2026. Si algún servidor todavía lo manda acá,
// responde 404: si no, pasaría por dominio central, con la landing y un inicio de sesión que lleva el pase a
// platform.plataforma….
const esHostViejoDeLaConsola = (host: string): boolean => host.split(':')[0].toLowerCase().startsWith('plataforma.')

// El dominio central con nombre: sin organización, sin la consola y sin el menú. Una IP o «localhost» a secas siguen
// siendo del POS (el desarrollo y las tabletas de la LAN entran por ahí).
export const esCentral = (host: string): boolean =>
  !isLocalHost(host) && !orgFromHost(host) && !isPlatformHost(host) && !esHostDelMenu(host)

export type Decision = { tipo: 'pasar' } | { tipo: 'no-encontrado' } | { tipo: 'sitio'; sitio: Sitio } | { tipo: 'redirigir'; ruta: string }

export function decidir(host: string, pathname: string, desarrollo = false): Decision {
  // La galería del kit es una herramienta local: el servidor publicado no sirve esta ruta.
  if (!desarrollo && (pathname === '/kit' || pathname.startsWith('/kit/'))) return { tipo: 'no-encontrado' }
  if (INTERNO.test(pathname)) return { tipo: 'no-encontrado' }
  if (esHostViejoDeLaConsola(host)) return { tipo: 'no-encontrado' }
  if (esHostDelMenu(host)) {
    return COMPARTIDO.some((prefijo) => pathname.startsWith(prefijo)) ? { tipo: 'pasar' } : { tipo: 'sitio', sitio: 'diner' }
  }
  if (CONSOLA_VIEJA.test(pathname)) return { tipo: 'redirigir', ruta: pathname.replace(CONSOLA_VIEJA, '/platform') }
  const limpio = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (esCentral(host) && LANDING.has(limpio)) return { tipo: 'sitio', sitio: 'landing' }
  return { tipo: 'pasar' }
}

// Corre en todas las peticiones (sin matcher), también en /_next/static, para que ninguna llegue a las reescrituras de
// next.config.ts con un SITIO puesto por el cliente.
export function proxy(request: NextRequest) {
  const decision = decidir(request.headers.get('host') ?? '', request.nextUrl.pathname, process.env.NODE_ENV === 'development')
  if (decision.tipo === 'no-encontrado') {
    return new NextResponse('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  if (decision.tipo === 'redirigir') {
    // Next deja relativa la dirección de una redirección al mismo host: el navegador la resuelve contra la dirección
    // pública, detrás de nginx también.
    const destino = request.nextUrl.clone()
    destino.pathname = decision.ruta
    return NextResponse.redirect(destino, 308)
  }
  // El sitio lo anota sólo este proxy: el encabezado que mande el cliente se descarta en cada petición.
  const headers = new Headers(request.headers)
  headers.delete(SITIO)
  if (decision.tipo === 'sitio') headers.set(SITIO, decision.sitio)
  return NextResponse.next({ request: { headers } })
}
