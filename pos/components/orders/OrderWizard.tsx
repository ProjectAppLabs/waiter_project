'use client'

import { getSettings } from '@/lib/services/core/sales'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { WizardSteps } from '@/components/kit/WizardSteps'
import { CustomerStep } from '@/components/orders/CustomerStep'
import { MenuStep } from '@/components/orders/MenuStep'
import { SummaryStep } from '@/components/orders/SummaryStep'
import { TableStep } from '@/components/orders/TableStep'
import { OfflinePayment } from '@/components/offline/OfflinePayment'
import { PaymentModal } from '@/components/payment/PaymentModal'
import { cartTotals, displayReference, stepsFor, type OptionGroup, type OrderType } from '@/lib/domain/orderWizard'
import { roleCan } from '@/lib/domain/permissions'
import { can, effectiveRole, type Role } from '@/lib/domain/roles'
import { useOrderLocations } from '@/lib/hooks/useOrderLocations'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useOrderStore } from '@/lib/stores/orderStore'
import { currentStep, useOrderWizardStore } from '@/lib/stores/orderWizardStore'
import { toast } from '@/lib/stores/toastStore'

const NO_GROUPS: OptionGroup[] = []
const OFF_PREMISE_TYPES: OrderType[] = ['takeAway', 'delivery']
const TABLE_TYPES: OrderType[] = ['dineIn']

