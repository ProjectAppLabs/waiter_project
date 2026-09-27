import { jsonRpc } from '@/lib/services/odoo'

// Claves del MCP de Waiter (experience/experience_app/mcp). El POS no habla con experience: pasa por la pasarela del addon
// (/waiter/admin/mcp_keys), que exige administrador del POS y toma la sede de Odoo, nunca del navegador.
export interface McpKey { id: number; nombre: string; prefijo: string; creadaPor: string; creada: string; ultimoUso: string | null; revocada: string | null }
export interface McpKeyList { claves: McpKey[]; mcpUrl: string }
export interface CreatedMcpKey extends McpKey { clave: string; mcpUrl: string }

const PATH = '/waiter/admin/mcp_keys'
export const listMcpKeys = () => jsonRpc<McpKeyList>(PATH, { action: 'list' })
export const createMcpKey = (nombre: string) => jsonRpc<CreatedMcpKey>(PATH, { action: 'create', nombre })
export const revokeMcpKey = (keyId: number) => jsonRpc<{ revocada: number }>(PATH, { action: 'revoke', key_id: keyId })

// Cómo se conecta cada cliente: claude.ai solo acepta una URL (la clave va en la ruta); Claude Code manda la cabecera.
export const connectorUrl = (mcpUrl: string, clave: string) => `${mcpUrl.replace(/\/+$/, '')}/${clave}/`
export const claudeCodeCommand = (mcpUrl: string, clave: string) => `claude mcp add --transport http waiter ${mcpUrl} --header "Authorization: Bearer ${clave}"`
