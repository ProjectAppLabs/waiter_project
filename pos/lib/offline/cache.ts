import { currentOrg } from '@/lib/domain/tenant'

// Plan U2: la última respuesta de las lecturas que el POS necesita para seguir trabajando sin conexión (la carta, las
// mesas, los métodos de pago, la caja abierta, los pedidos abiertos). Se guarda en el navegador por organización y se
// usa solo si el servidor no responde.
const CACHED = [/^catalog\b/, /^restaurants$/, /^settings\/roles$/, /^tables\/calls\b/, /^categories$/, /^loyalty\/program$/, /^notifications\b/, /^subscription$/, /^menu\b/, /^products\b/, /^taxes\b/, /^floors\b/, /^tables\b/, /^payment-methods\b/, /^settings\b/, /^restaurants\/\d+\/settings\b/,
  /^shifts\/open\b/, /^shifts\/\d+\/closing$/, /^orders\?/, /^orders\/\d+$/, /^auth\/me$/, /^org$/, /^kitchen\/tickets\b/, /^me\/notify-prefs$/]
// Una respuesta enorme no cabe en el almacenamiento del navegador ni vale la pena guardarla.
const MAX_BYTES = 750_000
const key = (path: string) => `waiter.cache:${currentOrg() ?? '-'}:${path}`

export const cacheable = (path: string) => CACHED.some((re) => re.test(path))

export function remember(path: string, text: string): void {
  if (!cacheable(path) || text.length > MAX_BYTES) return
  try { localStorage.setItem(key(path), text) } catch { /* almacenamiento lleno: se sigue sin caché */ }
}

export function recall(path: string): string | null {
  if (!cacheable(path)) return null
  try { return localStorage.getItem(key(path)) } catch { return null }
}
