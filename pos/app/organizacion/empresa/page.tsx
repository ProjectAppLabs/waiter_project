'use client'
import { useEffect, useState } from 'react'

import { anyConfigId, useOrg } from '@/components/organization/OrgContext'
import { CompanyForm, TaxesList } from '@/components/settings/KitSettingsForms'
import { TaxRegimeForm } from '@/components/settings/TaxRegimeForm'
import { getCompany, listTaxes, type CompanyInfo, type TaxInfo } from '@/lib/services/settings'

// Plan O: la empresa es una para toda la organización (mismo NIT): datos legales, régimen tributario e impuestos.
export default function OrganizationCompany() {
  const configId = anyConfigId(useOrg().restaurants)
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [taxes, setTaxes] = useState<TaxInfo[]>([])
  useEffect(() => { void getCompany().then(setCompany); void listTaxes().then(setTaxes) }, [])
  return <section className="max-w-4xl flex flex-col gap-10"><h1 className="text-[26px] font-bold">Empresa e impuestos</h1>
    {company && <CompanyForm key={company.id} initial={company} />}
    {configId && <TaxRegimeForm configId={configId} />}
    <TaxesList taxes={taxes} /></section>
}
