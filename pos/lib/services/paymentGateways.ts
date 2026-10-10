import { adminCall } from '@/lib/services/core/admin'

// Pagos en línea (Wompi). Solo el dueño, con un código de su correo: `access` es el acceso de 15 minutos que da el
// código; ver y comprobar no lo gastan, conectar/activar/desconectar sí (un cambio por código). Las llaves se envían una
// vez y el servidor nunca las devuelve: de la pública solo llega una pista (prefijo y últimos cuatro caracteres).
export type GatewayEnvironment = 'test' | 'prod'
export type CheckState = 'ok' | 'fallo' | 'pendiente'
export interface GatewayChecks { comercio?: CheckState; llave_privada?: CheckState; integridad?: CheckState; eventos?: CheckState }
export interface GatewayConfiguration {
  environment: GatewayEnvironment; enabled: boolean; public_key_hint: string
  configured: Record<'private_key' | 'events' | 'integrity', boolean>
  merchant_name: string; checks: GatewayChecks; verified_at: string | null
  payment_method_id: number | null; webhook_url: string | null; webhook_path: string
}
export interface GatewaySettings { provider: string; configurations: GatewayConfiguration[]; live_available: boolean; methods: string[] }
export interface ConnectResult extends Partial<GatewaySettings> { ok: boolean; checks: GatewayChecks; detail?: string; merchant_name?: string }

export const requestAccess = () => adminCall<{ correo: string; vence: string }>('payment_gateways', { action: 'access_request' })
export const verifyAccess = (code: string) => adminCall<{ ok: boolean; acceso: string; vence: string }>('payment_gateways', { action: 'access_verify', code })
export const getPaymentGateways = (access: string) => adminCall<GatewaySettings>('payment_gateways', { action: 'get', access })
export const connectWompi = (access: string, environment: GatewayEnvironment, keys: string, enable: boolean) =>
  adminCall<ConnectResult>('payment_gateways', { action: 'connect', access, environment, keys, enable })
export const enableGateway = (access: string, environment: GatewayEnvironment, enabled: boolean) =>
  adminCall<GatewaySettings>('payment_gateways', { action: 'enable', access, environment, enabled })
export const disconnectGateway = (access: string, environment: GatewayEnvironment) =>
  adminCall<GatewaySettings>('payment_gateways', { action: 'disconnect', access, environment })

// Qué llaves hay en lo pegado (para mostrar ✓ sin mostrar nunca su valor). El servidor vuelve a leerlas y las valida.
const PATTERNS: Record<'public_key' | 'private_key' | 'events' | 'integrity', (env: GatewayEnvironment) => RegExp> = {
  public_key: (env) => new RegExp(`(?<![A-Za-z0-9_-])pub_${env}_[A-Za-z0-9_-]{8,160}`, 'g'),
  private_key: (env) => new RegExp(`(?<![A-Za-z0-9_-])prv_${env}_[A-Za-z0-9_-]{8,160}`, 'g'),
  events: (env) => new RegExp(`(?<![A-Za-z0-9_-])${env}_events_[A-Za-z0-9_-]{8,160}`, 'g'),
  integrity: (env) => new RegExp(`(?<![A-Za-z0-9_-])${env}_integrity_[A-Za-z0-9_-]{8,160}`, 'g'),
}
export type KeyName = keyof typeof PATTERNS
export const KEY_NAMES = Object.keys(PATTERNS) as KeyName[]
export function detectKeys(text: string, env: GatewayEnvironment): Partial<Record<KeyName, string>> {
  const found: Partial<Record<KeyName, string>> = {}
  for (const name of KEY_NAMES) { const match = text.match(PATTERNS[name](env)); if (match) found[name] = match[match.length - 1] }
  return found
}
export const otherEnvironmentKeys = (text: string, env: GatewayEnvironment) => Object.keys(detectKeys(text, env === 'test' ? 'prod' : 'test')).length > 0
