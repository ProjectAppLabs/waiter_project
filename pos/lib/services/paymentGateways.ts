import { adminCall } from '@/lib/services/core/admin'
export type GatewayEnvironment = 'test' | 'prod'
export interface GatewayConfiguration {
  environment: GatewayEnvironment; enabled: boolean; public_key: string
  configured: Record<'private_key' | 'events' | 'integrity', boolean>
  payment_method_id: number | null; webhook_url: string | null; webhook_path: string
}
export interface GatewaySettings { provider: string; configurations: GatewayConfiguration[]; live_available: boolean; methods: string[] }
export const getPaymentGateways = () => (adminCall<GatewaySettings>('payment_gateways', { action: 'get' }))
export const savePaymentGateway = (configuration: Record<string, unknown>) => (adminCall<GatewaySettings>('payment_gateways', { action: 'set', configuration }))
export const testPaymentGateway = (environment: GatewayEnvironment) => (adminCall<{ ok: boolean; name: string; methods: string[]; detail: string }>('payment_gateways', { action: 'test', environment }))
