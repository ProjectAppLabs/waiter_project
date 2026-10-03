'use client'
import { RefundsView } from '@/components/business/RefundsView'
import { useOrg } from '@/components/organization/OrgContext'

// Plan U1: las devoluciones de todos los restaurantes de la organización.
export default function OrganizationRefunds() { return <RefundsView restaurants={useOrg().restaurants} /> }
