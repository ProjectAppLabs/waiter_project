'use client'
import { AuditView } from '@/components/business/AuditView'
import { useOrg } from '@/components/organization/OrgContext'

// Plan Y2: el historial de cambios de la organización.
export default function OrganizationAudit() { return <AuditView restaurants={useOrg().restaurants} /> }
