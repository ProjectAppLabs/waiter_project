'use client'
import { TeamHoursView } from '@/components/business/TeamHoursView'
import { useOrg } from '@/components/organization/OrgContext'

// Plan Y5: horas y propinas por persona, base para la nómina.
export default function OrganizationTeamHours() { return <TeamHoursView restaurants={useOrg().restaurants} /> }
