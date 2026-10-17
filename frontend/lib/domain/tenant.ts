// Plan T: una organización por subdominio. `burger-house.waiter.projectapp.co` → `burger-house`; en desarrollo
// `burger-house.localhost:3000` (los navegadores resuelven *.localhost solos). Sin subdominio (una tableta en la LAN por
// la IP) vale la organización por omisión, solo en desarrollo.
// La consola de ProjectApp tiene su propio subdominio, en inglés como menu. y api. `plataforma`, su nombre hasta el
// 17-10-2026, sigue reservado para que ninguna organización ocupe la dirección vieja.
const PLATFORM_SUBDOMAIN = 'platform'
export const RESERVED_SUBDOMAINS = [PLATFORM_SUBDOMAIN, 'plataforma', 'www', 'api', 'menu', 'admin', 'app'] as const
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

export const isPlatformHost = (host: string): boolean => host.split(':')[0].toLowerCase().startsWith(`${PLATFORM_SUBDOMAIN}.`)

// La organización de este navegador: el subdominio o, en desarrollo, la que fija NEXT_PUBLIC_DEFAULT_ORG.
export function currentOrg(): string | null {
  if (typeof window === 'undefined') return null
  return orgFromHost(window.location.host, process.env.NEXT_PUBLIC_DEFAULT_ORG || null)
}

// Inicio de sesión universal: todos entran por la dirección sin organización (waiter.projectapp.co/login; en desarrollo
// localhost:3000/login) y de ahí pasan, ya identificados, al subdominio de su organización o a la consola de ProjectApp.
const IP = /^\d+(\.\d+){3}$/
// Una IP o «localhost» a secas: el equipo de desarrollo o una tableta de la red local.
export const isLocalHost = (host: string): boolean => { const name = host.split(':')[0].toLowerCase(); return name === 'localhost' || IP.test(name) }
// La dirección del inicio universal vista desde cualquier otra: sin el subdominio de la organización ni el de la consola.
export function centralHost(host: string): string {
  return orgFromHost(host) || isPlatformHost(host) ? host.slice(host.indexOf('.') + 1) : host
}
export const isCentralHost = (host: string): boolean => centralHost(host) === host

// A dónde se va a cambiar el pase. En una IP o en «localhost» a secas (desarrollo, tabletas por la LAN) la organización
// por omisión y la consola viven en la misma dirección; las demás organizaciones, en `<org>.localhost`.
export function destinationOrigin(kind: 'pos' | 'platform', slug: string | null, here: { protocol: string; host: string }, defaultOrg: string | null = null): string {
  const central = centralHost(here.host)
  if (isLocalHost(central) && (kind === 'platform' || slug === defaultOrg)) return `${here.protocol}//${central}`
  const [name, port] = central.split(':')
  const base = IP.test(name) ? `localhost${port ? `:${port}` : ''}` : central
  return `${here.protocol}//${kind === 'platform' ? PLATFORM_SUBDOMAIN : slug}.${base}`
}

// La dirección de esta pestaña y el cambio a otra (recarga la página). Van aparte para que las pruebas los simulen.
export const here = (): { protocol: string; host: string } => ({ protocol: window.location.protocol, host: window.location.host })
export function leaveTo(url: string, { replace = false } = {}): void {
  if (replace) window.location.replace(url); else window.location.assign(url)
}
