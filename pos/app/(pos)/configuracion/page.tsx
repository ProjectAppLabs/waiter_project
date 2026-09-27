'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useEffect, useState } from 'react'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { CompanyForm, DisplayForm, FloorsForm, PaymentMethodsList, TaxesList, UsersForm } from '@/components/settings/KitSettingsForms'
import { RolePermissionsForm } from '@/components/settings/RolePermissionsForm'
import { TaxRegimeForm } from '@/components/settings/TaxRegimeForm'
import { KitchenPaymentPolicyForm } from '@/components/settings/KitchenPaymentPolicyForm'
import { ReservationHoursForm } from '@/components/settings/ReservationHoursForm'
import { PaymentGatewayForm } from '@/components/settings/PaymentGatewayForm'
import { BenefitsForm } from '@/components/settings/BenefitsForm'
import { MenuBannersForm } from '@/components/settings/MenuBannersForm'
import { McpKeysForm } from '@/components/settings/McpKeysForm'
import { MenuTemplateForm } from '@/components/settings/MenuTemplateForm'
import { ThresholdsForm } from '@/components/settings/SettingsForms'
import { PageHeader } from '@/components/ui/PageHeader'
import { getCompany, listFloors, listPaymentMethods, listTaxes, listUsers, saveSettings, type CompanyInfo, type FloorInfo, type PaymentMethodInfo, type TaxInfo, type UserInfo } from '@/lib/services/settings'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { cn } from '@/lib/utils'

const SECTIONS: [Section, KitIcon][] = [['restaurant', 'store'], ['menuTemplate', 'layout'], ['benefits', 'percentage'], ['floors', 'grid'], ['reservationHours', 'reservations'], ['payments', 'card'], ['taxes', 'percentage'], ['users', 'users'], ['permissions', 'lock'], ['alerts', 'alert'], ['roi', 'chartLine'], ['display', 'tablet'], ['integrations', 'sparkles']]
type Section = 'integrations' | 'permissions' | 'benefits' | 'reservationHours' | 'restaurant' | 'brand' | 'menuTemplate' | 'floors' | 'payments' | 'taxes' | 'users' | 'alerts' | 'roi' | 'display'

// Configuración con la estructura del modal "Setting" del kit (Account Setting / Profile.png): pestañas verticales con
// icono a la izquierda y panel con cabecera a la derecha, para las secciones del restaurante.
function ConfiguracionInner() {
  const t = useTranslations('admin.settings')
  const params = useSearchParams()
  const session = useAuthStore((s) => s.session)
  const { catalog, load } = useCatalogStore()
  const initialSection: Section = params.get('seccion') === 'alertas' ? 'alerts' : 'restaurant'
  const [section, setSection] = useState<Section>(initialSection)
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [floors, setFloors] = useState<FloorInfo[]>([])
  const [methods, setMethods] = useState<PaymentMethodInfo[]>([])
  const [taxes, setTaxes] = useState<TaxInfo[]>([])
  const [users, setUsers] = useState<UserInfo[]>([])
  const reloadFloors = () => listFloors().then(setFloors)
  const reloadUsers = () => listUsers().then(setUsers)
  useEffect(() => { void getCompany().then(setCompany); void reloadFloors(); void listPaymentMethods().then(setMethods); void listTaxes().then(setTaxes); void reloadUsers() }, [])
  if (!catalog) return null
  const onSaveSettings = async (s: typeof catalog.settings) => { await saveSettings(s); await load(session?.id ?? null) }
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
              {section === 'restaurant' && company && <CompanyForm key={company.id} initial={company} />}
              {section === 'benefits' && <BenefitsForm configId={catalog.settings.configId} />}
              {section === 'integrations' && <McpKeysForm />}
              {section === 'menuTemplate' && <><MenuTemplateForm /><MenuBannersForm configId={catalog.settings.configId}/></>}
              {section === 'floors' && <FloorsForm floors={floors} configId={catalog.settings.configId} onChanged={reloadFloors} />}
              {section === 'reservationHours' && <ReservationHoursForm configId={catalog.settings.configId} />}
              {section === 'payments' && <><PaymentMethodsList methods={methods} /><PaymentGatewayForm methods={methods} /></>}
              {section === 'taxes' && <div className="space-y-8"><TaxRegimeForm configId={catalog.settings.configId} /><TaxesList taxes={taxes} /></div>}
              {section === 'users' && <UsersForm users={users} onChanged={reloadUsers} />}
              {section === 'permissions' && <div className="space-y-8"><RolePermissionsForm configId={catalog.settings.configId} initial={catalog.settings.rolePermissions} /><KitchenPaymentPolicyForm configId={catalog.settings.configId} /></div>}
              {section === 'alerts' && <ThresholdsForm key="alerts" initial={catalog.settings} section="alerts" onSave={onSaveSettings} />}
              {section === 'roi' && <ThresholdsForm key="roi" initial={catalog.settings} section="roi" onSave={onSaveSettings} />}
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
