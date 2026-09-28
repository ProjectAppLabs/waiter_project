'use client'
import { useEffect, useState } from 'react'

import { anyConfigId, useOrg } from '@/components/organization/OrgContext'
import { TeamView } from '@/components/organization/TeamView'
import { UsersForm } from '@/components/settings/KitSettingsForms'
import { RolePermissionsForm } from '@/components/settings/RolePermissionsForm'
import { listUsers, type UserInfo } from '@/lib/services/settings'

// Plan O: el equipo de toda la organización. Arriba, a qué restaurante va cada quien; luego las cuentas con correo
// (invitar y rol) y qué puede hacer cada rol, que vale para todos los restaurantes.
export default function OrganizationTeam() {
  const configId = anyConfigId(useOrg().restaurants)
  const [users, setUsers] = useState<UserInfo[]>([])
  const [version, setVersion] = useState(0)
  useEffect(() => { let alive = true; listUsers().then((u) => { if (alive) setUsers(u) }).catch(() => undefined); return () => { alive = false } }, [version])
  return <div className="flex flex-col gap-10">
    <TeamView />
    <section className="max-w-4xl"><UsersForm users={users} onChanged={async () => setVersion((v) => v + 1)} /></section>
    {configId && <section className="max-w-4xl"><RolePermissionsForm configId={configId} /></section>}
  </div>
}
