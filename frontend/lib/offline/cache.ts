import { currentOrg } from '@/lib/domain/tenant'

// Plan U2: la última respuesta de las lecturas que el POS necesita para seguir trabajando sin conexión (la carta, las
// mesas, los métodos de pago, la caja abierta, los pedidos abiertos). Se guarda en el navegador por organización y se
// usa solo si el servidor no responde.
const CACHED = [/^catalog\b/, /^restaurants$/, /^settings\/roles$/, /^tables\/calls\b/, /^categories$/, /^loyalty\/program$/, /^notifications\b/, /^subscription$/, /^menu\b/, /^products\b/, /^taxes\b/, /^floors\b/, /^tables\b/, /^payment-methods\b/, /^settings\b/, /^restaurants\/\d+\/settings\b/,
  /^shifts\/open\b/, /^shifts\/\d+\/closing$/, /^orders\?/, /^orders\/\d+$/, /^auth\/me$/, /^org$/, /^kitchen\/tickets\b/, /^me\/notify-prefs$/]
// Una respuesta enorme no cabe en el almacenamiento del navegador ni vale la pena guardarla.
const MAX_BYTES = 750_000
export interface CacheContext { readonly organization: string; readonly version: string }
const sessionKey = (organization: string) => `waiter.cache-session:${organization}`
const prefix = (organization: string) => `waiter.cache:${organization}:`
// Si el navegador deniega el almacenamiento, la salida también invalida las respuestas pendientes de esta pestaña.
const versions = new Map<string, string>()
const unpersisted = new Set<string>()
function versionOf(organization: string): string {
  if (unpersisted.has(organization)) return versions.get(organization) ?? ''
  try {
    const version = localStorage.getItem(sessionKey(organization)) ?? ''
    versions.set(organization, version)
    return version
  } catch { return versions.get(organization) ?? '' }
}
export const captureCacheContext = (): CacheContext => {
  const organization = currentOrg() ?? '-'
  return { organization, version: versionOf(organization) }
}
export const isCurrentCacheContext = (context: CacheContext): boolean =>
  context.organization === (currentOrg() ?? '-') && context.version === versionOf(context.organization)
export const cacheSessionEnded = (context = captureCacheContext()): boolean => context.version.startsWith('closed:')
const key = (path: string, context: CacheContext) => `${prefix(context.organization)}${context.version ? `${context.version}:` : ''}${path}`

function changeSession(ended: boolean): void {
  const organization = currentOrg() ?? '-'
  const version = `${ended ? 'closed' : 'active'}:${Date.now()}:${Math.random().toString(36).slice(2)}`
  versions.set(organization, version)
  unpersisted.add(organization)
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const name = localStorage.key(index)
      if (name?.startsWith(prefix(organization))) keys.push(name)
    }
    for (const name of keys) localStorage.removeItem(name)
  } catch { /* si no se pueden retirar lecturas, la nueva versión las deja fuera de la sesión */ }
  try {
    localStorage.setItem(sessionKey(organization), version)
    unpersisted.delete(organization)
  } catch { /* la versión en memoria protege la sesión aunque no se pueda guardar */ }
}

// Solo se retiran lecturas: la cola de operaciones pendientes pertenece a la organización y se conserva.
export const endCacheSession = (): void => changeSession(true)
export const startCacheSession = (): void => changeSession(false)

export const cacheable = (path: string) => CACHED.some((re) => re.test(path))

export function remember(path: string, text: string, context = captureCacheContext()): void {
  if (!cacheable(path) || text.length > MAX_BYTES || !isCurrentCacheContext(context) || cacheSessionEnded(context)) return
  try { localStorage.setItem(key(path, context), text) } catch { /* almacenamiento lleno: se sigue sin caché */ }
}

export function recall(path: string, context = captureCacheContext()): string | null {
  if (!cacheable(path) || !isCurrentCacheContext(context) || cacheSessionEnded(context)) return null
  try { return localStorage.getItem(key(path, context)) } catch { return null }
}
