import { designSystemUrl, gateway, listTemplates, previewUrl, type MenuSettings } from '@/lib/services/menuTemplates'
import { jsonRpc } from '@/lib/services/odoo'

jest.mock('@/lib/services/odoo', () => ({ jsonRpc: jest.fn() }))
const rpc = jsonRpc as jest.Mock
const SETTINGS: MenuSettings = { plantilla: 'A1', paleta: { acento: '#7A2E2A' }, tipografia: { display: 'Fraunces' } }

beforeEach(() => { rpc.mockReset(); (globalThis as { fetch?: unknown }).fetch = jest.fn() })

// Falla si la lectura no va por la pasarela del addon (misma sesión de Odoo) o si la acción no viaja en los params.
it('reads the venue settings through the addon gateway with action get', async () => {
  const ctx = { restaurante: 'burger-house', sede: 'poblado', experienceUrl: 'http://exp', dinerUrl: 'http://diner', ajustes: SETTINGS }
  rpc.mockResolvedValueOnce(ctx)
  await expect(gateway('get')).resolves.toEqual(ctx)
  expect(rpc).toHaveBeenCalledWith('/waiter/admin/menu_settings', { action: 'get' })
})

// Falla si guardar no manda plantilla, paleta y tipografía planos junto a action set (la forma que espera el addon).
it('writes the settings with action set and returns the resolved template', async () => {
  rpc.mockResolvedValueOnce({ codigo: 'A1', nombre: 'Carta editorial', familia: 'A', tokens: { acento: '#7A2E2A' } })
  await expect(gateway('set', SETTINGS)).resolves.toMatchObject({ codigo: 'A1' })
  expect(rpc).toHaveBeenCalledWith('/waiter/admin/menu_settings', { action: 'set', plantilla: 'A1', paleta: { acento: '#7A2E2A' }, tipografia: { display: 'Fraunces' } })
})

// Falla si verify pierde el token o el inicio, no permite consultar el resultado, o mantiene la espera especial de A.
it('inicia y consulta la verificación por la pasarela con la espera normal', async () => {
  const pending = { borrador: 'token-publico', estado: 'en_curso', ok: null, inicio: '2026-09-26T15:00:00Z', siguiente: 'Vuelve a consultar.' }
  const result = { borrador: 'token-publico', estado: 'ok', ok: true, problemas: [], siguiente: 'Guardar con aprobación.' }
  rpc.mockResolvedValueOnce(pending).mockResolvedValueOnce(result)
  await expect(gateway('verify', { borrador: 'token-publico' })).resolves.toEqual(pending)
  await expect(gateway('verify', { borrador: 'token-publico' })).resolves.toEqual(result)
  expect(rpc).toHaveBeenNthCalledWith(1, '/waiter/admin/menu_settings', { action: 'verify', borrador: 'token-publico' })
  expect(rpc).toHaveBeenNthCalledWith(2, '/waiter/admin/menu_settings', { action: 'verify', borrador: 'token-publico' })
})

// Falla si set descarta el borrador que acredita la verificación de los ajustes que se publican.
it('reenvía el borrador al guardar los ajustes', async () => {
  rpc.mockResolvedValueOnce({ codigo: 'S1' })
  await gateway('set', { ...SETTINGS, borrador: 'token-publico' })
  expect(rpc).toHaveBeenCalledWith('/waiter/admin/menu_settings', { action: 'set', ...SETTINGS, borrador: 'token-publico' })
})

// Falla si el catálogo se pide a otra ruta, si una barra final duplica el separador o si un HTTP de error se devuelve como catálogo.
it('fetches the public catalog from experience and rejects HTTP errors', async () => {
  const f = globalThis.fetch as jest.Mock
  const catalog = { familias: { A: 'Alta cocina' }, plantillas: [] }
  f.mockResolvedValueOnce({ ok: true, status: 200, json: async () => catalog })
  await expect(listTemplates('http://192.168.56.10:8001/')).resolves.toEqual(catalog)
  expect(f).toHaveBeenCalledWith('http://192.168.56.10:8001/api/v1/plantillas/')
  f.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
  await expect(listTemplates('http://192.168.56.10:8001')).rejects.toThrow('HTTP 503')
})

// Falla si previsualizar evita la autorización del addon o manda el tema crudo en la URL pública.
it('prepara el borrador en la pasarela y construye un enlace solo con el token', async () => {
  rpc.mockResolvedValueOnce({ borrador: 'token-lectura', caduca: '2026-09-25T01:00:00Z' })
  await expect(gateway('preview', SETTINGS)).resolves.toMatchObject({ borrador: 'token-lectura' })
  expect(rpc).toHaveBeenCalledWith('/waiter/admin/menu_settings', { action: 'preview', ...SETTINGS })
  const url = previewUrl('http://diner.test/', 'burger-house', 'poblado', 'token-lectura')
  expect(url).toBe('http://diner.test/burger-house/poblado/carta?borrador=token-lectura')
  expect(url).not.toContain('paleta')
  expect(url).not.toContain('vista_previa')
})

// Falla si el enlace al sistema de diseño pierde el borrador o codifica ajustes en la URL.
it('enlaza la página viva del sistema de diseño con o sin borrador', () => {
  expect(designSystemUrl('http://diner.test/', 'burger-house', 'poblado')).toBe('http://diner.test/burger-house/poblado/design-system')
  expect(designSystemUrl('http://diner.test', 'burger-house', 'poblado', 'tok en')).toBe('http://diner.test/burger-house/poblado/design-system?borrador=tok%20en')
})
