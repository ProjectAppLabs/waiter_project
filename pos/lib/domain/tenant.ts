// Plan T: una organización por subdominio. `burger-house.waiter.projectapp.co` → `burger-house`; en desarrollo
// `burger-house.localhost:3000` (los navegadores resuelven *.localhost solos). Sin subdominio (una tableta en la LAN por
// la IP) vale la organización por omisión, solo en desarrollo.
export const RESERVED_SUBDOMAINS = ['plataforma', 'www', 'api', 'menu', 'admin', 'app'] as const
export const ORG_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function orgFromHost(host: string, fallback: string | null = null): string | null {
  const name = host.split(':')[0].toLowerCase()
  const labels = name.split('.')
  // Una IP o «localhost» a secas no llevan organización.
  if (labels.length < 2 || /^\d+(\.\d+){3}$/.test(name)) return fallback
  const first = labels[0]
  if ((RESERVED_SUBDOMAINS as readonly string[]).includes(first) || !ORG_SLUG.test(first)) return fallback
  // «waiter.projectapp.co» sin subdominio: las dos últimas etiquetas más una son el dominio base, no una organización.
  if (labels.length === 3 && labels[0] === 'waiter' && labels[1] === 'projectapp') return fallback
  return first
}

export const isPlatformHost = (host: string): boolean => host.split(':')[0].toLowerCase().startsWith('plataforma.')

// La organización de este navegador: el subdominio o, en desarrollo, la que fija NEXT_PUBLIC_DEFAULT_ORG.
export function currentOrg(): string | null {
  if (typeof window === 'undefined') return null
  return orgFromHost(window.location.host, process.env.NEXT_PUBLIC_DEFAULT_ORG || null)
}
