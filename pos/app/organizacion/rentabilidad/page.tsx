'use client'
import { ProfitabilityView } from '@/components/business/ProfitabilityView'
import { useOrg } from '@/components/organization/OrgContext'

// Plan Q4: costo, margen e ingeniería de menú de toda la organización o de un restaurante.
export default function OrganizationProfitability() { return <ProfitabilityView restaurants={useOrg().restaurants} allowOrganization /> }
