'use client'

import { create } from 'zustand'
import { announceAdd } from '@/lib/domain/cartEvents'

import { DEFAULT_TEMPLATE, applyPreview, parsePreview, templateFromSpec } from '@/lib/domain/template'
import { setPreviewReadOnly } from '@/lib/domain/preview'
import { addBundle, getFavorites, setFavorite, ApiError, addLine, callWaiter, confirmOrder, getAccount, getCart, getEntry, getThemeDraft, getOrder, getTemplates, logoutAccount, openSession, registerAccount, removeLine, quoteBill, requestBill, simulatePayment, updateLine, verifyAccount } from '@/lib/services/api'
import type { Account, AccountOrder, Bill, Cart, Entry, OrderStatus, PayMethod, PayScope, PayResult, PayState, RegisterForm, Session, Template } from '@/lib/types'

interface Keys { rest: string; venue: string; token: string | null }
// Registro pendiente de verificar: el id que devolvió experience y el formulario, por si hay que reenviar el código.
interface PendingAccount { id: string; form: RegisterForm }
// Tiempo mínimo en «Autorizando»: el comensal debe ver que algo pasa antes del resultado (el endpoint simulado responde al instante).
export const AUTHORIZING_MS = 1_200

interface DinerState {
  favorites: number[]
  favoritesBusy: boolean
  loadFavorites: () => Promise<void>
  favorite: (productId: number) => Promise<boolean>
  keys: Keys | null
  entry: Entry | null
  session: Session | null
  cart: Cart | null
  order: OrderStatus | null
  bill: Bill | null
  error: string | null
  busy: boolean
  // Plantilla que pinta el motor: borrador validado > contexto de la sede > S1 embebida.
  template: Template
  preview: Template | null
  draftToken: string | null
  draftExpires: string | null
  // Cuenta del comensal (maquetada con datos reales).
  account: Account | null
  accountOrders: AccountOrder[]
  pendingAccount: PendingAccount | null
  // Pago maquetado.
  payState: PayState
  payResult: PayResult | null
  load: (keys: Keys, draft?: string | null) => Promise<void>
  applyPreviewParam: (raw: string | null | undefined) => Promise<void>
  ensureSession: () => Promise<Session | null>
  refreshCart: () => Promise<void>
  refreshBill: () => Promise<void>
  demoSession: string | null
  add: (productId: number, qty: number, note: string) => Promise<void>
  setQty: (lineId: number, qty: number) => Promise<void>
  remove: (lineId: number) => Promise<void>
  addBundle: (lines: {producto_id:number;cantidad:number;nota:string}[]) => Promise<void>
  confirm: (takeaway?: boolean, details?: {notas: string; alergenos: string; metodo_pago?: import('@/lib/types').DeliveryMethod}) => Promise<string | null>
  refreshOrder: (orderId: string) => Promise<void>
  call: () => Promise<boolean>
  askBill: () => Promise<Bill | null>
  register: (form: RegisterForm) => Promise<string | null>
  resendCode: () => Promise<boolean>
  verify: (code: string) => Promise<boolean>
  loadAccount: () => Promise<void>
  logout: () => Promise<void>
  simulatePay: (metodo: PayMethod, reparto?: PayScope) => Promise<PayResult | null>
  resetPay: () => void
}

const message = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
// Proyección: lo confirmado más el carrito pendiente con su descuento; la autorización usa la respuesta del servidor.
export const payableTotal = (s: Pick<DinerState, 'bill' | 'order' | 'cart'>) => (s.order?.total ?? s.bill?.total ?? 0) + Math.max(0, (s.cart?.total ?? 0) - (s.cart?.descuento?.monto ?? 0))
const resolveTemplate = (preview: Template | null, entry: Entry | null) => preview ?? entry?.contexto.plantilla ?? DEFAULT_TEMPLATE

