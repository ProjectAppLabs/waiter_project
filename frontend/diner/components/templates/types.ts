// Contrato 4 · Props de los layouts del motor. Los datos (carta, carrito, cuenta, pago) son los mismos para las 30 plantillas;
// cada layout decide dónde y cómo los pinta. Los nombres de estas props son vinculantes (docs/planes/2026-09-05-plan-H-plantillas.md).
import type { Account, AccountOrder, Bill, Cart, Discount, Dish, Entry, OrderStatus, PayMethod, PayScope, PayResult, PayState, RegisterForm, Template } from '@/lib/types'

// Menú: la búsqueda y el filtro son de Waiter (el contenedor guarda el estado); el layout elige dónde los pinta.
export interface MenuLayoutProps {
  entry: Entry
  template: Template
  query: string
  setQuery: (query: string) => void
  category: number | null
  setCategory: (category: number | null) => void
  onOpen: (dish: Dish) => void
  onAdd: (dish: Dish) => void
  cart: Cart | null
  orderBarHref: string
}

// Rutas que un carrito enlaza (Link, no callbacks): las calcula el contenedor con pathFor.
export interface CartHrefs { home: string; menu: string; pay: string; table: string; signup: string }
export interface CartLayoutProps {
  cart: Cart | null
  template: Template
  busy: boolean
  error: string | null
  setQty: (lineId: number, qty: number) => void
  remove: (lineId: number) => void
  // Envía a cocina; resuelve con el id del pedido (o null si no se pudo). El layout decide cómo mostrar «Enviando…».
  confirm: () => Promise<string | null>
  goPay: () => void
  goMenu: () => void
  discount: Discount | null
  // Extras del motor (no del contrato): reintentar la carga y enlaces.
  retry: () => void
  hrefs: CartHrefs
}

export interface PayLayoutProps {
  bill: Bill
  template: Template
  methods: PayMethod[]
  onPay: (method: PayMethod, reparto?: PayScope) => void
  state: PayState
  demo: true
  goBack: () => void
  // Extras del motor: resultado, pedido en curso, comercio, cuenta ligada y salidas del flujo.
  result: PayResult | null
  order: OrderStatus | null
  merchant: string
  table: number | null
  account: Account | null
  onRetry: () => void
  onPayAtTable: () => void
  onSignup: () => void
  goMenu: () => void
}

export interface SignupProps {
  template: Template
  onSubmit: (form: RegisterForm) => void
  onSkip: () => void
  busy: boolean
  error: string | null
  discountPct: number
}

export interface CodeProps {
  template: Template
  email: string
  onVerify: (code: string) => void
  onResend: () => void
  onOtherChannel: () => void
  onBack: () => void
  busy: boolean
  error: string | null
}

export interface HistoryProps {
  template: Template
  account: Account
  orders: AccountOrder[]
  onReorder: (order: AccountOrder) => void
}
