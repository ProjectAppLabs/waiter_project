import { serverDate } from '@/lib/domain/time'
export function billingDate(at: string, includeTime = false): string {
  if (!at) return '—'
  const timestamp = at.length > 10
  const date = timestamp ? serverDate(at) : new Date(at + 'T12:00:00Z')
  return date.toLocaleString('es-CO', {
    timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric',
    ...(timestamp && includeTime ? { hour: '2-digit', minute: '2-digit' } as const : {}),
  })
}
