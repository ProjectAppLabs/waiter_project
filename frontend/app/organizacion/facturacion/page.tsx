'use client'
import { BillingView } from '@/components/business/BillingView'
import { RestaurantScope } from '@/components/organization/RestaurantScope'

// Plan Q: la facturación contable (ventas por facturar, documentos, notas crédito, flujo DIAN) es del dueño.
export default function OrganizationBilling() { return <RestaurantScope label="Restaurante"><BillingView /></RestaurantScope> }
