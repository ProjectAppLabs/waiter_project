import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import { setPreviewReadOnly } from '@/lib/domain/preview'
import { useDinerStore } from '../dinerStore'
import * as api from '@/lib/services/api'
import type { Entry } from '@/lib/types'

jest.mock('@/lib/services/api', () => ({ ...jest.requireActual('@/lib/services/api'),
  getEntry: jest.fn(), getThemeDraft: jest.fn(), openSession: jest.fn(), addLine: jest.fn(), getCart: jest.fn() }))
const keys = { rest: 'burger-house', venue: 'poblado', token: null }
const entry = { contexto: { plantilla: DEFAULT_TEMPLATE }, carta: { categorias: [] } } as unknown as Entry
const preview = { ...DEFAULT_TEMPLATE, tokens: { ...DEFAULT_TEMPLATE.tokens, acento: '#234567' } }
const expires = new Date(Date.now() + 1_800_000).toISOString()
beforeEach(() => {
  jest.clearAllMocks()
  useDinerStore.setState(useDinerStore.getInitialState(), true)
  setPreviewReadOnly(false)
  jest.mocked(api.getEntry).mockResolvedValue(entry)
  jest.mocked(api.getThemeDraft).mockResolvedValue({ plantilla: preview, caduca: expires })
})
afterEach(() => setPreviewReadOnly(false))

// Falla si cargar o navegar el borrador abre una sesión, pierde el tema o contamina el menú publicado al salir.
it('mantiene la vista previa al cambiar de mesa y la retira explícitamente al salir', async () => {
  await useDinerStore.getState().load(keys, 'draft-1')
  expect(useDinerStore.getState()).toMatchObject({ template: preview, draftToken: 'draft-1', draftExpires: expires })
  await useDinerStore.getState().refreshCart()
  await useDinerStore.getState().add(1, 1, '')
  expect(api.openSession).not.toHaveBeenCalled()
  expect(api.addLine).not.toHaveBeenCalled()
  await useDinerStore.getState().load({ ...keys, token: 'MESA' }, 'draft-1')
  expect(useDinerStore.getState().template).toEqual(preview)
  await useDinerStore.getState().load(keys)
  expect(useDinerStore.getState()).toMatchObject({ template: DEFAULT_TEMPLATE, preview: null, draftToken: null })
})

// Falla si un token inválido o caducado deja acciones reales disponibles mediante una sesión que ya existía.
it('bloquea operaciones desde que comienza la carga y también si el borrador no responde', async () => {
  useDinerStore.setState({ keys, session: { id: 'existente' } as never })
  jest.mocked(api.getThemeDraft).mockRejectedValue(new api.ApiError('El borrador caducó.', 404))
  const loading = useDinerStore.getState().load(keys, 'caducado')
  expect(await useDinerStore.getState().ensureSession()).toBeNull()
  await loading
  expect(useDinerStore.getState()).toMatchObject({ entry: null, preview: null, draftToken: 'caducado', error: 'El borrador caducó.' })
  await useDinerStore.getState().refreshCart()
  expect(api.getCart).not.toHaveBeenCalled()
  expect(api.openSession).not.toHaveBeenCalled()
})

// Falla si una respuesta lenta de otra sede o borrador pisa el último tema elegido.
it('ignora la respuesta de una carga anterior', async () => {
  let finish!: (value: {plantilla: typeof preview; caduca: string}) => void
  jest.mocked(api.getThemeDraft).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const first = useDinerStore.getState().load(keys, 'viejo')
  await useDinerStore.getState().load({ ...keys, venue: 'otra' }, 'nuevo')
  finish({ plantilla: DEFAULT_TEMPLATE, caduca: expires })
  await first
  expect(useDinerStore.getState()).toMatchObject({ keys: { ...keys, venue: 'otra' }, draftToken: 'nuevo', template: preview })
})
