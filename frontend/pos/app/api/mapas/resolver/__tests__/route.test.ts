/** @jest-environment node */
import { GET } from '@/app/api/mapas/resolver/route'

const call = (url: string) => GET(new Request(`http://pos/api/mapas/resolver?url=${encodeURIComponent(url)}`))
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } })
afterEach(() => jest.restoreAllMocks())

// Falla si el enlace corto no se sigue hasta las coordenadas, o si se envía con User-Agent de navegador (Google responde
// entonces una página sin redirección).
it('follows a short link to the place point', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(redirect('https://www.google.com/maps/place/X/@6.21,-75.57,17z/data=!3d6.2088!4d-75.5675'))
  const body = await (await call('https://maps.app.goo.gl/AbC123')).json()
  expect(body).toMatchObject({ lat: 6.2088, lng: -75.5675 })
  expect(fetchMock).toHaveBeenCalledWith('https://maps.app.goo.gl/AbC123', expect.objectContaining({ redirect: 'manual' }))
  expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toBeUndefined()
})

// Falla si el servidor pide algo que no es Google Maps: ni el enlace de entrada ni un salto de la redirección.
it('never fetches outside Google Maps', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(redirect('https://evil.example/steal'))
  expect((await call('https://evil.example/maps')).status).toBe(400)
  const body = await (await call('https://maps.app.goo.gl/AbC123')).json()
  expect(body).toMatchObject({ lat: null, lng: null })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

// Falla si Google caído rompe la respuesta en vez de avisar.
it('answers 502 when Google Maps does not respond', async () => {
  jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('timeout'))
  expect((await call('https://maps.app.goo.gl/AbC123')).status).toBe(502)
})

const FTID = '0x8e44298f71698167:0xaec317a62bba82e9'
const shared = `https://www.google.com/maps?q=Restaurante+Pato+Pek%C3%ADn&ftid=${FTID}&entry=gps`
const card = (ftid: string, point: unknown) => new Response(`)]}'\n${JSON.stringify([null, null, null, null, [], null, [...Array(9).fill(null), point, ftid, 'Restaurante Pato Pekín']])}`)

// Falla si un enlace compartido desde el teléfono (nombre + ftid, sin coordenadas) no llega al punto del lugar con su
// nombre, o si se acepta una ficha que no es la del lugar pedido o que cambió de forma.
it('finds the point of a phone-shared link through the place card, and only for that place', async () => {
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(redirect(shared)).mockResolvedValueOnce(card(FTID, [null, null, 6.2148937, -75.5728958]))
  expect(await (await call('https://maps.app.goo.gl/MPBHTgcVypTrCAkF7?g_st=ipc')).json()).toMatchObject({ lat: 6.2148937, lng: -75.5728958, name: 'Restaurante Pato Pekín' })
  expect(String(fetchMock.mock.calls[1][0])).toContain(`!1s${encodeURIComponent(FTID)}`)
  fetchMock.mockResolvedValueOnce(card('0x1:0x2', [null, null, 1, 2]))
  expect(await (await call(shared)).json()).toMatchObject({ lat: null, lng: null })
  fetchMock.mockResolvedValueOnce(new Response(`)]}'\n{"otra":"forma"}`))
  expect(await (await call(shared)).json()).toMatchObject({ lat: null, lng: null })
})
