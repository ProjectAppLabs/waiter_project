import { coreFetch } from '@/lib/services/core/http'
import type { CoreCourse, CoreLine } from '@/lib/services/core/sales'

// Plan T2: la cocina del sistema propio. Cocina marca listo; el salón entrega (a dos manos).
export interface CoreTicketLine { id: number; name: string; qty: number; note: string; station: string; ready_at: string | null; served_at: string | null }
export interface CoreTicket {
  id: number; order_id: number; number: string; table_number: number | null; service: 'dine_in' | 'takeout' | 'delivery'; waiter: { id: number; name: string } | string | null; note: string
  fired_at: string; preparation_at: string | null; ready_at: string | null; lines: CoreTicketLine[]
}
export interface CoreTickets { tickets: CoreTicket[]; completed: { fired_at: string; ready_at: string }[] }

export const listTickets = (restaurantId: number) => coreFetch<CoreTickets>(`kitchen/tickets?restaurant_id=${restaurantId}`)
export const startCourse = (id: number) => coreFetch<{ course: CoreCourse }>(`courses/${id}/start`, { method: 'POST' })
export const readyCourse = (id: number) => coreFetch<{ course: CoreCourse }>(`courses/${id}/ready`, { method: 'POST' })
export const serveCourse = (id: number) => coreFetch<{ course: CoreCourse }>(`courses/${id}/serve`, { method: 'POST' })
export const readyLines = (lineIds: number[]) => coreFetch<{ lines: CoreLine[] }>('lines/ready', { method: 'POST', body: { line_ids: lineIds } })
export const serveLines = (lineIds: number[]) => coreFetch<{ lines: CoreLine[] }>('lines/serve', { method: 'POST', body: { line_ids: lineIds } })
