import manifest from '@diner/lib/manifest'

// El manifiesto de la carta instalable. El navegador lo pide como /manifest.webmanifest en el host del menú y proxy.ts lo
// reescribe a esta ruta, la misma URL que tenía cuando el comensal era una app aparte.
export const dynamic = 'force-static'

export function GET() {
  return new Response(JSON.stringify(manifest()), { headers: { 'Content-Type': 'application/manifest+json' } })
}
