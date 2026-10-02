export interface Product { id: number; templateId: number; name: string; price: number; categoryIds: number[]; taxIds: number[]; favorite: boolean; storable: boolean; soldOut: boolean; hasImage: boolean }
export interface Category { id: number; name: string; sequence: number; station: string | null }
export interface Floor { id: number; name: string; tableIds: number[]; hasBackground: boolean }
export type TableShape = 'square' | 'round'
export interface Table { id: number; number: number; floorId: number; seats: number; x: number; y: number; width: number; height: number; shape: TableShape; color: string | null }
export interface PaymentMethod { id: number; name: string; type: 'cash' | 'bank' | 'pay_later' }
export interface Company { name: string }
export interface Settings { rolePermissions?: import('@/lib/domain/permissions').RolePolicy; configId: number; configName: string; waiterCanCharge: boolean; waiterCanEditInventory: boolean; alertLateMinutes: number; alertBillMinutes: number; roiHourCost: number; roiMinutesPerOrder: number; roiBaselineHoursPer100: number; roiMonthlyCost: number; roiStartDate: string | null; tipProductId: number | null }
export interface Catalog { company: Company; settings: Settings; products: Product[]; categories: Category[]; floors: Floor[]; tables: Table[]; paymentMethods: PaymentMethod[] }
