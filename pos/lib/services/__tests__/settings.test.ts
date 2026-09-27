import { callKw } from '@/lib/services/odoo'
import { getBrand, getBrandLogo, saveBrand, saveBrandGreeting, type BrandInfo } from '@/lib/services/settings'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn() }))
const m = callKw as jest.Mock
const BRAND: BrandInfo = { companyId: 1, color: '#7a2e2a', font: 'Lora', radius: '14', tagline: 'Cocina de barrio', greeting: '', waiterName: 'Alex', welcome: '', hasLogo: false }

beforeEach(() => m.mockReset())

// Falla si la lectura pide el base64 del logo (bin_size) o si los False de Odoo llegan al formulario como false.
it('reads the brand with bin_size and maps False to empty strings', async () => {
  m.mockResolvedValueOnce([{ id: 1, brand_color: false, brand_font: false, brand_radius: false, brand_tagline: 'Cocina', brand_greeting: false, brand_waiter_name: false, brand_welcome: false, brand_logo: '12.5 Kb' }])
  await expect(getBrand()).resolves.toEqual({ companyId: 1, color: '', font: '', radius: '', tagline: 'Cocina', greeting: '', waiterName: '', welcome: '', hasLogo: true })
  const [model, method, args, kwargs] = m.mock.calls[0]
  expect([model, method]).toEqual(['res.company', 'search_read'])
  expect(args[1]).toContain('brand_logo')
  expect(kwargs).toEqual({ limit: 1, context: { bin_size: true } })
  m.mockResolvedValueOnce([{ id: 1, brand_color: '#7A2E2A', brand_font: 'Lora', brand_radius: '24', brand_tagline: false, brand_greeting: false, brand_waiter_name: false, brand_welcome: false, brand_logo: false }])
  await expect(getBrand()).resolves.toMatchObject({ color: '#7A2E2A', font: 'Lora', radius: '24', hasLogo: false })
})

// Falla si el logo se lee con bin_size (llegaría "12.5 Kb" en vez de la imagen) o si un False no se traduce a null.
it('reads the logo base64 without bin_size', async () => {
  m.mockResolvedValueOnce([{ id: 1, brand_logo: 'iVBORw0KGgo=' }])
  await expect(getBrandLogo(1)).resolves.toBe('iVBORw0KGgo=')
  expect(m.mock.calls[0]).toEqual(['res.company', 'read', [[1], ['brand_logo']]])
  m.mockResolvedValueOnce([{ id: 1, brand_logo: false }])
  await expect(getBrandLogo(1)).resolves.toBeNull()
})

// Falla si la marca se guarda por write (Odoo exigiría el grupo system y no recortaría), si un campo vacío viaja
// como '' (Odoo lo guardaría como texto vacío en vez de "usar el registro") o si el logo se toca sin haberlo cambiado.
it('writes through write_brand with empty strings as false, uppercased color and no logo by default', async () => {
  m.mockResolvedValueOnce(true)
  await saveBrand(BRAND)
  const [model, method, args] = m.mock.calls[0]
  expect([model, method]).toEqual(['res.company', 'write_brand'])
  expect(args).toHaveLength(1)
  expect(args[0]).toEqual({ brand_color: '#7A2E2A', brand_font: 'Lora', brand_radius: '14', brand_tagline: 'Cocina de barrio', brand_greeting: false, brand_waiter_name: 'Alex', brand_welcome: false })
  expect(args[0]).not.toHaveProperty('brand_logo')
})

// Falla si subir un logo no manda el base64 o si quitarlo no manda false.
it('uploads or removes the logo when asked', async () => {
  m.mockResolvedValue(true)
  await saveBrand({ ...BRAND, color: '', radius: '' }, { base64: 'QUJD' })
  expect(m.mock.calls[0][2][0]).toMatchObject({ brand_color: false, brand_radius: false, brand_logo: 'QUJD' })
  await saveBrand(BRAND, { remove: true })
  expect(m.mock.calls[1][2][0].brand_logo).toBe(false)
})

// Falla si un texto de solo espacios se guarda como texto (el comensal vería una línea en blanco) o si los espacios
// de los bordes llegan a Odoo: el addon recorta igual, y lo guardado debe ser lo que la vista previa mostró.
it('trims the texts and sends whitespace-only ones as false', async () => {
  m.mockResolvedValueOnce(true)
  await saveBrand({ ...BRAND, color: ' #7a2e2a ', tagline: '   ', greeting: ' Buenas ', waiterName: ' Alex ', welcome: '\t' })
  expect(m.mock.calls[0][2][0]).toEqual({ brand_color: '#7A2E2A', brand_font: 'Lora', brand_radius: '14', brand_tagline: false, brand_greeting: 'Buenas', brand_waiter_name: 'Alex', brand_welcome: false })
})

// Falla si el saludo del menú pisa el resto de la marca (color, fuente, logo), si vacío viaja como '' en vez de false, o si
// vuelve a usar res.company.write (el administrador del POS no tiene ese permiso; write_brand sí lo admite).
it('saves only the menu greeting through write_brand and clears it with false', async () => {
  m.mockResolvedValue(true)
  await saveBrandGreeting('  Buenas noches  ')
  expect(m.mock.calls[0]).toEqual(['res.company', 'write_brand', [{ brand_greeting: 'Buenas noches' }]])
  await saveBrandGreeting('   ')
  expect(m.mock.calls[1]).toEqual(['res.company', 'write_brand', [{ brand_greeting: false }]])
})
