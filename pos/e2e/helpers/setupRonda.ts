import { expect, request, type FullConfig } from '@playwright/test'

// El workflow levanta backend y Next antes de Playwright. Esperamos la pantalla local sin reiniciar el servidor ni
// convertir una conexión todavía iniciando en un falso fallo del primer recorrido.
export default async function setupRonda(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL
  if (typeof baseURL !== 'string') throw new Error('La ronda necesita una URL base local.')
  const target = new URL(baseURL)
  if (target.hostname !== '127.0.0.1' || target.port !== '3117') {
    throw new Error(`La ronda sólo admite el POS local 127.0.0.1:3117; recibió ${baseURL}.`)
  }

  const api = await request.newContext({ baseURL })
  try {
    await expect.poll(async () => {
      try {
        return (await api.get('/login', { timeout: 2_000 })).status()
      } catch {
        return 0
      }
    }, { timeout: 60_000, intervals: [250, 500, 1_000] }).toBe(200)
  } finally {
    await api.dispose()
  }
}
