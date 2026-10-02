import { adminCall } from '@/lib/services/core/admin'

export interface McpKey { id: number; nombre: string; prefijo: string; creadaPor: string; creada: string; ultimoUso: string | null; revocada: string | null }
export interface McpKeyList { claves: McpKey[]; mcpUrl: string }
export interface CreatedMcpKey extends McpKey { clave: string; mcpUrl: string }
export const listMcpKeys = () => (adminCall<McpKeyList>('mcp_keys', { action: 'list' }))
export const createMcpKey = (nombre: string) => (adminCall<CreatedMcpKey>('mcp_keys', { action: 'create', nombre }))
export const revokeMcpKey = (keyId: number) => (adminCall<{ revocada: number }>('mcp_keys', { action: 'revoke', key_id: keyId }))

// Cómo se conecta cada cliente: claude.ai solo acepta una URL (la clave va en la ruta); Claude Code manda la cabecera.
export const connectorUrl = (mcpUrl: string, clave: string) => `${mcpUrl.replace(/\/+$/, '')}/${clave}/`
export const claudeCodeCommand = (mcpUrl: string, clave: string) => `claude mcp add --transport http waiter ${mcpUrl} --header "Authorization: Bearer ${clave}"`
