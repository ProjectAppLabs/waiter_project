import { coreFetch } from '@/lib/services/core/http'

// Plan WA: WhatsApp del restaurante (contrato en docs/planes/2026-10-09-plan-WA-whatsapp.md, «Servidor (Codex)»).
// El servidor manda los nombres de su modelo; aquí se traducen a lo que pinta la consola.
export type WaStatus = 'received' | 'sent' | 'delivered' | 'read' | 'failed'
export interface WaAccount { phone: string; name: string; quality: string | null; status: 'connected' | 'disconnected'; connected_at: string | null; test_number: boolean }
export interface WaSignup { app_id: string; config_id: string; graph_version: string }
export interface WaMessage { id: number; direction: 'in' | 'out'; type: string; text: string; template: string | null; status: WaStatus; error: string | null; at: string }
export interface WaConversationRow { id: number; wa_id: string; name: string; last_inbound_at: string | null; window_open: boolean; last_message: WaMessage | null }
export interface WaConversation { id: number; wa_id: string; name: string; window_open: boolean; messages: WaMessage[] }
export interface WaOverview { account: WaAccount | null; signup: WaSignup | null; recent: WaConversationRow[] }

interface RawMessage { id: number; direction: 'in' | 'out'; type: string; text: string; template: string; status: WaStatus; error_message: string; created_at: string }
interface RawConversation { id: number; wa_id: string; profile_name: string; last_inbound_at: string | null; window_open: boolean; last_message: RawMessage | null }

const toMessage = (m: RawMessage): WaMessage => ({ id: m.id, direction: m.direction, type: m.type, text: m.text ?? '', template: m.template || null, status: m.status, error: m.error_message || null, at: m.created_at })
const toRow = (c: RawConversation): WaConversationRow => ({ id: c.id, wa_id: c.wa_id, name: c.profile_name ?? '', last_inbound_at: c.last_inbound_at, window_open: c.window_open, last_message: c.last_message ? toMessage(c.last_message) : null })

export const whatsappOverview = () => coreFetch<{ account: WaAccount | null; signup: WaSignup | null; recent: RawConversation[] }>('whatsapp')
  .then((r) => ({ account: r.account, signup: r.signup, recent: r.recent.map(toRow) }))
// El registro integrado devuelve el código y los ids; en coexistencia (app del celular) Meta puede no mandar el número.
export const connectWhatsapp = (body: { code: string; waba_id: string; phone_number_id: string; business_app?: boolean }) =>
  coreFetch<{ account: WaAccount }>('whatsapp/connect', { method: 'POST', body: { ...body, business_app: !!body.business_app } }).then((r) => r.account)
export const disconnectWhatsapp = () => coreFetch<{ account: WaAccount }>('whatsapp/disconnect', { method: 'POST' }).then((r) => r.account)
export const sendWhatsappTest = (to: string) => coreFetch<{ message: RawMessage }>('whatsapp/test', { method: 'POST', body: { to } }).then((r) => toMessage(r.message))
export const whatsappConversation = (id: number) => coreFetch<{ conversation: RawConversation; messages: RawMessage[] }>(`whatsapp/conversations/${id}`)
  .then((r): WaConversation => ({ id: r.conversation.id, wa_id: r.conversation.wa_id, name: r.conversation.profile_name ?? '', window_open: r.conversation.window_open, messages: r.messages.map(toMessage) }))
export const replyWhatsapp = (id: number, text: string) => coreFetch<{ message: RawMessage }>(`whatsapp/conversations/${id}/reply`, { method: 'POST', body: { text } })
  .then((r) => ({ message: toMessage(r.message) }))
