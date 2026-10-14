'use client'

import { useEffect, useState } from 'react'

import { TextInput } from '@/components/ui/Field'
import { formatCop } from '@/lib/domain/money'
import { Modal } from '@/components/kit/Modal'
import { Button } from '@/components/ui/Button'
import { consumption, listRecharges, requestRecharge, type Consumption, type Recharge, type RechargePackOffer } from '@/lib/services/core/business'

const money = (v: number) => `${v < 0 ? '− ' : ''}$ ${formatCop(Math.round(Math.abs(v)))}`
const thisMonth = () => new Date().toISOString().slice(0, 7)

// Plan W5: lo que el dueño lleva del mes, para que la cuenta no sea una sorpresa: locales activos por su precio por
// local, lo que se cobra por uso y el consumo medido de cada módulo por local.
export function ConsumptionView() {
  const [period, setPeriod] = useState(thisMonth)
  const [data, setData] = useState<Consumption | null>(null)
  const [error, setError] = useState('')
  // Plan X: recargas del dueño (cuentas pendientes hasta que ProjectApp registra el pago).
  const [recharges, setRecharges] = useState<Recharge[]>([])
  const [buying, setBuying] = useState(false), [notice, setNotice] = useState('')
  useEffect(() => { listRecharges().then(setRecharges).catch(() => setRecharges([])) }, [])
  async function buy(pack: RechargePackOffer) {
    setError(''); setNotice('')
    try {
      await requestRecharge(pack.key)
      setBuying(false)
      setNotice(`Pediste la recarga «${pack.name}» por ${money(pack.price)}. El saldo se suma cuando ProjectApp registre el pago.`)
      setRecharges(await listRecharges())
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo pedir la recarga.') }
  }
  useEffect(() => {
    let alive = true
    consumption(period).then((d) => { if (alive) { setData(d); setError('') } }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'No se pudo leer el consumo.') })
    return () => { alive = false }
  }, [period])
  const current = data?.period === period ? data : null
  return (
    <section className="flex flex-col gap-5 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-[26px] font-bold">Consumo</h1>
          <p className="mt-1 text-soft">Lo que llevas este mes: la mensualidad por cada local activo y lo que se cobra por uso. La mensualidad se cobra por adelantado; el uso de este mes llega en la cuenta del mes siguiente.</p></div>
        <div className="w-48"><TextInput label="Mes" type="month" value={period} onChange={(e) => setPeriod(e.target.value || thisMonth())} /></div>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {notice && <p role="status" className="text-success-ink">{notice}</p>}
      {!current ? !error && <p role="status" className="text-soft">Leyendo el consumo…</p> : (<>
        <section aria-label="Cuenta estimada" className="rounded-lg border border-border p-5 flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold">Cuenta estimada</h2>
          <table aria-label="Cuenta estimada" className="data-table text-[15px]">
            <thead><tr className="text-left text-soft border-b border-border"><th className="px-3 py-2">Concepto</th><th className="px-3 py-2 text-right">Cantidad</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
            <tbody>{current.lines.map((l, i) => (
              <tr key={i} className="border-b border-border last:border-0"><td className="px-3 py-2">{l.concept}</td><td className="px-3 py-2 text-right tabular">{l.quantity.toLocaleString('es-CO')}</td>
                <td className="px-3 py-2 text-right tabular">{money(l.unit_price)}</td><td className="px-3 py-2 text-right tabular">{money(l.total)}</td></tr>))}</tbody>
          </table>
          <p className="flex justify-between text-[17px] font-semibold"><span>Total estimado</span><span className="tabular">{money(current.estimated_total)}</span></p>
          <p className="text-[13px] text-soft">{current.locals_active} {current.locals_active === 1 ? 'local activo' : 'locales activos'} a {money(current.price_per_local)} cada uno.</p>
          {(current.account_credit ?? 0) > 0 && <p className="text-[14px] text-success-ink">Tienes {money(current.account_credit ?? 0)} de saldo a favor: se descuenta en tu próxima cuenta.</p>}
        </section>
        {(current.quotas?.length ?? 0) > 0 && (
          <section aria-label="Incluido y recargas" className="rounded-lg border border-border p-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[18px] font-semibold">Incluido y recargas</h2>
              {(current.recharge_packs?.length ?? 0) > 0 && <Button variant="primary" onClick={() => setBuying(true)}>Recargar</Button>}
            </div>
            <table aria-label="Incluido y recargas" className="data-table text-[15px]">
              <thead><tr className="text-left text-soft border-b border-border"><th className="px-3 py-2">Qué</th><th className="px-3 py-2 text-right">Incluido este mes</th><th className="px-3 py-2 text-right">Usado</th><th className="px-3 py-2 text-right">Saldo de recargas</th><th className="px-3 py-2 text-right">Excedente</th></tr></thead>
              <tbody>{current.quotas!.map((q) => (
                <tr key={`${q.module}.${q.unit}`} className="border-b border-border last:border-0"><td className="px-3 py-2">{q.module_name} · {q.unit_name}</td>
                  <td className="px-3 py-2 text-right tabular">{q.included.toLocaleString('es-CO')}</td><td className="px-3 py-2 text-right tabular">{q.used.toLocaleString('es-CO')}</td>
                  <td className="px-3 py-2 text-right tabular">{q.credits.toLocaleString('es-CO')}</td><td className="px-3 py-2 text-right tabular">{q.overage.toLocaleString('es-CO')}</td></tr>))}</tbody>
            </table>
            <p className="text-[13px] text-soft">Primero se usa lo incluido del mes (no se acumula), luego tus recargas (no vencen). {current.quotas!.some((q) => q.on_exhausted === 'bloquear') ? 'Si se acaban, el asistente deja de tomar pedidos hasta que recargues.' : 'Si se acaban, lo que pase se cobra por unidad en la cuenta siguiente.'}</p>
            {recharges.length > 0 && <ul aria-label="Tus recargas" className="text-[14px] flex flex-col gap-1">{recharges.map((r) => (
              <li key={r.id} className="flex justify-between gap-3"><span>{r.name} · {money(r.price)}</span><span className="text-soft">{r.state === 'paid' ? 'Pagada · saldo sumado' : r.state === 'void' ? 'Anulada' : 'Pendiente de pago'}</span></li>))}</ul>}
          </section>
        )}
        {buying && (
          <Modal open onClose={() => setBuying(false)} title="Recargar" size="center">
            <div className="p-6 flex flex-col gap-3">
              <p className="text-[14px] text-soft">Se crea una cuenta de recarga. El saldo se suma cuando ProjectApp registre su pago.</p>
              {current.recharge_packs!.map((pack) => (
                <button key={pack.key} type="button" onClick={() => void buy(pack)} className="rounded-md border border-border p-3 flex justify-between items-center text-left hover:bg-muted">
                  <span><span className="block font-semibold">{pack.name}</span><span className="text-[13px] text-soft">{pack.quantity.toLocaleString('es-CO')} unidades · {money(Math.round(pack.price / pack.quantity))} cada una</span></span>
                  <span className="font-semibold tabular">{money(pack.price)}</span>
                </button>
              ))}
            </div>
          </Modal>
        )}
        <section aria-label="Uso del mes" className="rounded-lg border border-border p-5 flex flex-col gap-3">
          <h2 className="text-[18px] font-semibold">Uso del mes</h2>
          {current.usage.length === 0 ? <p className="text-soft">Sin consumo medido este mes.</p> : (
            <table aria-label="Uso del mes" className="data-table text-[15px]">
              <thead><tr className="text-left text-soft border-b border-border"><th className="px-3 py-2">Módulo</th><th className="px-3 py-2">Unidad</th><th className="px-3 py-2">Local</th><th className="px-3 py-2 text-right">Cantidad</th></tr></thead>
              <tbody>{current.usage.map((u, i) => (
                <tr key={i} className="border-b border-border last:border-0"><td className="px-3 py-2">{u.module_name}</td><td className="px-3 py-2">{u.unit_name}</td>
                  <td className="px-3 py-2">{u.restaurant_name ?? 'Organización'}</td><td className="px-3 py-2 text-right tabular">{u.quantity.toLocaleString('es-CO')}</td></tr>))}</tbody>
            </table>
          )}
        </section>
      </>)}
    </section>
  )
}
