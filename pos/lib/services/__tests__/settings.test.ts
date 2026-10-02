import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { getBrand, getBrandLogo, saveBrand, saveBrandGreeting, type BrandInfo } from '@/lib/services/settings'
const BRAND: BrandInfo = { companyId: 1, color: '#7a2e2a', font: 'Lora', radius: '14', tagline: 'Cocina de barrio', greeting: '', waiterName: 'Alex', welcome: '', hasLogo: false }
// Falla si los ajustes de marca pierden el logo o los textos al leerlos.
it('lee la marca del sistema propio', async () => {
 m.mockResolvedValue({ brand: { color: '', font: '', radius: '', tagline: 'Cocina', greeting: '', waiter_name: 'Ana', welcome: '', has_logo: true } })
 await expect(getBrand()).resolves.toMatchObject({ tagline: 'Cocina', waiterName: 'Ana', hasLogo: true })
})
// Falla si el logo no se lee como imagen binaria o si un logo ausente rompe el formulario.
it('lee el logo y tolera su ausencia', async () => {
 global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new Uint8Array([65, 66, 67]).buffer }).mockResolvedValueOnce({ ok: false })
 await expect(getBrandLogo(1)).resolves.toBe('QUJD')
 expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/experience\/api\/pos\/v1\/brand\/logo\?org=/))
 await expect(getBrandLogo(1)).resolves.toBeNull()
})
// Falla si guardar cambia el logo sin solicitarlo o conserva espacios en textos vacíos.
it('normaliza color y textos sin tocar el logo', async () => {
 m.mockResolvedValue({ brand: {} })
 await saveBrand({ ...BRAND, color: ' #7a2e2a ', tagline: '   ', greeting: ' Buenas ', waiterName: ' Alex ', welcome: '\t' })
 expect(m).toHaveBeenCalledWith('brand', { method: 'PATCH', body: { color: '#7A2E2A', font: 'Lora', radius: '14', tagline: '', greeting: 'Buenas', waiter_name: 'Alex', welcome: '' } })
})
// Falla si subir o quitar un logo no comunica la intención al servidor.
it('sube y elimina el logo', async () => {
 m.mockResolvedValue({ brand: {} }); await saveBrand(BRAND, { base64: 'QUJD' })
 expect(m).toHaveBeenLastCalledWith('brand', { method: 'PATCH', body: expect.objectContaining({ logo: 'QUJD' }) })
 await saveBrand(BRAND, { remove: true })
 expect(m).toHaveBeenLastCalledWith('brand', { method: 'PATCH', body: expect.objectContaining({ logo: null }) })
})
// Falla si editar el saludo pisa otros ajustes de marca.
it('actualiza solo el saludo', async () => {
 m.mockResolvedValue({ brand: {} }); await saveBrandGreeting(' Buenas '); await saveBrandGreeting('  ')
 expect(m.mock.calls).toEqual([['brand', { method: 'PATCH', body: { greeting: 'Buenas' } }], ['brand', { method: 'PATCH', body: { greeting: '' } }]])
})
