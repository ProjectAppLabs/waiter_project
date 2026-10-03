'use client'

import { printReceipt } from '@/lib/print/settings'
import { serverDate } from '@/lib/domain/time'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Toggle } from '@/components/kit/Toggle'
import { PrintableReceipt } from '@/components/pay/PrintableReceipt'
import { CardPanel, CashPanel, QrPanel } from '@/components/payment/PaymentPanels'
import { PaymentSuccess, type PaidSummary } from '@/components/payment/PaymentSuccess'
import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'
import { displayReference, type OrderType } from '@/lib/domain/orderWizard'
import { change as changeOf, remaining, splitEqual, suggestedTip, type Payment } from '@/lib/domain/payment'
import { amountOf, CARD_TIMEOUT_MS, methodFor, PAY_KINDS, pointsDiscount, pointsToRedeem, QR_CHECK_MS, type PayKind } from '@/lib/domain/paymentKit'
import { manualTerminal, type TerminalResult } from '@/lib/payments/terminal'
import { loadLoyaltyProgram, lookupMember, readPayableOrder, redeemPoints, type LoyaltyProgram, type Member, type PayableOrder } from '@/lib/services/paymentKit'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useOrderStore } from '@/lib/stores/orderStore'
import { cn } from '@/lib/utils'

const KIND_ICON = { cash: 'money', card: 'card', qr: 'qr' } as const
const TYPE_BY_PRESET: Record<number, OrderType> = { 1: 'dineIn', 2: 'takeAway', 3: 'delivery' }
const whenOf = (raw: string) => {
  const d = serverDate(raw)
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
type TipMode = 'none' | 'suggested' | 'custom'

export function PaymentModal({ orderId, onClose, onPaid }: { orderId: number; onClose: () => void; onPaid: (s: PaidSummary) => void }) {
  const t = useTranslations('payment')
  const catalog = useCatalogStore((s) => s.catalog)
  const { settle, busy, error, receipt } = useOrderStore()

  const [order, setOrder] = useState<PayableOrder | null>(null)
  const [program, setProgram] = useState<LoyaltyProgram | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [benefitError,setBenefitError]=useState('')
  const [code, setCode] = useState('')
  const [member, setMember] = useState<Member | null>(null)
  const [memberMissing, setMemberMissing] = useState(false)
  const [usePoints, setUsePoints] = useState(false)
  const [kind, setKind] = useState<PayKind>('cash')
  const [tipMode, setTipMode] = useState<TipMode>('none')
  const [customTip, setCustomTip] = useState(0)
  const [parts, setParts] = useState(1)
  const [options, setOptions] = useState(false)
  const [payments, setPayments] = useState<Payment[]>([])
  const [cashText, setCashText] = useState('')
  // Importe imputado a este pago (null = lo que toque por el reparto) y método elegido cuando hay varios
  // del mismo tipo. Ambos se sueltan al registrar un pago: el siguiente vuelve a partir de lo que falte.
  const [partial, setPartial] = useState<number | null>(null)
  const [methodId, setMethodId] = useState<number | null>(null)
  const [cardStage, setCardStage] = useState<'idle' | 'terminal'>('idle')
  const [checking, setChecking] = useState(false)
  const [done, setDone] = useState<PaidSummary | null>(null)
  const [deadline] = useState(() => Date.now() + CARD_TIMEOUT_MS)
  const askRef = useRef<((r: TerminalResult) => void) | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [o, p] = await Promise.all([readPayableOrder(orderId), loadLoyaltyProgram().catch(() => null)])
        if (alive) { setOrder(o); setProgram(p) }
      } catch { if (alive) setLoadFailed(true) }
    })()
    return () => { alive = false }
  }, [orderId])

  const methods = useMemo(() => catalog?.paymentMethods ?? [], [catalog])
  // Qué métodos son de esta pestaña. Se pregunta con `methodFor` uno a uno para no repetir aquí su regla
  // (efectivo por tipo; QR y datáfono son ambos 'bank' y se distinguen por el nombre).
  const sameKind = useMemo(() => methods.filter((m) => methodFor(kind, [m])), [kind, methods])
  const method = sameKind.find((m) => m.id === methodId) ?? methodFor(kind, methods)
  const base = order?.total ?? 0
  const tip = tipMode === 'none' ? 0 : tipMode === 'suggested' ? suggestedTip(base) : customTip
  const rate = useMemo(() => ({ copPerPoint: program?.copPerPoint ?? 0 }), [program])
  const candidateDiscount = usePoints && member ? pointsDiscount(member.points, rate, base) : 0
  const discount = pointsToRedeem(candidateDiscount, rate) >= (program?.minimumPoints??0) ? candidateDiscount : 0
  const grand = Math.max(0, base + tip - discount)
  const left = remaining(grand, payments)
  const share = Math.min(left, splitEqual(grand, parts)[Math.min(payments.length, parts - 1)] ?? left)
  // El importe escrito manda sobre el reparto, pero nunca por encima de lo que falta por cobrar.
  const due = partial === null ? share : Math.min(partial, left)

  const finish = useCallback(async (all: Payment[]) => {
    if (!order || !catalog) return
    if (discount > 0 && member && program) {
      try { await redeemPoints(order.id, member, program, pointsToRedeem(discount, rate), discount, order.total) }
      catch(e) {setBenefitError(e instanceof Error?e.message:'No se pudo canjear');setPayments([]);return}
    }
    const ok = await settle({ tip, payments: all }, {
      existing: { orderId: order.id, tableId: order.tableId ?? 0 }, tipProductId: catalog.settings.tipProductId,
      // El documento lleva la mesa que ve el cliente ("A8", "Terraza 8"), no el id interno.
      tableNumber: order.tableId ?? 0, tableLabel: order.tableNumber || undefined, company: catalog.company.name,
      lines: order.lines.map((l) => ({ uuid: l.uuid, name: l.name, qty: l.qty, unitPrice: l.unitPrice, total: l.total })),
      methodName: (id) => methods.find((m) => m.id === id)?.name ?? '',
    })
    if (ok) {
      const first = all[0]
      setDone({ total: grand, methodName: first ? methods.find((m) => m.id === first.methodId)?.name ?? '' : t('memberPoints'), received: all.reduce((a, p) => a + p.received, 0), change: changeOf(all) })
    }
  }, [order, catalog, discount, member, program, rate, settle, tip, methods, grand, t])

  const register = useCallback((p: Payment) => {
    const all = [...payments, p]
    setPayments(all)
    setCashText('')
    setPartial(null)
    setCardStage('idle')
    if (remaining(grand, all) === 0) void finish(all)
  }, [payments, grand, finish])

  // Datáfono: el adaptador manual espera a que el cajero apruebe o rechace en pantalla (lib/payments/terminal.ts).
  async function payCard() {
    if (!method) return
    const terminal = manualTerminal(() => new Promise<TerminalResult>((resolve) => { askRef.current = resolve; setCardStage('terminal') }))
    const result = await terminal.charge(due)
    askRef.current = null
    if (result.approved) register({ methodId: method.id, type: method.type, amount: due, received: due, reference: result.reference })
    else setCardStage('idle')
  }

  function payQr() {
    if (!method) return
    setChecking(true)
    setTimeout(() => { setChecking(false); register({ methodId: method.id, type: method.type, amount: due, received: due, reference: '' }) }, QR_CHECK_MS)
  }

  async function search() {
    if (!program || code.trim() === '') return
    const found = await lookupMember(code, program.id)
    setMember(found)
    setMemberMissing(found === null)
    setUsePoints(found !== null)
  }

  // El documento va montado junto al aviso: la hoja de impresión solo deja visible `.receipt`, así que sin
  // esto "Imprimir" sacaba una hoja en blanco desde Pedidos.
  if (done) return (
    <>
      <PaymentSuccess summary={done} onPrint={printReceipt} onDone={() => onPaid(done)} />
      {receipt && <PrintableReceipt data={receipt} />}
    </>
  )

  const badge = order?.tableId ? order.tableNumber.split(' ').pop() ?? '' : null
  const presetType = order?.presetId ? TYPE_BY_PRESET[order.presetId] : undefined
  const presetLabel = presetType ? t(`types.${order!.presetId}` as 'types.1') : order?.presetName ?? ''
  const reference = order ? (presetType ? displayReference(presetType, order.trackingNumber) : order.trackingNumber) : ''

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay/60 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t('title')} onClick={(e) => e.stopPropagation()}
        className="w-[798px] max-w-full h-[700px] max-h-[94vh] bg-surface rounded-xl shadow-xl flex flex-col overflow-hidden">
        <header className="h-[68px] px-6 flex items-center justify-between border-b border-border shrink-0">
          <h2 className="text-[20px] font-semibold text-ink">{t('title')}</h2>
          <button type="button" onClick={onClose} aria-label={t('close')} className="w-10 h-10 rounded-md bg-ink text-surface grid place-items-center"><Icon name="close" size={20} /></button>
        </header>

        {!order ? (
          <p className="flex-1 grid place-items-center text-[15px] text-soft">{loadFailed ? t('notFound') : t('loading')}</p>
        ) : (
          <div className="flex-1 min-h-0 flex">
            {/* Izquierda: cliente, socio y detalle del pedido */}
            <div className="w-[396px] shrink-0 border-r border-border flex flex-col min-h-0">
              <div className="px-5 pt-4 pb-3 flex flex-col gap-3 border-b border-dashed border-border">
                <span className="text-[14px] text-soft">{t('customerInformation')}</span>
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-md bg-primary text-primary-ink grid place-items-center text-[14px] font-semibold shrink-0">{badge ?? <Icon name="bag" size={18} />}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-ink truncate">{order.customerName || t('noName')}</p>
                    <p className="text-[13px] text-soft">{t('orderNo')} <span className="font-semibold text-ink">{reference}</span> / {presetLabel}</p>
                  </div>
                  <span className="text-[13px] text-soft shrink-0 text-right max-w-[110px]">{whenOf(order.date)}</span>
                </div>
                <div className="flex gap-2">
                  <input value={code} onChange={(e) => setCode(e.target.value)} disabled={!program} placeholder={program ? t('searchPlaceholder') : t('noProgram')}
                    aria-label={t('memberCode')} className="flex-1 min-w-0 h-12 px-3.5 rounded-md border border-border bg-surface text-[15px] text-ink placeholder:text-dim focus:outline-2 focus:outline-primary disabled:opacity-60" />
                  <Button variant="primary" className="rounded-md" disabled={!program} onClick={() => void search()}>{t('search')}</Button>
                </div>
                {benefitError&&<p role="alert" className="text-danger-ink">{benefitError}</p>}
                {memberMissing && <p role="alert" className="text-[13px] text-danger-ink">{t('memberNotFound')}</p>}
                {member && (
                  <div className="p-3.5 rounded-md bg-canvas border border-border flex flex-col gap-1.5">
                    <div className="flex justify-between text-[13px] text-soft"><span>{t('memberCodeLabel')} <span className="font-semibold text-ink">{member.code}</span></span></div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-[15px] font-semibold text-ink">{member.name}</span>
                      <span className="text-[14px] text-soft">{t('points')} <span className="font-semibold text-ink tabular-nums">{formatCop(member.points)}</span></span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[15px] text-ink">{t('usePoints')}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] text-dim">{t('pointsRate', { amount: `$ ${formatCop(rate.copPerPoint * 100)}` })}</span>
                        <Toggle checked={usePoints} onChange={setUsePoints} label={t('usePoints')} />
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <p className="px-5 py-3 text-[16px] font-semibold text-ink border-b border-border">{t('orderDetails')}</p>
              <ul className="flex-1 min-h-0 overflow-auto px-5 py-3 flex flex-col gap-3">
                {order.lines.map((l) => (
                  <li key={l.uuid} className="flex justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-[15px] text-ink truncate">{l.name}</span>{l.couponCode&&<span className="block text-[12px] text-success-ink">Cupón {l.couponCode} · −{l.discount}%</span>}
                      <span className="block text-[13px] text-soft tabular-nums">$ {formatCop(l.unitPrice)}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-[13px] text-soft">x {l.qty}</span>
                      <span className="block text-[15px] font-semibold text-ink tabular-nums">$ {formatCop(l.total)}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <dl className="shrink-0 px-5 py-4 bg-canvas border-t border-border flex flex-col gap-2 text-[15px]">
                <div className="flex justify-between"><dt className="text-soft">{t('subtotal')}</dt><dd className="text-ink tabular-nums">$ {formatCop(base - order.tax)}</dd></div>
                <div className="flex justify-between"><dt className="text-soft">{t('tax')}</dt><dd className="text-ink tabular-nums">$ {formatCop(order.tax)}</dd></div>
                {tip > 0 && <div className="flex justify-between"><dt className="text-soft">{t('tip')}</dt><dd className="text-ink tabular-nums">$ {formatCop(tip)}</dd></div>}
                {discount > 0 && <div className="flex justify-between"><dt className="text-success-ink">{t('memberPoints')}</dt><dd className="text-success-ink tabular-nums">− $ {formatCop(discount)}</dd></div>}
                <div className="flex justify-between"><dt className="font-semibold text-ink">{t('totalPayment')}</dt><dd className="text-[17px] font-bold text-ink tabular-nums">$ {formatCop(grand)}</dd></div>
              </dl>
            </div>

            {/* Derecha: métodos de pago */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              <div role="tablist" aria-label={t('method')} className="m-5 mb-0 p-1 rounded-lg bg-muted flex shrink-0">
                {PAY_KINDS.map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setMethodId(null); setCardStage('idle') }}
                    className={cn('flex-1 h-11 rounded-md flex items-center justify-center gap-2 text-[15px] font-semibold', kind === k ? 'bg-surface border border-border text-ink' : 'text-dim')}>
                    <Icon name={KIND_ICON[k]} size={18} />{t(`methods.${k}`)}
                  </button>
                ))}
              </div>

              {/* Con qué y cuánto se cobra ESTE pago. Antes el importe salía siempre del reparto en partes
                  iguales y el método era el primero de su tipo, así que no se podía cobrar "50.000 con esta
                  tarjeta y el resto en efectivo" ni elegir entre dos datáfonos. */}
              {grand > 0 && (
                <div className="mx-5 mt-3 flex flex-wrap items-end gap-3 shrink-0">
                  {sameKind.length > 1 && (
                    <label className="flex flex-col gap-1">
                      <span className="text-[13px] text-soft">{t('methodName')}</span>
                      <select aria-label={t('methodName')} value={method?.id ?? ''} onChange={(e) => setMethodId(Number(e.target.value))}
                        className="h-11 px-3 rounded-md border border-border bg-surface text-[15px] text-ink">
                        {sameKind.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="flex flex-col gap-1">
                    <span className="text-[13px] text-soft">{t('amountToCharge')}</span>
                    <input aria-label={t('amountToCharge')} inputMode="numeric" value={partial === null ? '' : partial}
                      placeholder={String(Math.round(due))} disabled={busy}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '')
                        setPartial(digits === '' ? null : Math.min(Number(digits), Math.round(left)))
                      }}
                      className="h-11 w-36 px-3 rounded-md border border-border bg-surface text-[15px] text-ink tabular-nums" />
                  </label>
                  {partial !== null && (
                    <button type="button" onClick={() => setPartial(null)} className="h-11 text-[14px] font-semibold text-primary">{t('wholeRemaining')}</button>
                  )}
                  <span className="text-[13px] text-soft pb-3">{t('remainingAfter', { amount: `$ ${formatCop(Math.max(0, left - due))}` })}</span>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-auto flex flex-col">
                {/* Los puntos pueden cubrir el pedido entero: entonces no hay nada que cobrar, solo cerrarlo. */}
                {grand === 0 ? (
                  <div className="px-6 py-5 flex flex-col gap-4">
                    <p className="text-[15px] text-soft">{t('nothingDue')}</p>
                    <div className="h-14 px-4 rounded-md border border-border bg-canvas flex items-center justify-between">
                      <span className="text-[16px] text-ink">{t('totalPayment')}</span><span className="text-[18px] font-bold text-ink tabular-nums">$ {formatCop(0)}</span>
                    </div>
                    <Button variant="primary" size="money" className="w-full rounded-md" disabled={busy} onClick={() => void finish([])}>{t('confirmPay')}</Button>
                  </div>
                ) : (
                  <>
                    {kind === 'cash' && <CashPanel due={due} text={cashText} onText={setCashText} busy={busy}
                      onPay={(received) => method && register({ methodId: method.id, type: 'cash', amount: due, received, reference: '' })} />}
                    {kind === 'card' && <CardPanel due={due} deadline={deadline} stage={cardStage} busy={busy}
                      onConfirm={() => void payCard()} onResult={(approved, reference) => askRef.current?.({ approved, reference })} />}
                    {kind === 'qr' && <QrPanel due={due} deadline={deadline} company={catalog?.company.name ?? ''} checking={checking} busy={busy}
                      payload={`WAITER|${order.trackingNumber}|${Math.round(due)}`} onConfirm={payQr} />}
                  </>
                )}

                {grand > 0 && !method && <p role="alert" className="px-6 text-[14px] text-danger-ink">{t('noQrMethod')}</p>}
                {error && <p role="alert" className="px-6 pb-2 text-[14px] text-danger-ink">{error}</p>}

                <div className="px-6 pb-5">
                  <button type="button" aria-expanded={options} onClick={() => setOptions((v) => !v)} className="h-10 flex items-center gap-1.5 text-[14px] font-semibold text-soft">
                    <Icon name={options ? 'chevronDown' : 'chevronRight'} size={16} />{t('moreOptions')}
                  </button>
                  {options && (
                    <div className="flex flex-col gap-4 p-4 rounded-lg border border-border bg-canvas">
                      <div className="flex flex-col gap-2">
                        <span className="text-[14px] text-soft">{t('tip')}</span>
                        <div className="flex gap-2 flex-wrap">
                          {(['none', 'suggested', 'custom'] as TipMode[]).map((m) => (
                            <button key={m} type="button" aria-pressed={tipMode === m} onClick={() => setTipMode(m)}
                              className={cn('h-10 px-3.5 rounded-md border text-[14px] font-semibold', tipMode === m ? 'bg-primary-soft border-primary/40 text-primary' : 'bg-surface border-border text-soft')}>
                              {m === 'none' ? t('tipNone') : m === 'suggested' ? t('tipSuggested', { amount: `$ ${formatCop(suggestedTip(base))}` }) : t('tipCustom')}
                            </button>
                          ))}
                        </div>
                        {tipMode === 'custom' && (
                          <input type="number" min={0} value={customTip} aria-label={t('tipAmount')} onChange={(e) => setCustomTip(Math.max(0, amountOf(e.target.value)))}
                            className="h-11 px-3.5 rounded-md border border-border bg-surface text-[15px] text-ink tabular-nums" />
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-[14px] text-soft">{t('split')}</span>
                        <div className="flex items-center gap-3">
                          <button type="button" aria-label={t('fewerParts')} onClick={() => setParts((p) => Math.max(1, p - 1))} className="w-10 h-10 rounded-sm bg-muted text-ink grid place-items-center"><Icon name="minus" size={18} /></button>
                          <span className="min-w-8 text-center text-[16px] font-semibold text-ink tabular-nums">{parts}</span>
                          <button type="button" aria-label={t('moreParts')} onClick={() => setParts((p) => Math.min(8, p + 1))} className="w-10 h-10 rounded-sm border border-border bg-surface text-ink grid place-items-center"><Icon name="plus" size={18} /></button>
                          <span className="text-[14px] text-soft">{parts > 1 ? t('partsOf', { n: parts, amount: `$ ${formatCop(splitEqual(grand, parts)[0])}` }) : t('noSplit')}</span>
                        </div>
                      </div>
                      {payments.length > 0 && (
                        <ul className="flex flex-col gap-2">
                          {payments.map((p, i) => (
                            <li key={i} className="h-11 px-3.5 rounded-md bg-surface border border-border flex items-center justify-between text-[14px]">
                              <span className="text-ink">{methods.find((m) => m.id === p.methodId)?.name}</span>
                              <span className="flex items-center gap-3">
                                <span className="text-ink tabular-nums">$ {formatCop(p.amount)}</span>
                                <button type="button" aria-label={t('removePayment')} onClick={() => setPayments((ps) => ps.filter((_, j) => j !== i))} className="text-soft"><Icon name="close" size={16} /></button>
                              </span>
                            </li>
                          ))}
                          <li className="flex justify-between text-[14px]"><span className="text-soft">{t('remaining')}</span><span className="font-semibold text-ink tabular-nums">$ {formatCop(left)}</span></li>
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
