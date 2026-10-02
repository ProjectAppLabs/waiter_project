'use client'
import { anyConfigId, useOrg } from '@/components/organization/OrgContext'
import { BenefitsForm } from '@/components/settings/BenefitsForm'

export default function OrganizationPromotions() {
  const configId = anyConfigId(useOrg().restaurants)
  return <section className="max-w-5xl"><h1 className="mb-6 text-[26px] font-bold">Promociones</h1>
    {configId ? <BenefitsForm configId={configId} /> : <p className="text-soft">Cargando…</p>}</section>
}
