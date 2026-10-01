'use client'
import { useEffect, useState } from 'react'

import { RestaurantScope } from '@/components/organization/RestaurantScope'
import { PaymentMethodsList } from '@/components/settings/KitSettingsForms'
import { KitchenPaymentPolicyForm } from '@/components/settings/KitchenPaymentPolicyForm'
import { PaymentGatewayForm } from '@/components/settings/PaymentGatewayForm'
import { listPaymentMethods, type PaymentMethodInfo } from '@/lib/services/settings'
import { useCatalogStore } from '@/lib/stores/catalogStore'

// Plan Q: los medios de pago, la pasarela con sus credenciales y «cobrar antes de cocina» de cada restaurante los decide
// el dueño; el encargado los ve en su Configuración.
function Payments() {
  const configId = useCatalogStore((s) => s.catalog?.settings.configId ?? null)
  const [methods, setMethods] = useState<PaymentMethodInfo[]>([])
  useEffect(() => { let alive = true; listPaymentMethods().then((m) => { if (alive) setMethods(m) }).catch(() => undefined); return () => { alive = false } }, [configId])
  if (!configId) return null
  return <div className="px-5 flex max-w-4xl flex-col gap-8">
    <PaymentMethodsList methods={methods} />
    <PaymentGatewayForm key={configId} methods={methods} />
    <KitchenPaymentPolicyForm configId={configId} />
  </div>
}
export default function OrganizationPayments() {
  return <section className="flex flex-col gap-4"><h1 className="text-[26px] font-bold">Pagos</h1><RestaurantScope label="Restaurante"><Payments /></RestaurantScope></section>
}
