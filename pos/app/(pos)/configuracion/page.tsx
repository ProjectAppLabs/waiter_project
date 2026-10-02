'use client'

import { useTranslations } from 'next-intl'
import { Suspense, useEffect, useState } from 'react'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { DisplayForm, PaymentMethodsList, UsersForm } from '@/components/settings/KitSettingsForms'
import { KitchenPaymentPolicyForm } from '@/components/settings/KitchenPaymentPolicyForm'
import { RestaurantInfoForm } from '@/components/settings/RestaurantInfoForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { listPosEmployees, type PosEmployee } from '@/lib/services/employees'
import { getRestaurantInfo, type RestaurantInfo } from '@/lib/services/restaurantInfo'
import { listPaymentMethods, type PaymentMethodInfo } from '@/lib/services/settings'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { cn } from '@/lib/utils'

// Plan O: aquí queda solo lo del restaurante. Diseño del menú, promociones, integraciones, empresa e impuestos, el
// equipo de la organización y los permisos por rol son de la organización y viven en la consola del dueño.
// Plan Q: los supuestos del retorno de inversión, la pasarela de pago y «cobrar antes de cocina» los decide el dueño en su
// consola; aquí el encargado ve los medios de pago y la política de su restaurante.
const SECTIONS: [Section, KitIcon][] = [['restaurant', 'store'], ['payments', 'card'], ['users', 'users'], ['display', 'tablet']]
type Section = 'restaurant' | 'payments' | 'users' | 'display'

// Configuración con la estructura del modal "Setting" del kit (Account Setting / Profile.png): pestañas verticales con
// icono a la izquierda y panel con cabecera a la derecha, para las secciones del restaurante.
function ConfiguracionInner() {
  const t = useTranslations('admin.settings')
  const { catalog } = useCatalogStore()
  const [section, setSection] = useState<Section>('restaurant')
  const configId = catalog?.settings.configId ?? null
  const [info, setInfo] = useState<RestaurantInfo | null>(null)
  const [methods, setMethods] = useState<PaymentMethodInfo[]>([])
  const [employees, setEmployees] = useState<PosEmployee[]>([])
  useEffect(() => {
    if (!configId) return
    let alive = true
    getRestaurantInfo(configId).then((r) => { if (alive) setInfo(r) }).catch(() => undefined)
    listPaymentMethods().then((m) => { if (alive) setMethods(m) }).catch(() => undefined)
    listPosEmployees(configId).then((e) => { if (alive) setEmployees(e) }).catch(() => { if (alive) setEmployees([]) })
    return () => { alive = false }
  }, [configId])
  if (!catalog) return null
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="flex-1 min-h-0 px-5 pb-5">
        <div className="h-full ambient-panel border border-border rounded-lg flex overflow-hidden">
          <nav aria-label={t('title')} className="w-[280px] shrink-0 border-r border-border p-4 flex flex-col gap-1 overflow-y-auto">
            {SECTIONS.map(([s, icon]) => (
              <button key={s} type="button" aria-current={section === s ? 'page' : undefined} onClick={() => setSection(s)}
                className={cn('flex items-center gap-3 h-12 px-3 rounded-md text-[15px] font-semibold text-left', section === s ? 'bg-canvas border border-border text-ink' : 'text-soft hover:bg-muted')}>
                <Icon name={icon} size={20} /><span>{t(`sections.${s}`)}</span>
              </button>
            ))}
          </nav>
          <section aria-label={t(`sections.${section}`)} className="flex-1 min-w-0 m-4 rounded-lg border border-border flex flex-col overflow-hidden">
            <header className="h-14 px-5 flex items-center border-b border-border shrink-0"><h2 className="text-[16px] font-semibold text-ink">{t(`sections.${section}`)}</h2></header>
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              {section === 'restaurant' && info && <RestaurantInfoForm key={info.id} initial={info} />}
              {section === 'payments' && <div className="flex max-w-4xl flex-col gap-4"><PaymentMethodsList methods={methods} />
                <p className="text-sm text-soft">La pasarela de pago y sus credenciales las configura el dueño en su consola (Pagos).</p></div>}
              {/* El equipo de este restaurante y quién cobra antes de cocina; asignar personas y permisos es de la consola del dueño. */}
              {section === 'users' && <div className="flex max-w-4xl flex-col gap-10">
                <UsersForm employees={employees} />
                <KitchenPaymentPolicyForm configId={catalog.settings.configId} readOnly />
              </div>}
              {section === 'display' && <DisplayForm />}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

export default function ConfiguracionPage() {
  return <Suspense fallback={null}><ConfiguracionInner /></Suspense>
}
