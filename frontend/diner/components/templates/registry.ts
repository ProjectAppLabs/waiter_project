// Contrato 4 · Registro de layouts del motor. El menú se registra por código ("A1"…"F5"), carrito y pago por familia
// ('A'…'F') y las pantallas de cuenta por patrón. Una clave que falta cae al genérico (B1 es la referencia del genérico),
// así el motor funciona antes de que existan los 30 y una plantilla nueva es un JSON + su layout aquí.
import type { ComponentType } from 'react'

import { familyOf } from '@/lib/domain/template'
import type { Template } from '@/lib/types'

import { GenericCart } from '@/components/templates/generic/GenericCart'
import { GenericCode } from '@/components/templates/generic/GenericCode'
import { GenericHistory } from '@/components/templates/generic/GenericHistory'
import { GenericMenu } from '@/components/templates/generic/GenericMenu'
import { GenericPay } from '@/components/templates/generic/GenericPay'
import { GenericSignup } from '@/components/templates/generic/GenericSignup'
// --- familia B
import { B1Menu } from '@/components/templates/families/B/B1Menu'
import { B2Menu } from '@/components/templates/families/B/B2Menu'
import { B3Menu } from '@/components/templates/families/B/B3Menu'
import { B4Menu } from '@/components/templates/families/B/B4Menu'
import { B5Menu } from '@/components/templates/families/B/B5Menu'
import { FamilyBCart } from '@/components/templates/families/B/FamilyBCart'
import { FamilyBPay } from '@/components/templates/families/B/FamilyBPay'
import { CardsHistory } from '@/components/templates/patterns/CardsHistory'
// --- fin familia B
// --- familia E
import { E1Menu } from '@/components/templates/families/E/E1Menu'
import { E2Menu } from '@/components/templates/families/E/E2Menu'
import { E3Menu } from '@/components/templates/families/E/E3Menu'
import { E4Menu } from '@/components/templates/families/E/E4Menu'
import { E5Menu } from '@/components/templates/families/E/E5Menu'
import { FamilyECart } from '@/components/templates/families/E/FamilyECart'
import { FamilyEPay } from '@/components/templates/families/E/FamilyEPay'
// --- fin familia E
// --- familia F
import { F1Menu } from '@/components/templates/families/F/F1Menu'
import { F2Menu } from '@/components/templates/families/F/F2Menu'
import { F3Menu } from '@/components/templates/families/F/F3Menu'
import { F4Menu } from '@/components/templates/families/F/F4Menu'
import { F5Menu } from '@/components/templates/families/F/F5Menu'
import { FamilyFCart } from '@/components/templates/families/F/FamilyFCart'
import { FamilyFPay } from '@/components/templates/families/F/FamilyFPay'
// --- fin familia F
import type { CartLayoutProps, CodeProps, HistoryProps, MenuLayoutProps, PayLayoutProps, SignupProps } from '@/components/templates/types'
import type { CodePattern, HistoryPattern, SignupPattern, TemplateFamily } from '@/lib/types'
// --- familia A
import { A1Menu } from '@/components/templates/families/A/A1Menu'
import { A2Menu } from '@/components/templates/families/A/A2Menu'
import { A3Menu } from '@/components/templates/families/A/A3Menu'
import { A4Menu } from '@/components/templates/families/A/A4Menu'
import { A5Menu } from '@/components/templates/families/A/A5Menu'
import { FamilyACart } from '@/components/templates/families/A/FamilyACart'
import { FamilyAPay } from '@/components/templates/families/A/FamilyAPay'
import { PortadaSignup } from '@/components/templates/patterns/PortadaSignup'
import { RevisaCorreoCode } from '@/components/templates/patterns/RevisaCorreoCode'
import { TablaCufeHistory } from '@/components/templates/patterns/TablaCufeHistory'
// --- fin familia A
// --- familia C
import { C1Menu } from '@/components/templates/families/C/C1Menu'
import { C2Menu } from '@/components/templates/families/C/C2Menu'
import { C3Menu } from '@/components/templates/families/C/C3Menu'
import { C4Menu } from '@/components/templates/families/C/C4Menu'
import { C5Menu } from '@/components/templates/families/C/C5Menu'
import { FamilyCCart } from '@/components/templates/families/C/FamilyCCart'
import { FamilyCPay } from '@/components/templates/families/C/FamilyCPay'
import { BenefitsSignup } from '@/components/templates/patterns/BenefitsSignup'
import { ChannelCode } from '@/components/templates/patterns/ChannelCode'
// --- fin familia C
// --- familia D
import { D1Menu } from '@/components/templates/families/D/D1Menu'
import { D2Menu } from '@/components/templates/families/D/D2Menu'
import { D3Menu } from '@/components/templates/families/D/D3Menu'
import { D4Menu } from '@/components/templates/families/D/D4Menu'
import { D5Menu } from '@/components/templates/families/D/D5Menu'
import { FamilyDCart } from '@/components/templates/families/D/FamilyDCart'
import { FamilyDPay } from '@/components/templates/families/D/FamilyDPay'
// --- fin familia D

export type { CartHrefs, CartLayoutProps, CodeProps, HistoryProps, MenuLayoutProps, PayLayoutProps, SignupProps } from '@/components/templates/types'

