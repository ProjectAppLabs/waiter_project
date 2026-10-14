// Saludo de la cabecera de la carta. Si el administrador escribió uno (Diseño del menú → Saludo) manda ese;
// si no, se elige una frase del repertorio según la hora del día. La frase se fija una vez por visita (semilla al
// cargar la página) para que no cambie con cada render, y cambia de una visita a otra.
export type Moment = 'manana' | 'tarde' | 'noche'
type Phrase = { con: string; sin: string }

const SIEMPRE: Phrase[] = [
  { con: 'Qué gusto verte, {n}', sin: 'Qué gusto verte por aquí' },
  { con: '¿Qué se te antoja hoy, {n}?', sin: '¿Qué se te antoja hoy?' },
  { con: 'Qué bueno tenerte aquí, {n}', sin: 'Qué bueno tenerte aquí' },
  { con: 'Hoy te consentimos, {n}', sin: 'Hoy toca consentirse' },
  { con: 'Elige sin prisa, {n}', sin: 'Elige sin prisa, hay tiempo' },
  { con: 'Tu mesa te esperaba, {n}', sin: 'Tu mesa te esperaba' },
]
const POR_MOMENTO: Record<Moment, Phrase[]> = {
  manana: [
    { con: 'Buenos días, {n}', sin: 'Buenos días' },
    { con: '¿Con qué arrancamos hoy, {n}?', sin: '¿Con qué arrancamos hoy?' },
    { con: 'Un buen desayuno lo cambia todo, {n}', sin: 'Un buen desayuno lo cambia todo' },
  ],
  tarde: [
    { con: 'Buenas tardes, {n}', sin: 'Buenas tardes' },
    { con: 'Hora de comer rico, {n}', sin: 'Hora de comer rico' },
    { con: '¿Qué tal un antojo de tarde, {n}?', sin: '¿Qué tal un antojo de tarde?' },
  ],
  noche: [
    { con: 'Buenas noches, {n}', sin: 'Buenas noches' },
    { con: 'La noche pide algo rico, {n}', sin: 'La noche pide algo rico' },
    { con: '¿Cerramos el día con algo especial, {n}?', sin: '¿Cerramos el día con algo especial?' },
  ],
}

export function momentOf(hour: number): Moment {
  return hour < 12 ? 'manana' : hour < 19 ? 'tarde' : 'noche'
}

export function firstName(name?: string | null): string {
  return name?.trim().split(/\s+/)[0] || ''
}

// Semilla de la visita: se fija al cargar la página (una frase por visita), no por render.
const VISIT_SEED = Math.random()

export function pickGreeting(opts: { admin?: string | null; name?: string | null; hour?: number; seed?: number } = {}): string {
  const name = firstName(opts.name)
  const admin = opts.admin?.trim()
  if (admin) return name ? `${admin}, ${name}` : admin
  const hour = opts.hour ?? new Date().getHours()
  const pool = [...POR_MOMENTO[momentOf(hour)], ...SIEMPRE]
  const seed = opts.seed ?? VISIT_SEED
  const phrase = pool[Math.floor(seed * pool.length) % pool.length]
  return name ? phrase.con.replace('{n}', name) : phrase.sin
}
