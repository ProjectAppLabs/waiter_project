import { onCore } from '@/lib/domain/backend'
import * as coreCatalog from '@/lib/services/core/catalog'
import { galleryUrl } from '@/lib/services/core/catalog'
import { mapProductInput, toAdminCategory, toAdminProduct, toTax } from '@/lib/services/core/catalogBridge'
import { parseDinerAttributes, serializeDinerAttributes, type DinerAttributes } from '@/lib/domain/dinerAttributes'
import { useAuthStore } from '@/lib/stores/authStore'
import { callKw } from '@/lib/services/odoo'

export interface AdminProduct { variantId?: number; id: number; name: string; price: number; categoryIds: number[]; taxIds: number[]; available: boolean; storable: boolean; favorite: boolean; description: string; hasImage: boolean; dinerAttributes: DinerAttributes }
export interface AdminCategory { id: number; name: string; sequence: number; station: string | null }
export interface Tax { id: number; name: string; amount: number }
// image: base64 sin prefijo para subir una foto nueva; undefined deja la que hay.
// gallery (Plan M): lista final ordenada de la galería (fotos existentes por id, nuevas en base64); undefined no la toca.
export type ProductInput = Omit<AdminProduct, 'id' | 'hasImage'> & { image?: string; gallery?: GalleryItem[] }

// Plan M · Galería del plato: la principal más hasta 4 fotos. Odoo las optimiza a WebP al guardarlas.
export type GalleryItem = { id: number } | { image: string }
export const GALLERY_MAX = 4
export const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const PHOTO_MAX_BYTES = 12 * 1024 * 1024
export const catalogPhotoUrl = (id: number) => (onCore() ? galleryUrl(id) : `/odoo/web/image/projectapp.product.photo/${id}/image`)

export async function listCatalogPhotos(templateId: number): Promise<{ id: number }[]> {
  if (onCore()) return (await coreCatalog.listPhotos(templateId)).map((p) => ({ id: p.id }))
  return callKw<{ id: number }[]>('projectapp.product.photo', 'search_read', [[['product_tmpl_id', '=', templateId]], ['id']], { order: 'sequence asc, id asc' })
}

export async function setCatalogPhotos(templateId: number, photos: GalleryItem[]): Promise<{ id: number; width: number; height: number; size: number }[]> {
  if (onCore()) return (await coreCatalog.setPhotos(templateId, photos)).map((p) => ({ id: p.id, width: p.width, height: p.height, size: 0 }))
  const employee = useAuthStore.getState().employee
  return callKw('product.template', 'waiter_set_catalog_photos', [templateId, photos, employee?.id, employee?.token])
}

interface RawTemplate { product_variant_id?: [number,string] | false; id: number; name: string; list_price: number; pos_categ_ids: number[]; taxes_id: number[]; available_in_pos: boolean; is_storable: boolean; is_favorite: boolean; description_sale: string | false; image_128: string | false; diner_attributes: string | false }
interface RawCategory { id: number; name: string; sequence: number; kitchen_station: string | false }

const TEMPLATE_FIELDS = ['name', 'list_price', 'pos_categ_ids', 'taxes_id', 'available_in_pos', 'is_storable', 'is_favorite', 'description_sale', 'image_128', 'diner_attributes', 'product_variant_id']

export async function listProducts(): Promise<AdminProduct[]> {
  if (onCore()) return (await coreCatalog.listProducts('dish')).filter((p): p is coreCatalog.CoreDish => p.kind === 'dish').map(toAdminProduct)
  const rows = await callKw<RawTemplate[]>('product.template', 'search_read', [[['type', '=', 'consu'], ['sale_ok', '=', true]], TEMPLATE_FIELDS], { order: 'name asc' })
  return rows.map((r) => ({ ...(r.product_variant_id?{variantId:r.product_variant_id[0]}:{}), id: r.id, name: r.name, price: r.list_price, categoryIds: r.pos_categ_ids, taxIds: r.taxes_id, available: r.available_in_pos,
    storable: r.is_storable, favorite: r.is_favorite, description: r.description_sale || '', hasImage: Boolean(r.image_128), dinerAttributes: parseDinerAttributes(r.diner_attributes) }))
}

function toValues(p: ProductInput) {
  return { ...(p.image !== undefined ? { image_1920: p.image } : {}), name: p.name, list_price: p.price, pos_categ_ids: [[6, 0, p.categoryIds]], taxes_id: [[6, 0, p.taxIds]], available_in_pos: p.available,
    is_storable: p.storable, is_favorite: p.favorite, description_sale: p.description || false, diner_attributes: serializeDinerAttributes(p.dinerAttributes ?? {}), type: 'consu', sale_ok: true }
}

export async function saveProduct(id: number | null, p: ProductInput): Promise<number> {
  if (onCore()) return (id === null ? await coreCatalog.createProduct(mapProductInput(p)) : await coreCatalog.updateProduct(id, mapProductInput(p))).id
  const employee=useAuthStore.getState().employee
  return callKw<number>('product.template','waiter_save_catalog_product',[id,toValues(p),employee?.id,employee?.token])
}

export async function listCategories(): Promise<AdminCategory[]> {
  if (onCore()) return (await coreCatalog.listCategories()).map(toAdminCategory)
  const rows = await callKw<RawCategory[]>('pos.category', 'search_read', [[], ['name', 'sequence', 'kitchen_station']], { order: 'sequence asc, id asc' })
  return rows.map((r) => ({ id: r.id, name: r.name, sequence: r.sequence, station: r.kitchen_station || null }))
}

export async function saveCategory(id: number | null, c: { name: string; station: string | null }): Promise<number> {
  if (onCore()) return (id === null ? await coreCatalog.createCategory({ name: c.name, station: c.station ?? '' }) : await coreCatalog.updateCategory(id, { name: c.name, station: c.station ?? '' })).id
  const values = { name: c.name, kitchen_station: c.station || false }
  if (id === null) return callKw<number>('pos.category', 'create', [values])
  await callKw('pos.category', 'write', [[id], values])
  return id
}

export async function listTaxes(): Promise<Tax[]> {
  if (onCore()) return (await coreCatalog.listTaxes()).taxes.map(toTax)
  const rows = await callKw<{ id: number; name: string; amount: number }[]>('account.tax', 'search_read', [[['type_tax_use', '=', 'sale'], ['amount', '>=', 0]], ['name', 'amount']], { order: 'amount desc' })
  return rows.map((r) => ({ id: r.id, name: r.name, amount: r.amount }))
}