export const useDinerStore = create<DinerState>((set, get) => {
  let opening: { key: string; promise: Promise<Session | null> } | null = null
  let loadSequence = 0
  const run = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    set({ busy: true, error: null })
    try { return await fn() } catch (e) { set({ error: message(e) }); return null } finally { set({ busy: false }) }
  }
  return {
    favorites: [], favoritesBusy: false,
    keys: null, entry: null, session: null, cart: null, order: null, bill: null, error: null, busy: false,
    template: DEFAULT_TEMPLATE, preview: null, draftToken: null, draftExpires: null,
    account: null, accountOrders: [], pendingAccount: null,
    payState: 'idle', payResult: null, demoSession: null,
    // Entrada: contexto + carta (+ plantilla resuelta). La sesión (cookie del comensal) se abre al primer gesto que la necesite.
    load: async (keys, draft = null) => {
      const sequence = ++loadSequence
      const same = get().keys && JSON.stringify(get().keys) === JSON.stringify(keys)
      // La vista previa (?vista_previa=) sobrevive a recargas de la entrada y a cambios de mesa; solo se descarta al cambiar de sede.
      const sameVenue = get().keys?.rest === keys.rest && get().keys?.venue === keys.venue
      const changedDraft = get().draftToken !== draft
      setPreviewReadOnly(draft !== null)
      if (!same || changedDraft) set({ favorites: [], account: null, accountOrders: [], pendingAccount: null, keys, entry: null,
        session: null, cart: null, order: null, bill: null, draftExpires: null, payState: 'idle', payResult: null,
        preview: sameVenue && !changedDraft ? get().preview : null })
      set({ draftToken: draft, busy: true, error: null })
      try {
        const [entry, resolved] = await Promise.all([getEntry(keys.rest, keys.venue, keys.token),
          draft !== null ? getThemeDraft(keys.rest, keys.venue, draft) : Promise.resolve(null)])
        if (sequence !== loadSequence) return
        set({ entry, preview: resolved?.plantilla ?? get().preview, draftExpires: resolved?.caduca ?? null,
          template: resolved?.plantilla ?? resolveTemplate(get().preview, entry) })
      } catch (e) {
        if (sequence === loadSequence) set({ entry: null, preview: null, draftExpires: null, template: DEFAULT_TEMPLATE, error: message(e) })
      } finally { if (sequence === loadSequence) set({ busy: false }) }
    },
    // Vista previa sin guardar (la usa el POS por iframe): parte del catálogo del código pedido resuelto con la marca de la sede.
    // Si el catálogo no responde, se previsualiza sobre la plantilla actual; sin parámetro se vuelve a lo guardado.
    applyPreviewParam: async (raw) => {
      const payload = parsePreview(raw)
      if (!payload) { if (get().preview) set({ preview: null, template: resolveTemplate(null, get().entry) }); return }
      const current = get().entry?.contexto.plantilla ?? DEFAULT_TEMPLATE
      let base = current
      if (payload.plantilla) {
        try {
          const spec = (await getTemplates(get().keys?.rest, get().keys?.venue)).plantillas.find((s) => s.codigo === payload.plantilla)
          if (spec) base = templateFromSpec(spec, current.descuento)
        } catch { /* sin catálogo: se previsualiza sobre la plantilla actual */ }
      }
      const preview = applyPreview(base, payload)
      set({ preview, template: preview })
    },
    ensureSession: async () => {
      if (get().draftToken !== null || get().preview) return null
      const { session, keys } = get()
      if (session || !keys) return session
      const key = JSON.stringify(keys)
      if (opening?.key === key) return opening.promise
      const promise = run(async () => {
        const r = await openSession(keys.rest, keys.venue, keys.token)
        if (JSON.stringify(get().keys) !== key || get().draftToken !== null || get().preview) return null
        set({ session: r.sesion })
        return r.sesion
      })
      opening = { key, promise }
      try { return await promise } finally { if (opening?.promise === promise) opening = null }
    },
    refreshBill: async () => {
      set({ bill: null })
      const session = await get().ensureSession()
      if (session) await run(async () => set({ bill: await quoteBill(session.id) }))
    },
    refreshCart: async () => {
      const session = await get().ensureSession()
      if (!session) return
      await run(async () => set({ cart: await getCart(session.id) }))
    },
    add: async (productId, qty, note) => {
      if (get().preview || get().draftToken !== null) { set({ error: 'Estás viendo una vista previa. Abre el menú para realizar esta acción.' }); return  }
      const session = await get().ensureSession()
      if (!session) return
      await run(async () => { set({ cart: await addLine(session.id, productId, qty, note) }); announceAdd() })
    },
    addBundle: async (lines) => {
      if (get().preview || get().draftToken !== null) { set({error:'Estás viendo una vista previa. Abre el menú para realizar esta acción.'}); return }
      const session = await get().ensureSession()
      if (!session) return
      await run(async () => { set({cart: await addBundle(session.id,lines)}); announceAdd() })
    },
    setQty: async (lineId, qty) => {
      if (get().preview || get().draftToken !== null) { set({ error: 'Estás viendo una vista previa. Abre el menú para realizar esta acción.' }); return  }
      const session = get().session
      if (!session) return
      await run(async () => set({ cart: await updateLine(session.id, lineId, { cantidad: qty }) }))
    },
    remove: async (lineId) => {
      if (get().preview || get().draftToken !== null) { set({ error: 'Estás viendo una vista previa. Abre el menú para realizar esta acción.' }); return  }
      const session = get().session
      if (!session) return
      await run(async () => set({ cart: await removeLine(session.id, lineId) }))
    },
    // Idempotente en el servidor: tocar dos veces devuelve el mismo pedido. Si el restaurante no responde (experience
    // devuelve el pedido como fallido), el carrito sigue ahí.
    confirm: async (takeaway, details) => {
      if (get().preview || get().draftToken !== null) { set({ error: 'Estás viendo una vista previa. Abre el menú para realizar esta acción.' }); return null }
      const { session, keys } = get()
      if (!session || !keys) return null
      return run(async () => {
        try {
          const r = details ? await confirmOrder(session.id, takeaway, details) : takeaway === undefined ? await confirmOrder(session.id) : await confirmOrder(session.id, takeaway)
          const order = await getOrder(r.pedido)
          set({ order, bill: r.cuenta ?? null, cart: await getCart(session.id) })
          return r.pedido
        } catch (e) {
          // 409: el salón ya cobró la cuenta de esta visita. La sesión terminó; se abre otra limpia y se avisa.
          if (e instanceof ApiError && e.status === 409) {
            const r = await openSession(keys.rest, keys.venue, keys.token)
            set({ session: r.sesion, cart: await getCart(r.sesion.id), order: null, bill: null })
          }
          throw e
        }
      })
    },
    refreshOrder: async (orderId) => { await run(async () => set({ order: await getOrder(orderId) })) },
    call: async () => {
      if (get().preview || get().draftToken !== null) { set({ error: 'Estás viendo una vista previa. Abre el menú para realizar esta acción.' }); return false }
      const session = await get().ensureSession()
      if (!session) return false
      return (await run(() => callWaiter(session.id))) ?? false
    },
    askBill: async () => {
      if (get().preview || get().draftToken !== null) { set({ error: 'Estás viendo una vista previa. Abre el menú para realizar esta acción.' }); return null }
      const session = await get().ensureSession()
      if (!session) return null
      return run(async () => { const bill = await requestBill(session.id); set({ bill }); return bill })
    },
    // Cuenta: dos campos, sin contraseña. El registro crea la cuenta pendiente; el código la verifica y la liga a la cookie.
    register: async (form) => {
      if (get().preview || get().draftToken !== null) { set({ error: 'Estás viendo una vista previa. Abre el menú para realizar esta acción.' }); return null }
      return run(async () => { const r = await registerAccount(form); set({ pendingAccount: { id: r.id, form: { ...form, clave: undefined } } }); return r.id })
    },
    resendCode: async () => {
      if (get().preview || get().draftToken !== null) { set({ error: 'Estás viendo una vista previa. Abre el menú para realizar esta acción.' }); return false }
      const pending = get().pendingAccount
      if (!pending) return false
      const ok = await run(async () => { const r = await registerAccount(pending.form); set({ pendingAccount: { id: r.id, form: pending.form } }); return true })
      return ok ?? false
    },
    verify: async (code) => {
      if (get().preview || get().draftToken !== null) { set({ error: 'Estás viendo una vista previa. Abre el menú para realizar esta acción.' }); return false }
      const pending = get().pendingAccount
      if (!pending) return false
      const ok = await run(async () => {
        const r = await verifyAccount(pending.id, code)
        const account: Account = r.cuenta ?? { id: pending.id, nombre: pending.form.nombre, correo: pending.form.correo, celular: pending.form.celular, verificada: true }
        set({ account, pendingAccount: null })
        return true
      })
      if (ok) await get().loadAccount()
      return ok ?? false
    },
    // Sin cuenta ligada a esta cookie, experience responde 401/404: no es un error que mostrar.
    loadAccount: async () => {
      await run(async () => {
        try {
          const r = await getAccount()
          set({ account: r.cuenta, accountOrders: r.pedidos ?? [] })
        } catch (e) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) { set({ account: null, accountOrders: [] }); return }
          throw e
        }
      })
    },
    logout: async () => {
      if (get().preview || get().draftToken !== null) { set({ error: 'Estás viendo una vista previa. Abre el menú para realizar esta acción.' }); return  }
      await run(async () => { await logoutAccount(); set({ account: null, accountOrders: [], pendingAccount: null, favorites: [] }) })
    },
    loadFavorites: async () => {
      const keys = get().keys
      if (!keys || !get().account) { set({ favorites: [] }); return }
      const accountId = get().account?.id
      await run(async () => {
        const favorites = await getFavorites(keys.rest, keys.venue)
        if (get().keys === keys && get().account?.id === accountId) set({ favorites })
      })
    },
    favorite: async (productId) => {
      if (get().draftToken !== null || get().preview) { set({ error: 'Estás viendo una vista previa. Abre el menú para realizar esta acción.' }); return false }
      const { keys, account, favorites, favoritesBusy } = get()
      if (!keys || !account || favoritesBusy) return false
      set({ favoritesBusy: true })
      try {
        const result = await run(() => setFavorite(keys.rest, keys.venue, productId, !favorites.includes(productId)))
        if (result && get().keys === keys && get().account?.id === account.id) set({ favorites: result })
        return result !== null
      } finally { set({ favoritesBusy: false }) }
    },
    // Pago maquetado: «Autorizando» al menos AUTHORIZING_MS, luego pagado o rechazado. Nunca sale el número de la tarjeta de aquí.
    simulatePay: async (metodo, reparto = 'all') => {
      if (get().preview || get().draftToken !== null) { set({ error: 'Estás viendo una vista previa. Abre el menú para realizar esta acción.' }); return null }
      if (get().payState === 'authorizing') return null
      set({ payState: 'authorizing', payResult: null, error: null })
      try {
        const session = await get().ensureSession()
        if (!session) throw new Error(get().error ?? 'No se pudo abrir la sesión')
        if (!await get().confirm()) throw new Error(get().error ?? 'No se pudo confirmar el pedido')
        const [payResult] = await Promise.all([simulatePayment(session.id, metodo, reparto), sleep(AUTHORIZING_MS)])
        set({ payState: payResult.estado === 'aprobado' ? 'paid' : 'declined', payResult, demoSession: payResult.demo && payResult.estado === 'aprobado' ? session.id : get().demoSession })
        return payResult
      } catch (e) {
        set({ payState: 'idle', payResult: null, error: message(e) })
        return null
      }
    },
    resetPay: () => set({ payState: 'idle', payResult: null }),
  }
})
