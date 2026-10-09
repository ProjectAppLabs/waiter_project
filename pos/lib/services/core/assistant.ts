import { coreFetch } from '@/lib/services/core/http'

// Plan AS: el asistente común del menú y de WhatsApp (contrato en docs/planes/2026-10-09-plan-AS-asistente.md,
// «Servidor (Codex)»). Aquí se traducen las respuestas del servidor a lo que pinta la consola.
export interface TagWord { key: string; name: string }
export interface TaggedProduct { id: number; name: string; tags: string[]; reviewed: boolean }
export interface AssistantTags { vocabulary: TagWord[]; products: TaggedProduct[] }
export type Standing = 'restricted' | 'paused'
export interface AssistantParticipant { id: number; channel: 'menu' | 'whatsapp'; name: string; standing: Standing; reason: string; until: string | null }
export interface AssistantStatus { evaluator: boolean; voice: boolean; today: { turns: number; model_turns: number; cost: number }; limit: number | null }

export const assistantTags = () => coreFetch<AssistantTags>('assistant/tags')
export const saveTags = (productId: number, tags: string[]) =>
  coreFetch<{ product: TaggedProduct }>(`assistant/tags/${productId}`, { method: 'PATCH', body: { tags } }).then((r) => r.product)
// Propone etiquetas con IA sin marcarlas revisadas; sin la clave de la voz, el servidor responde 503.
export const proposeTags = (productIds: number[] | null) =>
  coreFetch<{ products: TaggedProduct[] }>('assistant/tags/propose', { method: 'POST', body: { product_ids: productIds } }).then((r) => r.products)
export const restrictedParticipants = () =>
  coreFetch<{ participants: AssistantParticipant[] }>('assistant/participants?restricted=1').then((r) => r.participants)
export const liftRestriction = (id: number) => coreFetch<unknown>(`assistant/participants/${id}/lift`, { method: 'POST' })
export const assistantStatus = () => coreFetch<AssistantStatus>('assistant/status')
