import { catalogPhotoUrl, listCatalogPhotos, listProducts, saveProduct, setCatalogPhotos } from '@/lib/services/catalogAdmin'
import { callKw } from '@/lib/services/odoo'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn() }))
const m = callKw as jest.Mock
beforeEach(() => m.mockClear())
const input = { name: 'Lomo', price: 38900, categoryIds: [2], taxIds: [55], available: true, storable: false, favorite: true, description: '', dinerAttributes: { picante: 2 as const, etiquetas: ['popular'] } }

// Falla si el alta no pasa por la pasarela del addon (waiter_save_catalog_product valida al empleado administrador y
// guarda producto, combo y kit en una transacción), manda las categorías sin el comando [6,0,ids] que Odoo exige en
// many2many, o si los atributos del comensal no viajan como JSON en diner_attributes.
it('creates a product through the catalog gateway with many2many commands and the diner attributes as JSON', async () => {
  m.mockResolvedValueOnce(9)
  await expect(saveProduct(null, input)).resolves.toBe(9)
  const [model, method, args] = m.mock.calls[0]
  expect([model, method, args[0]]).toEqual(['product.template', 'waiter_save_catalog_product', null])
  const values = args[1]
  expect(values.pos_categ_ids).toEqual([[6, 0, [2]]])
  expect(values.description_sale).toBe(false)
  expect(JSON.parse(values.diner_attributes)).toEqual({ picante: 2, etiquetas: ['popular'] })
})

// Falla si la lista pierde el "agotado por stock", la descripción vacía llega como false, o los atributos no se parsean.
it('maps templates to admin products', async () => {
  m.mockResolvedValueOnce([{ id: 3, name: 'Angus', list_price: 36900, pos_categ_ids: [2], taxes_id: [55], available_in_pos: true, is_storable: true, is_favorite: false, description_sale: false, image_128: false, diner_attributes: '{"soloHoy": true}' }])
  const [p] = await listProducts()
  expect(p).toEqual({ id: 3, name: 'Angus', price: 36900, categoryIds: [2], taxIds: [55], available: true, storable: true, favorite: false, description: '', hasImage: false, dinerAttributes: { soloHoy: true } })
})

// Falla si sin atributos se manda "{}" (la carta leería un objeto vacío en vez de "sin atributos").
it('writes false to diner_attributes when the product has none', async () => {
  m.mockResolvedValueOnce(undefined)
  await saveProduct(3, { ...input, dinerAttributes: {} })
  expect(m.mock.calls[0][2][0]).toBe(3)
  expect(m.mock.calls[0][2][1].diner_attributes).toBe(false)
})

// Falla si la galería se lee de otro modelo o en otro orden, si al guardarla no viaja la lista final (ids y nuevas) con el
// empleado que firma, o si la miniatura no sale del proxy same-origin de Odoo.
it('reads and saves the dish gallery through the gateway', async () => {
  m.mockResolvedValueOnce([{ id: 7 }])
  await expect(listCatalogPhotos(3)).resolves.toEqual([{ id: 7 }])
  expect(m).toHaveBeenLastCalledWith('projectapp.product.photo', 'search_read', [[['product_tmpl_id', '=', 3]], ['id']], { order: 'sequence asc, id asc' })
  m.mockResolvedValueOnce([])
  await setCatalogPhotos(3, [{ id: 7 }, { image: 'AAAA' }])
  expect(m.mock.lastCall.slice(0, 2)).toEqual(['product.template', 'waiter_set_catalog_photos'])
  expect(m.mock.lastCall[2].slice(0, 2)).toEqual([3, [{ id: 7 }, { image: 'AAAA' }]])
  expect(catalogPhotoUrl(7)).toBe('/odoo/web/image/projectapp.product.photo/7/image')
})

