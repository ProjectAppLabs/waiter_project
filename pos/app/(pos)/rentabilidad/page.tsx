'use client'
import { ProfitabilityView } from '@/components/business/ProfitabilityView'
import { useAuthStore } from '@/lib/stores/authStore'

// Plan Q4: el encargado ve costo y margen de los platos de su restaurante (decisión del dueño: le sirve para mermas).
export default function ProfitabilityPage() {
  const restaurant = useAuthStore((s) => s.restaurant)
  if (!restaurant) return null
  return <div className="flex-1 min-h-0 overflow-y-auto p-5"><ProfitabilityView restaurants={[restaurant]} allowOrganization={false} /></div>
}
