'use client'
import { McpKeysForm } from '@/components/settings/McpKeysForm'

// Plan O: las claves del MCP son de la organización: la IA diseña el menú de todos sus restaurantes.
export default function OrganizationIntegrations() {
  return <section className="max-w-4xl"><h1 className="mb-6 text-[26px] font-bold">Integraciones IA</h1><McpKeysForm /></section>
}
