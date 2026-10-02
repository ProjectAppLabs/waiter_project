import { type DinerAttributes } from '@/lib/domain/dinerAttributes'
import * as coreCatalog from '@/lib/services/core/catalog'
import { galleryUrl } from '@/lib/services/core/catalog'
import { mapProductInput, toAdminCategory, toAdminProduct, toTax } from '@/lib/services/core/catalogBridge'

export interface AdminProduct { variantId?: number; id: number; name: string; price: number; categoryIds: number[]; taxIds: number[]; available: boolean; storable: boolean; favorite: boolean; description: string; hasImage: boolean; dinerAttributes: DinerAttributes }
export interface AdminCategory { id: number; name: string; sequence: number; station: string | null }
export interface Tax { id: number; name: string; amount: number }
// image: base64 sin prefijo para subir una foto nueva; undefined deja la que hay.
// gallery (Plan M): lista final ordenada de la galería (fotos existentes por id, nuevas en base64); undefined no la toca.
export type ProductInput = Omit<AdminProduct, 'id' | 'hasImage'> & { image?: string; gallery?: GalleryItem[] }

export type GalleryItem = { id: number } | { image: string }
export const GALLERY_MAX = 4
export const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const PHOTO_MAX_BYTES = 12 * 1024 * 1024
export const catalogPhotoUrl = (id: number) => (galleryUrl(id))

export async function listCatalogPhotos(templateId: number): Promise<{ id: number }[]> {
  return (await coreCatalog.listPhotos(templateId)).map((p) => ({ id: p.id }))
}

export async function setCatalogPhotos(templateId: number, photos: GalleryItem[]): Promise<{ id: number; width: number; height: number; size: number }[]> {
  return (await coreCatalog.setPhotos(templateId, photos)).map((p) => ({ id: p.id, width: p.width, height: p.height, size: 0 }))
}

export async function listProducts(): Promise<AdminProduct[]> {
  return (await coreCatalog.listProducts('dish')).filter((p): p is coreCatalog.CoreDish => p.kind === 'dish').map(toAdminProduct)
}

export async function saveProduct(id: number | null, p: ProductInput): Promise<number> {
  return (id === null ? await coreCatalog.createProduct(mapProductInput(p)) : await coreCatalog.updateProduct(id, mapProductInput(p))).id
}

export async function listCategories(): Promise<AdminCategory[]> {
  return (await coreCatalog.listCategories()).map(toAdminCategory)
}

export async function saveCategory(id: number | null, c: { name: string; station: string | null }): Promise<number> {
  return (id === null ? await coreCatalog.createCategory({ name: c.name, station: c.station ?? '' }) : await coreCatalog.updateCategory(id, { name: c.name, station: c.station ?? '' })).id
}

export async function listTaxes(): Promise<Tax[]> {
  return (await coreCatalog.listTaxes()).taxes.map(toTax)
}
