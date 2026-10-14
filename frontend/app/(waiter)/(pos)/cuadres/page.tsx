'use client'
import { CashClosingsView } from '@/components/business/CashClosingsView'
import { useAuthStore } from '@/lib/stores/authStore'

// Plan Q3: el encargado ve los cierres de caja de su restaurante; la tolerancia la fija el dueño.
export default function CashClosingsPage() {
  const restaurant = useAuthStore((s) => s.restaurant)
  if (!restaurant) return null
  return <div className="flex-1 min-h-0 overflow-y-auto p-5"><CashClosingsView restaurants={[restaurant]} canSetTolerance={false} /></div>
}
