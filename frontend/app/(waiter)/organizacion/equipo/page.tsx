'use client'

import { anyConfigId, useOrg } from '@/components/organization/OrgContext'
import { TeamView } from '@/components/organization/TeamView'
import { RolePermissionsForm } from '@/components/settings/RolePermissionsForm'

// Plan P: el equipo de toda la organización (altas, invitaciones, rol, restaurante y turno de cada persona) y qué puede
// hacer cada rol, que vale para todos los restaurantes.
export default function OrganizationTeam() {
  const configId = anyConfigId(useOrg().restaurants)
  return <div className="flex flex-col gap-10">
    <TeamView />
    {configId && <section className="max-w-4xl"><RolePermissionsForm configId={configId} /></section>}
  </div>
}
