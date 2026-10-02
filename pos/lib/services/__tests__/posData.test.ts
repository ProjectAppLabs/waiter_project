import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { loadPosData } from '@/lib/services/posData'
import { DEFAULT_ROLE_POLICY } from '@/lib/domain/permissions'
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: { getState: () => ({ restaurant: { id: 1 }, restaurants: [] }) } }))
beforeEach(() => m.mockImplementation(async (path) => {
 if (path.startsWith('catalog?')) return { products: [
 { id: 3, name: 'Angus', category_ids: [1], tax_ids: [55], price: 36900, final_price: 35000, favorite: true, available_in_pos: true, sold_out: false, has_image: true },
 { id: 6, name: 'Cerveza', category_ids: [2], tax_ids: [55], price: 14000, available_in_pos: true, sold_out: true },
 { id: 9, name: 'Interno', category_ids: [], tax_ids: [], price: 1, available_in_pos: false },
 ], categories: [{ id: 1, name: 'Hamburguesas', sequence: 0, station: 'Parrilla' }] }
 if (path === 'org') return { organization: { name: 'La Provincia' } }
 if (path.startsWith('floors?')) return { floors: [{ id: 2, name: 'Terraza', active: true, has_background: false, tables: [{ id: 6, number: 5, seats: 4, active: true, x: 40, y: 190, width: 110, height: 110, shape: 'square', color: '' }] }] }
 if (path.startsWith('payment-methods?')) return { methods: [{ id: 1, name: 'Efectivo', type: 'cash' }] }
 if (path.startsWith('settings?')) return { restaurant: {}, role_policy: DEFAULT_ROLE_POLICY, can_charge: true, can_edit_inventory: false }
 throw new Error(`Ruta inesperada: ${path}`)
}))
// Falla si la carta pierde impuestos, categorías, favoritos o precio final de la sede.
it('carga el producto con el precio de la sede', async () => {
 const c = await loadPosData(1)
 expect(c.products[0]).toMatchObject({ id: 3, price: 35000, categoryIds: [1], taxIds: [55], favorite: true })
})
// Falla si aparecen productos internos o se infiere agotado sin respetar al servidor.
it('filtra productos internos y conserva agotados', async () => {
 expect((await loadPosData(1)).products.map((p) => [p.name, p.soldOut])).toEqual([['Angus', false], ['Cerveza', true]])
})
// Falla si se pierden nombre, geometría y efectivo al cargar la administración sin abrir caja.
it('carga organización y salón sin crear turno', async () => {
 const c = await loadPosData(null)
 expect(c.company.name).toBe('La Provincia')
 expect(c.tables[0]).toMatchObject({ floorId: 2, x: 40, y: 190, width: 110, height: 110 })
 expect(c.paymentMethods[0].type).toBe('cash')
 expect(m.mock.calls.every(([path]) => !path.startsWith('shifts'))).toBe(true)
})
