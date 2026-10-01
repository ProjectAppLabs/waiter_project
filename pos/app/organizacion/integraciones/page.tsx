'use client'
import { useTranslations } from 'next-intl'

import { McpKeysForm } from '@/components/settings/McpKeysForm'

// Plan O: las claves del MCP son de la organización: la IA diseña el menú de todos sus restaurantes. Plan Q: aquí también
// queda el mesero IA (antes en Automatización del POS); su analítica y su configuración llegan con el sprint de integraciones.
export default function OrganizationIntegrations() {
  const t = useTranslations('pos.roi.ai')
  return <section className="max-w-4xl flex flex-col gap-8"><h1 className="text-[26px] font-bold">Integraciones IA</h1><McpKeysForm />
    <section className="rounded-lg border border-border p-5 flex flex-col gap-2"><h2 className="text-[18px] font-semibold">{t('title')}</h2><p className="text-soft">{t('body')}</p></section>
  </section>
}
