import { http, ApiError } from '@/lib/services/api'
import { PREVIEW_MESSAGE, setPreviewReadOnly } from '../preview'
import { pathFor } from '../route'

afterEach(() => { setPreviewReadOnly(false); window.history.replaceState({}, '', '/') })

// Falla si los enlaces internos pierden el token al navegar o si una ruta publicada lo hereda sin pedirlo.
it('conserva el borrador en carta, ficha y cuenta sin modificar las rutas normales', () => {
  expect(pathFor('demo', 'salon', null, 'plato', 4, 'token')).toBe('/demo/salon/plato/4?borrador=token')
  expect(pathFor('demo', 'salon', 'mesa', 'cuenta/registro', undefined, 'token')).toBe('/demo/salon/t/mesa/cuenta/registro?borrador=token')
  expect(pathFor('demo', 'salon', null, 'carta')).toBe('/demo/salon/carta')
})

// Falla si formularios, chat o pagos pueden escribir directamente por HTTP durante una vista previa, incluso antes de cargarla.
it.each(['estado', 'url'])('rechaza escrituras antes de llegar a la red: %s', async mode => {
  const adapter = jest.fn(async config => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config }))
  if (mode === 'estado') setPreviewReadOnly(true)
  else window.history.replaceState({}, '', '/demo/salon/carta?borrador=token')
  for (const method of ['post', 'put', 'patch', 'delete']) {
    await expect(http.request({ method, url: '/api/v1/prueba/', adapter })).rejects.toEqual(new ApiError(PREVIEW_MESSAGE, 403))
  }
  expect(adapter).not.toHaveBeenCalled()
  await http.get('/api/v1/demo/salon/borradores/token/', { adapter })
  expect(adapter).toHaveBeenCalledTimes(1)
})
