// Horas que llegan del servidor. Odoo las manda sin zona («2026-09-05 01:12:43», UTC implícito); el sistema propio, en
// ISO 8601 con zona («2026-10-02T03:10:54.192Z»). Las dos se leen aquí, una sola vez.
export function serverDate(at: string): Date {
  const iso = at.includes('T') ? at : at.replace(' ', 'T')
  return new Date(/(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : iso + 'Z')
}
export const serverTime = (at: string): number => serverDate(at).getTime()
