'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { GenericPay } from '@/components/templates/generic/GenericPay'
import { PAY_LAYOUTS } from '@/components/templates/registry'
import { pathFor } from '@/lib/domain/route'
import { DEFAULT_TEMPLATE, familyOf } from '@/lib/domain/template'
import { payableTotal, useDinerStore } from '@/lib/stores/dinerStore'
import type { Bill, Entry, PayMethod } from '@/lib/types'

export const PAY_METHODS: PayMethod[] = ['tarjeta', 'pse', 'nequi', 'efectivo']

// Pago demo: proyecta lo confirmado más el carrito; confirmar devuelve la cuenta fresca y pagar el importe autorizado.
// El contenedor enruta y delega el dibujo al pago de la familia de la plantilla.
export function Pay({ entry, rest, venue, token }: { entry: Entry; rest: string; venue: string; token: string | null; id: string | null }) {
  const router = useRouter()
  const t = useTranslations('diner.common')
  const [quoted, setQuoted] = useState(false)
  const store = useDinerStore()
  const { cart, order, bill, account, payState, payResult, simulatePay, resetPay, refreshBill } = store
  const template = store.template ?? DEFAULT_TEMPLATE
  // Al entrar se cotiza en el servidor sin avisar al salón; no se permite pagar con un desglose anterior.
  useEffect(() => {
    let active = true
    void refreshBill().finally(() => { if (active) setQuoted(true) })
    return () => { active = false; resetPay() }
  }, [refreshBill, resetPay])
  const Layout = PAY_LAYOUTS[familyOf(template.layouts?.pago, template.familia)] ?? GenericPay
  const go = (screen: Parameters<typeof pathFor>[3]) => router.push(pathFor(rest, venue, token, screen))
  const total = payableTotal({ bill, order, cart })
  const shown: Bill = { ...(bill ?? { ok: false, total: 0, mio: 0, porComensal: [], partes: 1, porParte: 0 }), total: payResult?.monto ?? bill?.total ?? total }
  if (!quoted || !bill) return <p className="p-[18px] text-t-tinta-suave">{store.error ?? t('loading')}</p>
  return (
    <Layout
      bill={shown} template={template} methods={PAY_METHODS} onPay={(m, reparto) => void simulatePay(m, reparto)} state={payState} demo goBack={() => go('pedido')}
      result={payResult} order={order} merchant={entry.contexto.restaurante.nombre} table={entry.contexto.mesa?.numero ?? null} account={account}
      onRetry={resetPay} onPayAtTable={() => { void store.confirm().then((id) => { if (id) go('la-cuenta') }) }} onSignup={() => go('cuenta/registro')} goMenu={() => go('carta')}
    />
  )
}
