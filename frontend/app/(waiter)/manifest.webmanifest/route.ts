import manifest from '@/lib/manifest'

// El manifiesto de la app instalable del POS. Con tres sitios en una sola app ya no es un archivo especial de Next (se
// inyectaría en todas las páginas, también en las de la landing): cada layout declara el suyo y el del comensal se sirve
// desde su host (proxy.ts).
export const dynamic = 'force-static'

export function GET() {
  return new Response(JSON.stringify(manifest()), { headers: { 'Content-Type': 'application/manifest+json' } })
}
