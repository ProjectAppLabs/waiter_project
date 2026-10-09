import { coreFetch } from '@/lib/services/core/http'

// Plan WA: WhatsApp del restaurante (contrato en docs/planes/2026-10-09-plan-WA-whatsapp.md).
export type WaStatus = 'received' | 'sent' | 'delivered' | 'read' | 'failed'
export interface WaAccount { phone: string; name: string; quality: string | null; status: 'connected' | 'disconnected'; connected_at: string | null; test_number: boolean }
export interface WaSignup { app_id: string; config_id: string; graph_version: string }
export interface WaConversationRow { id: number; wa_id: string; name: string; last_inbound_at: string | null; window_open: boolean; last_message: { direction: 'in' | 'out'; text: string; status: WaStatus; at: string } | null }
export interface WaMessage { id: number; direction: 'in' | 'out'; type: string; text: string; template: string | null; status: WaStatus; error: string | null; at: string }
export interface WaConversation { id: number; wa_id: string; name: string; window_open: boolean; messages: WaMessage[] }
export interface WaOverview { account: WaAccount | null; signup: WaSignup | null; recent: WaConversationRow[] }

export const whatsappOverview = () => coreFetch<WaOverview>('whatsapp')
export const connectWhatsapp = (body: { code: string; waba_id: string; phone_number_id: string }) => coreFetch<WaOverview>('whatsapp/connect', { method: 'POST', body })
export const disconnectWhatsapp = () => coreFetch<WaOverview>('whatsapp/disconnect', { method: 'POST' })
export const sendWhatsappTest = (to: string) => coreFetch<{ ok: true; wamid: string | null }>('whatsapp/test', { method: 'POST', body: { to } })
export const whatsappConversation = (id: number) => coreFetch<WaConversation>(`whatsapp/conversations/${id}`)
export const replyWhatsapp = (id: number, text: string) => coreFetch<{ message: WaMessage }>(`whatsapp/conversations/${id}/reply`, { method: 'POST', body: { text } })
