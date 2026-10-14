'use client'
import { useRouter } from 'next/navigation'

import { McpInvite } from '@/components/settings/McpInvite'
import { MenuDecorationsForm } from '@/components/settings/MenuDecorationsForm'
import { MenuTemplateForm } from '@/components/settings/MenuTemplateForm'

// Plan O: un diseño del menú para todos los restaurantes de la organización (antes, en Configuración de cada POS).
export default function OrganizationDesign() {
  const router = useRouter()
  return <section className="max-w-5xl"><h1 className="mb-6 text-[26px] font-bold">Diseño del menú</h1>
    <McpInvite onConnect={() => router.push('/organizacion/integraciones')} /><MenuTemplateForm /><MenuDecorationsForm /></section>
}
