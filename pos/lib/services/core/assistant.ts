import { coreFetch } from '@/lib/services/core/http'

// Plan AS: el asistente común del menú y de WhatsApp (contrato en docs/planes/2026-10-09-plan-AS-asistente.md,
// «Servidor (Codex)»). Aquí se traducen las respuestas del servidor a lo que pinta la consola.
export interface TagWord { key: string; name: string }
export interface TaggedProduct { id: number; name: string; tags: string[]; reviewed: boolean }
export interface AssistantTags { vocabulary: TagWord[]; products: TaggedProduct[] }
export type Standing = 'restricted' | 'paused'
// El servidor guarda al cliente con una huella, no con su nombre ni su número: la consola lo muestra por canal y motivo.
export interface AssistantParticipant { id: number; channel: 'menu' | 'whatsapp'; standing: Standing; reason: string; until: string | null }
export interface AssistantStatus { evaluator: boolean; voice: boolean; messages: number; perRestaurant: number; perParticipant: number }

interface RawParticipant { id: number; channel: 'menu' | 'whatsapp'; status: Standing; reason: string; until: string | null }
interface RawStatus { configured: { jev: boolean; voice: boolean }; usage: { messages: number }; limits: { per_participant: number; per_restaurant: number } }
const toParticipant = (p: RawParticipant): AssistantParticipant => ({ id: p.id, channel: p.channel, standing: p.status, reason: p.reason, until: p.until })

export const assistantTags = () => coreFetch<AssistantTags>('assistant/tags')
export const saveTags = (productId: number, tags: string[]) =>
  coreFetch<{ product: TaggedProduct }>(`assistant/tags/${productId}`, { method: 'PATCH', body: { tags } }).then((r) => r.product)
// Propone etiquetas con IA sin marcarlas revisadas; sin la clave de la voz, el servidor responde 503.
export const proposeTags = (productIds: number[] | null) =>
  coreFetch<{ products: TaggedProduct[] }>('assistant/tags/propose', { method: 'POST', body: { product_ids: productIds } }).then((r) => r.products)
export const restrictedParticipants = () =>
  coreFetch<{ participants: RawParticipant[] }>('assistant/participants?restricted=1').then((r) => r.participants.map(toParticipant))
export const liftRestriction = (id: number) => coreFetch<unknown>(`assistant/participants/${id}/lift`, { method: 'POST' })
export const assistantStatus = () => coreFetch<RawStatus>('assistant/status').then((r): AssistantStatus => ({
  evaluator: r.configured.jev, voice: r.configured.voice, messages: r.usage.messages, perRestaurant: r.limits.per_restaurant, perParticipant: r.limits.per_participant,
}))
