'use client'
import { RoiView } from '@/components/business/RoiView'
import { RestaurantScope } from '@/components/organization/RestaurantScope'
import { ThresholdsForm } from '@/components/settings/SettingsForms'
import { saveSettings } from '@/lib/services/settings'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'

// Plan Q: el retorno de inversión de cada restaurante y sus supuestos (antes en Configuración → ROI del POS).
function RoiWithAssumptions() {
  const catalog = useCatalogStore((s) => s.catalog)
  const load = useCatalogStore((s) => s.load)
  if (!catalog) return null
  const onSave = async (s: typeof catalog.settings) => { await saveSettings(s); await load(useAuthStore.getState().session?.id ?? null) }
  return <>
    <RoiView />
    <section className="px-5 mt-6 flex flex-col gap-3"><h2 className="text-[18px] font-semibold">Supuestos del cálculo</h2>
      <ThresholdsForm key={catalog.settings.configId} initial={catalog.settings} section="roi" onSave={onSave} /></section>
  </>
}
export default function OrganizationRoi() { return <RestaurantScope label="Restaurante"><RoiWithAssumptions /></RestaurantScope> }
