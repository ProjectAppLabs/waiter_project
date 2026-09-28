'use client'

import { useTranslations } from 'next-intl'
import { Suspense, useEffect, useState } from 'react'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { CompanyForm, DisplayForm, PaymentMethodsList, TaxesList, UsersForm } from '@/components/settings/KitSettingsForms'
import { RolePermissionsForm } from '@/components/settings/RolePermissionsForm'
import { TaxRegimeForm } from '@/components/settings/TaxRegimeForm'
import { KitchenPaymentPolicyForm } from '@/components/settings/KitchenPaymentPolicyForm'
import { PaymentGatewayForm } from '@/components/settings/PaymentGatewayForm'
import { BenefitsForm } from '@/components/settings/BenefitsForm'
import { McpInvite } from '@/components/settings/McpInvite'
import { MenuDecorationsForm } from '@/components/settings/MenuDecorationsForm'
import { McpKeysForm } from '@/components/settings/McpKeysForm'
import { MenuTemplateForm } from '@/components/settings/MenuTemplateForm'
import { ThresholdsForm } from '@/components/settings/SettingsForms'
import { PageHeader } from '@/components/ui/PageHeader'
import { getCompany, listPaymentMethods, listTaxes, listUsers, saveSettings, type CompanyInfo, type PaymentMethodInfo, type TaxInfo, type UserInfo } from '@/lib/services/settings'
import { useAuthStore } from '@/lib/stores/authStore'
import { listPosEmployees, type PosEmployee } from '@/lib/services/employees'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { cn } from '@/lib/utils'

const SECTIONS: [Section, KitIcon][] = [['restaurant', 'store'], ['menuTemplate', 'layout'], ['benefits', 'percentage'], ['payments', 'card'], ['taxes', 'percentage'], ['users', 'users'], ['roi', 'chartLine'], ['display', 'tablet'], ['integrations', 'sparkles']]
type Section = 'integrations' | 'benefits' | 'restaurant' | 'brand' | 'menuTemplate' | 'payments' | 'taxes' | 'users' | 'roi' | 'display'

// Cuántas personas tiene cada rol: la tabla de permisos lo muestra en cada columna para ligarla con la lista del equipo.
// Se cuentan los empleados con PIN: su rol es el que aplican estos permisos al iniciar turno.
// Sin rol propio, el empleado usa el de su cuenta: no se cuenta en ninguna columna.
const roleCounts = (employees: PosEmployee[]) => employees.reduce<Partial<Record<string, number>>>((acc, e) => e.role ? { ...acc, [e.role]: (acc[e.role] ?? 0) + 1 } : acc, {})

// Configuración con la estructura del modal "Setting" del kit (Account Setting / Profile.png): pestañas verticales con
// icono a la izquierda y panel con cabecera a la derecha, para las secciones del restaurante.
function ConfiguracionInner() {
  const t = useTranslations('admin.settings')
  const session = useAuthStore((s) => s.session)
  const { catalog, load } = useCatalogStore()
  const [section, setSection] = useState<Section>('restaurant')
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [methods, setMethods] = useState<PaymentMethodInfo[]>([])
  const [taxes, setTaxes] = useState<TaxInfo[]>([])
  const [users, setUsers] = useState<UserInfo[]>([])
  const reloadUsers = () => listUsers().then(setUsers)
  const [employees, setEmployees] = useState<PosEmployee[]>([])
  useEffect(() => { void getCompany().then(setCompany); void listPaymentMethods().then(setMethods); void listTaxes().then(setTaxes); void reloadUsers(); void listPosEmployees(session?.configId ?? null).then(setEmployees).catch(() => setEmployees([])) }, []) // eslint-disable-line react-hooks/exhaustive-deps
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
              {section === 'menuTemplate' && <><McpInvite onConnect={() => setSection('integrations')} /><MenuTemplateForm /><MenuDecorationsForm /></>}
              {section === 'payments' && <><PaymentMethodsList methods={methods} /><PaymentGatewayForm methods={methods} /></>}
              {section === 'taxes' && <div className="space-y-8"><TaxRegimeForm configId={catalog.settings.configId} /><TaxesList taxes={taxes} /></div>}
              {/* Usuarios y permisos en una sola vista: quién está en el equipo, qué puede hacer cada rol y quién cobra antes de cocina. */}
              {section === 'users' && <div className="flex max-w-4xl flex-col gap-10">
                <UsersForm users={users} employees={employees} onChanged={reloadUsers} />
                <RolePermissionsForm configId={catalog.settings.configId} initial={catalog.settings.rolePermissions} counts={roleCounts(employees)} />
                <KitchenPaymentPolicyForm configId={catalog.settings.configId} />
              </div>}
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