export const MENU_LAYOUTS: Record<string, ComponentType<MenuLayoutProps>> = { B1: GenericMenu }
export const CART_LAYOUTS: Partial<Record<TemplateFamily, ComponentType<CartLayoutProps>>> = { B: GenericCart }
export const PAY_LAYOUTS: Partial<Record<TemplateFamily, ComponentType<PayLayoutProps>>> = { B: GenericPay }
export const SIGNUP_PATTERNS: Partial<Record<SignupPattern, ComponentType<SignupProps>>> = { banner5: GenericSignup }
export const CODE_PATTERNS: Partial<Record<CodePattern, ComponentType<CodeProps>>> = { casillas: GenericCode }
export const HISTORY_PATTERNS: Partial<Record<HistoryPattern, ComponentType<HistoryProps>>> = { porMes: GenericHistory }

// --- familia A
// Alta cocina: cinco menús por código; carrito y pago por familia (A3/A4 y A3/A5 se ramifican dentro por template.codigo, el registro solo
// admite claves por familia); patrones de cuenta propios de la familia, reutilizables por cualquier plantilla.
MENU_LAYOUTS.A1 = A1Menu
MENU_LAYOUTS.A2 = A2Menu
MENU_LAYOUTS.A3 = A3Menu
MENU_LAYOUTS.A4 = A4Menu
MENU_LAYOUTS.A5 = A5Menu
CART_LAYOUTS.A = FamilyACart
PAY_LAYOUTS.A = FamilyAPay
SIGNUP_PATTERNS.portada = PortadaSignup
CODE_PATTERNS.revisaCorreo = RevisaCorreoCode
HISTORY_PATTERNS.tablaCufe = TablaCufeHistory
// --- fin familia A
// --- familia B
// Casual de barrio: cinco menús por código, carrito y pago de la familia (ramifican por template.codigo) y el patrón «tarjetas».
Object.assign(MENU_LAYOUTS, { B1: B1Menu, B2: B2Menu, B3: B3Menu, B4: B4Menu, B5: B5Menu })
CART_LAYOUTS.B = FamilyBCart
PAY_LAYOUTS.B = FamilyBPay
HISTORY_PATTERNS.tarjetas = CardsHistory
// --- fin familia B
// --- familia C
// Rápida y food truck: cinco menús por código, carrito y pago por familia (C3 y C5 ramifican dentro por template.codigo) y los
// patrones de cuenta que esta familia introduce (beneficios, canal); tarjetas y tablaCufe llegan con otras familias.
Object.assign(MENU_LAYOUTS, { C1: C1Menu, C2: C2Menu, C3: C3Menu, C4: C4Menu, C5: C5Menu })
CART_LAYOUTS.C = FamilyCCart
PAY_LAYOUTS.C = FamilyCPay
SIGNUP_PATTERNS.beneficios = BenefitsSignup
CODE_PATTERNS.canal = ChannelCode
// --- fin familia C
// --- familia D
Object.assign(MENU_LAYOUTS, { D1: D1Menu, D2: D2Menu, D3: D3Menu, D4: D4Menu, D5: D5Menu })
CART_LAYOUTS.D = FamilyDCart
PAY_LAYOUTS.D = FamilyDPay
// --- fin familia D
// --- familia E
// Bar y cervecería: cinco menús por código y el carrito y pago de la familia (ramifican por template.codigo: E2, E3 y E5 difieren
// del base E1/E4). Sus patrones de cuenta (banner5/portada/beneficios, casillas/revisaCorreo/canal, tarjetas/tablaCufe/porMes) no
// son propios de la familia: los registran otras familias o caen al genérico.
Object.assign(MENU_LAYOUTS, { E1: E1Menu, E2: E2Menu, E3: E3Menu, E4: E4Menu, E5: E5Menu })
CART_LAYOUTS.E = FamilyECart
PAY_LAYOUTS.E = FamilyEPay
// --- fin familia E
// --- familia F
MENU_LAYOUTS.F1 = F1Menu
MENU_LAYOUTS.F2 = F2Menu
MENU_LAYOUTS.F3 = F3Menu
MENU_LAYOUTS.F4 = F4Menu
MENU_LAYOUTS.F5 = F5Menu
CART_LAYOUTS.F = FamilyFCart
PAY_LAYOUTS.F = FamilyFPay
// --- fin familia F

export const menuLayout = (code: string | undefined): ComponentType<MenuLayoutProps> => (code && MENU_LAYOUTS[code.toUpperCase()]) || GenericMenu
export const cartLayout = (familia: TemplateFamily | string | undefined): ComponentType<CartLayoutProps> => CART_LAYOUTS[familia as TemplateFamily] ?? GenericCart
export const payLayout = (familia: TemplateFamily | string | undefined): ComponentType<PayLayoutProps> => PAY_LAYOUTS[familia as TemplateFamily] ?? GenericPay
export const signupPattern = (patron: SignupPattern | string | undefined): ComponentType<SignupProps> => SIGNUP_PATTERNS[patron as SignupPattern] ?? GenericSignup
export const codePattern = (patron: CodePattern | string | undefined): ComponentType<CodeProps> => CODE_PATTERNS[patron as CodePattern] ?? GenericCode
export const historyPattern = (patron: HistoryPattern | string | undefined): ComponentType<HistoryProps> => HISTORY_PATTERNS[patron as HistoryPattern] ?? GenericHistory

// La página pinta la cabecera de marca y la barra de pedido de Waiter solo cuando la pantalla cae al genérico: los layouts
// fieles traen su propia cabecera y su propia barra, tal como las dibujan los marcos del diseño.
export const ownsChrome = (screen: string, t: Template): boolean => {
  if (screen === 'carta') return Boolean(MENU_LAYOUTS[t.codigo.toUpperCase()])
  if (screen === 'pedido') return Boolean(CART_LAYOUTS[familyOf(t.layouts.carrito, t.familia)])
  if (screen === 'pago') return Boolean(PAY_LAYOUTS[familyOf(t.layouts.pago, t.familia)])
  return false
}
