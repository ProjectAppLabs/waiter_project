import { expect, test } from '@playwright/test'

const VENUE = '/burger-house/poblado/'

// @flow: template-demo-payment @outcome: success
// Falla si pagar omite confirmar, pierde el descuento o reemplaza el monto autorizado con el del navegador.
test('demo signup, discount and payment use the confirmed server amount', async ({ page }) => {
  const opened = await page.request.post('/api/v1/sesiones/', { data: { restaurante: 'burger-house', sede: 'poblado' } })
  expect(opened.ok()).toBeTruthy()
  const { sesion } = await opened.json()
  const entry = await (await page.request.get(`/api/v1${VENUE}`)).json()
  const dish = entry.carta.categorias.flatMap((c: { productos: { id: number; nombre: string }[] }) => c.productos).find((p: { nombre: string }) => p.nombre === 'Limonada de Coco')
  const account = await page.request.post('/api/v1/cuenta/registro/', { data: { nombre: 'Prueba H', correo: `faseh-${Date.now()}@example.test`, aceptaDatos: true } })
  expect(account.status()).toBe(201)
  const verified = await page.request.post('/api/v1/cuenta/verificar/', { data: { id: (await account.json()).id, codigo: '123456' } })
  expect(verified.ok()).toBeTruthy()
  await page.request.post(`/api/v1/sesiones/${sesion.id}/lineas/`, { data: { producto_id: dish.id } })
  await page.goto(`${VENUE}pago/`)
  const confirmed = page.waitForResponse((r) => r.url().endsWith('/confirmar/') && r.request().method() === 'POST')
  const paid = page.waitForResponse((r) => r.url().endsWith('/pago/simulado/'))
  await page.getByRole('button', { name: /^Pagar \$ / }).click()
  const order = await (await confirmed).json()
  const payment = await (await paid).json()
  expect(payment.monto).toBe(order.total)
  expect(order.cuenta.descuento.aplicado).toBe(true)
  await expect(page.getByText('Demo · sin cobro real').first()).toBeVisible()
  await expect(page.getByText(/quedó pagado/i)).toBeVisible()
})

// @flow: dark-template-dish @outcome: readable
// Falla si las pantallas genéricas conservan superficies claras bajo la tinta de una piel oscura.
test('dark preview gives the dish fields and quantity controls the active surface', async ({ page }) => {
  const entry = await (await page.request.get(`/api/v1${VENUE}`)).json()
  const dish = entry.carta.categorias[0].productos[0]
  const preview = Buffer.from(JSON.stringify({ plantilla: 'B4' })).toString('base64url')
  await page.goto(`${VENUE}plato/${dish.id}/?vista_previa=${preview}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(dish.nombre)
  await expect(page.getByText(/Vista previa.*B4/)).toBeVisible()
  const field = page.getByLabel(/Nota para la cocina/)
  await expect.poll(() => field.evaluate((node) => {
    const css = getComputedStyle(node)
    const main = getComputedStyle(document.querySelector('main')!)
    const probe = document.createElement('span')
    probe.style.color = main.getPropertyValue('--t-superficie')
    document.body.appendChild(probe)
    const surface = getComputedStyle(probe).color
    probe.remove()
    return css.backgroundColor === surface
  })).toBe(true)
  await page.screenshot({ path: '/tmp/fase-h-plato-oscuro.png', fullPage: true })
})