// Wizard "Create New Order" del kit (carpeta 5): cabecera de pasos, contenido a pantalla completa y salida a /pedidos.
// Si la mesa llega del plano, su paso se salta: ya se eligió, y volver a pedirla es preguntar dos veces lo mismo.
// Se puede confiar en ella porque el plano ahora obliga a elegirla a propósito (nunca hereda la última tocada),
// y el resumen la enseña antes de crear el pedido.
export function OrderWizard({ presetTableId, returnTo = '/pedidos', withoutTable = false }: { presetTableId: number | null; returnTo?: '/salon' | '/pedidos'; withoutTable?: boolean }) {
  const t = useTranslations('orders.create')
  const tOffline = useTranslations('pos.offline')
  const locationText = useTranslations('orders.location')
  const router = useRouter()
  const session = useAuthStore((s) => s.session)
  const catalog = useCatalogStore((s) => s.catalog)
  const { openOrders, refreshOpenOrders } = useOrderStore()
  const w = useOrderWizardStore()
  const [paying, setPaying] = useState<number | null>(null)

  const [chosenType, setChosenType] = useState<OrderType | null>(withoutTable ? null : 'dineIn')
  const locationSources = useMemo(() => [{ tableId: w.info.type === 'dineIn' ? w.tableId : null }], [w.info.type, w.tableId])
  const locations = useOrderLocations(locationSources)
  const location = w.tableId === null ? undefined : locations.get(w.tableId)

  useEffect(() => {
    w.reset({ tableId: withoutTable ? null : presetTableId })
    if (withoutTable) w.setInfo({ type: 'takeAway' })
  }, [presetTableId, withoutTable]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (catalog) void w.loadExtras(catalog) }, [catalog]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (session) void refreshOpenOrders(session.id) }, [session, refreshOpenOrders])

  const skipTable = presetTableId !== null
  const step = currentStep(w)
  const visible = stepsFor(w.info.type).filter((s) => !(skipTable && s === 'table'))
  const totals = useMemo(() => cartTotals(w.lines, w.taxes), [w.lines, w.taxes])
  const tableNumber = catalog?.tables.find((x) => x.id === w.tableId)?.number ?? null

  function forward() {
    if (withoutTable && !chosenType) return
    w.next()
    if (skipTable && currentStep(useOrderWizardStore.getState()) === 'table') w.next()
  }
  function backward() {
    w.back()
    if (skipTable && currentStep(useOrderWizardStore.getState()) === 'table') w.back()
  }

  function leave(created: { trackingNumber: string; offline?: boolean } | null) {
    if (created?.offline) toast({ title: tOffline('savedTitle'), body: tOffline('savedBody') })
    else if (created) toast({ title: t('successTitle', { ref: displayReference(w.info.type, created.trackingNumber) }), body: t('successBody') })
    router.push(returnTo)
  }

  async function confirm() {
    if (!session || !catalog || (withoutTable && (!chosenType || w.info.type === 'dineIn'))) return
    const auth = useAuthStore.getState()
    const role = effectiveRole(auth.user?.role, auth.employee?.role)
    if (!auth.employee || !roleCan(role, 'create_orders', catalog.settings.rolePermissions)) {
      useOrderWizardStore.setState({ error: 'Tu rol no tiene permiso para crear pedidos.' })
      return
    }
    const mayCharge = roleCan(role, 'charge_orders', catalog.settings.rolePermissions)
    const created = await w.createOrder(session.id, { babyChair: t('babyChairNote'), delivery: (address, phone) => t('deliveryNote', { address, phone }) })
    if (!created) return
    if (w.info.type === 'dineIn') {
      try {
        const policy = { require_payment_roles: (await getSettings(catalog!.settings.configId)).restaurant.kitchen_prepay_roles as Role[] }
        const auth = useAuthStore.getState()
        const role = effectiveRole(auth.user?.role, auth.employee?.role)
        if (policy.require_payment_roles.includes(role)) {
          if (!can.charge(role, catalog!.settings.waiterCanCharge, catalog!.settings.rolePermissions)) {
            useOrderWizardStore.setState({ error: 'Pedido guardado. Pide a caja que lo cobre para enviarlo a cocina.' })
            return
          }
          setPaying(created.id)
          return
        }
      } catch (e) {
        useOrderWizardStore.setState({ error: e instanceof Error ? e.message : 'No se pudo comprobar el permiso de cocina.' })
        return
      }
      if (!await w.fireKitchen(created.id)) return
      leave(created)
      return
    }
    if (!mayCharge) {
      toast({ title: 'Pedido guardado', body: 'Caja debe cobrarlo para enviarlo a cocina.' })
      router.push(returnTo)
      return
    }
    setPaying(created.id)
    forward()
  }

  if (!catalog) return null

  return (
    <div className="flex-1 min-h-0 p-3">
      <div className="h-full ambient-panel border border-border rounded-xl flex flex-col overflow-hidden">
        <header className="h-[72px] px-6 flex items-center gap-4 bg-surface border-b border-border shrink-0">
          {w.stepIndex > 0 && (
            <button type="button" aria-label={t('back')} onClick={backward} className="w-10 h-10 rounded-md bg-ink text-surface grid place-items-center shrink-0"><Icon name="chevronLeft" size={20} /></button>
          )}
          <div className="min-w-0 overflow-x-auto"><WizardSteps steps={visible.map((s) => t(`steps.${s}`))} current={Math.max(0, visible.indexOf(step))} /></div>
          <button type="button" aria-label={t('close')} onClick={() => router.push(returnTo)} className="ml-auto w-10 h-10 rounded-md bg-ink text-surface grid place-items-center shrink-0"><Icon name="close" size={20} /></button>
        </header>

        {w.info.type === 'dineIn' && tableNumber !== null && (
          <div className="px-5 py-2 border-b border-border/60 shrink-0">
            <div aria-label="Ubicación del pedido" className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-primary/20 bg-primary-soft/70 px-3 py-1.5 text-xs text-soft">
              <span className="inline-flex items-center gap-1.5 font-semibold text-primary"><Icon name="tables" size={14} />{t('tableLabel', { n: tableNumber })}</span>
              <span>· {locationText('floor')}: {location?.floor ?? locationText('unavailable')}</span>
              <span>· {locationText('zone')}: {location?.zone ?? locationText(location?.zoneStatus === 'ready' ? 'unavailable' : location?.zoneStatus ?? 'loading')}</span>
            </div>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-hidden">
          {step === 'customer' && <CustomerStep info={w.info} allowedTypes={withoutTable ? OFF_PREMISE_TYPES : presetTableId !== null ? TABLE_TYPES : undefined} selectedType={withoutTable ? chosenType : w.info.type} onChange={(patch) => { if (patch.type) setChosenType(patch.type); w.setInfo(patch) }} onContinue={forward} />}
          {step === 'table' && (
            <TableStep floors={catalog.floors} tables={catalog.tables} orders={openOrders} selected={w.tableId}
              onSelect={w.setTable} onContinue={forward} />
          )}
          {step === 'menu' && (
            <MenuStep products={catalog.products} categories={catalog.categories} taxes={w.taxes}
              optionsOf={(id) => w.extras?.options.get(id) ?? NO_GROUPS} descriptionOf={(id) => w.extras?.descriptions.get(id) ?? ''}
              lines={w.lines} onAdd={w.add} onUpdate={w.update} onQty={w.setQty} onReset={w.clear} onContinue={forward} />
          )}
          {step === 'summary' && (
            <SummaryStep info={w.info} tableNumber={tableNumber} lines={w.lines} totals={totals} busy={w.busy} error={w.error} onConfirm={() => void confirm()} />
          )}
          {step === 'payment' && !paying && <p className="p-8 text-[15px] text-soft">{t('creating')}</p>}
        </div>
      </div>

      {paying !== null && paying < 0 && w.created && (
        <OfflinePayment order={{ uuid: w.requestUuid }} total={w.created.total} label={w.info.name.trim()} onClose={() => { setPaying(null); if (step === 'payment') w.back() }}
          onPaid={() => { const created = w.created; void w.fireKitchen(paying).then((sent) => { if (sent) leave(created) }) }} />
      )}
      {paying !== null && paying >= 0 && (
        <PaymentModal orderId={paying} onClose={() => { setPaying(null); if (step === 'payment') w.back() }}
          onPaid={() => { const created = w.created; void w.fireKitchen(paying).then((sent) => { if (sent) leave(created) }) }} />
      )}
    </div>
  )
}
