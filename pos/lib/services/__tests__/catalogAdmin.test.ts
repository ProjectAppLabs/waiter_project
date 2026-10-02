import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { catalogPhotoUrl, listCatalogPhotos, saveProduct, setCatalogPhotos } from '@/lib/services/catalogAdmin'
const input = { name: 'Lomo', price: 38900, categoryIds: [2], taxIds: [55], available: true, storable: false, favorite: true, description: '', dinerAttributes: { picante: 2 as const } }
// Falla si el alta pierde categorías, impuestos o atributos del comensal.
it('crea el producto con sus atributos', async () => {
  m.mockResolvedValue({ product: { id: 9 } })
  await expect(saveProduct(null, input)).resolves.toBe(9)
  expect(m).toHaveBeenCalledWith('products', { method: 'POST', body: expect.objectContaining({ category_ids: [2], tax_ids: [55], diner_attributes: { picante: 2 }, description: '' }) })
})
// Falla si quitar atributos conserva los anteriores en vez de enviar el objeto vacío.
it('vacía los atributos al editar', async () => {
  m.mockResolvedValue({ product: { id: 3 } })
  await saveProduct(3, { ...input, dinerAttributes: {} })
  expect(m).toHaveBeenCalledWith('products/3', { method: 'PATCH', body: expect.objectContaining({ diner_attributes: {} }) })
})
// Falla si la galería cambia de orden, pierde fotos nuevas o utiliza una ruta ajena al sistema propio.
it('lee y guarda la galería ordenada', async () => {
  m.mockResolvedValue({ photos: [{ id: 7, width: 400, height: 300 }] })
  await expect(listCatalogPhotos(3)).resolves.toEqual([{ id: 7 }])
  await setCatalogPhotos(3, [{ id: 7 }, { image: 'AAAA' }])
  expect(m).toHaveBeenLastCalledWith('products/3/photos', { method: 'PUT', body: [{ id: 7 }, { image: 'AAAA' }] })
  expect(catalogPhotoUrl(7)).toMatch(/^\/experience\/api\/pos\/v1\/photos\/gallery\/7\?org=/)
})
