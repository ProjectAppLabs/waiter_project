'use client'
import { CashClosingsView } from '@/components/business/CashClosingsView'
import { useOrg } from '@/components/organization/OrgContext'

// Plan Q3: los cierres de caja de todos los restaurantes; el dueño fija la tolerancia.
export default function OrganizationCashClosings() { return <CashClosingsView restaurants={useOrg().restaurants} canSetTolerance /> }
