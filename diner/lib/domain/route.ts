// /[rest]/[sede]/(t/<token>/)?(pantalla)?(/id)? — una sola página despacha; domicilio y mesa comparten todo.
// 'la-cuenta' es pedir la cuenta al salón (Plan F); 'cuenta' es Mi cuenta del comensal (Plan H) con 'registro' y 'codigo' debajo.
// 'reserva' es el enlace de pago del anticipo: /<rest>/<sede>/reserva/<token>. No pertenece a una mesa ni a una visita.
export type Screen = 'reserva' | 'cuenta/correo' | 'cuenta/canal' | 'cuenta/lista' | 'cuenta/tarjetas' | 'cuenta/recuperar' | 'cuenta/restablecer' | 'cuenta/entrar' | 'cuenta/clave' | 'opinion' | 'bienvenida' | 'ubicacion' | 'recompensas' | 'recibo' | 'cuenta/informacion' | 'asistente' | 'preferencias' | 'acerca' | 'ayuda' | 'favoritos' | 'historial' | 'portada' | 'carta' | 'plato' | 'pedido' | 'estado' | 'la-cuenta' | 'pago' | 'cuenta' | 'cuenta/registro' | 'cuenta/codigo'
export interface Route { token: string | null; screen: Screen; id: string | null }
const SCREENS: Screen[] = ['reserva', 'opinion', 'ubicacion', 'recompensas', 'recibo', 'favoritos', 'historial', 'carta', 'plato', 'pedido', 'estado', 'la-cuenta', 'pago', 'cuenta']
const ACCOUNT_SUBSCREENS = ['registro', 'codigo', 'informacion', 'entrar', 'clave', 'recuperar', 'restablecer', 'tarjetas', 'correo', 'canal', 'lista'] as const

export function parseRoute(segments: string[] = []): Route {
  const rest = [...segments]
  let token: string | null = null
  if (rest[0] === 't' && rest[1]) { token = rest[1]; rest.splice(0, 2) }
  const head = rest[0] ?? ''
  if (head === 'cuenta' && (ACCOUNT_SUBSCREENS as readonly string[]).includes(rest[1] ?? '')) return { token, screen: `cuenta/${rest[1]}` as Screen, id: null }
  // El QR y la entrada de la sede abren la carta sin una portada intermedia.
  const screen = (SCREENS as string[]).includes(head) ? (head as Screen) : 'carta'
  return { token, screen, id: (SCREENS as string[]).includes(head) ? rest[1] ?? null : null }
}

export function pathFor(rest: string, venue: string, token: string | null, screen: Screen, id?: string | number, draft?: string | null): string {
  const head = `/${rest}/${venue}${token ? `/t/${token}` : ''}`
  const path = screen === 'portada' ? head : `${head}/${screen}${id !== undefined ? `/${id}` : ''}`
  return draft != null ? `${path}?borrador=${encodeURIComponent(draft)}` : path
}
