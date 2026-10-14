export function serverDate(at: string): Date {
  const iso = at.includes('T') ? at : at.replace(' ', 'T')
  return new Date(/(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : iso + 'Z')
}
export const serverTime = (at: string): number => serverDate(at).getTime()
