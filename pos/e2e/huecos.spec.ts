import type { Page } from '@playwright/test'

import { BURGER, USERS, api, expect, signIn, signInPlatform, test } from './helpers/waiter'

// Un CSV del servidor tal cual llega (bytes): para ver el BOM y el separador que necesita Excel.
async function csv(page: Page, path: string) {
  return page.evaluate(async ([path, org]) => {
    const r = await fetch(`/experience/api/pos/v1/${path}`, { credentials: 'include', headers: { 'X-Waiter-Org': org } })
    const bytes = new Uint8Array(await r.arrayBuffer())
    return { status: r.status, disposition: r.headers.get('content-disposition') ?? '', bom: Array.from(bytes.slice(0, 3)), text: new TextDecoder().decode(bytes.slice(3)) }
  }, [path, BURGER.org] as const)
}
const platform = <T>(page: Page, path: string, init: { method?: string; data?: unknown } = {}) => page.evaluate(async ([path, init]) => {
  const r = await fetch(`/experience/api/platform/v1/${path}`, { method: init.method || 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: init.data === undefined ? undefined : JSON.stringify(init.data) })
  const body = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${path} ${body.slice(0, 300)}`)
  return body ? JSON.parse(body) : null
}, [path, init] as const) as Promise<T>
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

// Falla si los CSV al detalle no salen del servidor con BOM, «;» y nombre con el periodo, si la consola del dueño no
// ofrece exportar, o si un mesero puede descargarlos (plan Y1).
test('exportes CSV al detalle para el dueño, no para el mesero', async ({ page, browser }) => {
  await signIn(page, USERS.owner)
  await page.waitForURL(/\/organizacion/)
  await page.goto('/organizacion/clientes')
  await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeVisible()
  for (const kind of ['ventas', 'pagos', 'inventario', 'movimientos', 'clientes', 'historial', 'equipo']) {
    const r = await csv(page, `exports/${kind}?from=${daysAgo(30)}&to=${today()}`)
    expect(r.status, kind).toBe(200)
    expect(r.bom, kind).toEqual([0xef, 0xbb, 0xbf])
    expect(r.text.split(/\r?\n/)[0], kind).toContain(';')
    expect(r.disposition, kind).toMatch(new RegExp(`attachment; filename="${kind}-`))
  }
  expect((await csv(page, `exports/ventas?from=2024-01-01&to=${today()}`)).status).toBe(400)
  const waiter = await (await browser.newContext()).newPage()
  await signIn(waiter, USERS.waiter)
  await waiter.waitForURL(/salon|caja|pedidos/)
  expect((await csv(waiter, `exports/ventas?from=${daysAgo(7)}&to=${today()}`)).status).toBe(403)
  await waiter.context().close()
})

// Falla si un cambio de precio no queda en el Historial de cambios con quién lo hizo y el antes y después (plan Y2).
test('el cambio de precio queda en el historial de cambios', async ({ page }) => {
  await signIn(page, USERS.owner)
  await page.waitForURL(/\/organizacion/)
  const { products } = await api<{ products: { id: number; name: string; price: number }[] }>(page, 'products?kind=dish&q=')
  const dish = products[0]
  await api(page, `products/${dish.id}`, { method: 'PATCH', data: { price: dish.price + 100 } })
  try {
    await page.goto('/organizacion/historial')
    await page.getByPlaceholder('Buscar en el resumen').fill(dish.name)
    const row = page.getByRole('row', { name: new RegExp(dish.name) }).first()
    await expect(row).toBeVisible()
    await row.click()
    const diff = page.getByRole('table', { name: 'Antes y después' })
    await expect(diff).toContainText(String(dish.price))
    await expect(diff).toContainText(String(dish.price + 100))
  } finally {
    await api(page, `products/${dish.id}`, { method: 'PATCH', data: { price: dish.price } })
  }
})

// Falla si ProjectApp entra sin aprobación, si el dueño no puede aprobar, si la sesión de soporte no se marca con la
// franja, si el enlace sirve dos veces o si la sesión sobrevive a la revocación (plan Y4).
test('acceso de soporte: pedir, aprobar, entrar y revocar', async ({ page, browser }) => {
  const admin = await (await browser.newContext()).newPage()
  await signInPlatform(admin)
  // Lo que quede vigente de otra corrida se revoca primero desde el dueño.
  await signIn(page, USERS.owner)
  await page.waitForURL(/\/organizacion/)
  for (const g of (await api<{ grants: { id: number; state: string }[] }>(page, 'support')).grants.filter((g) => g.state === 'vigente' || g.state === 'pedido')) await api(page, `support/${g.id}/revoke`, { method: 'POST' })
  await expect(platform(admin, 'organizations/burger-house/support/enter', { method: 'POST' })).rejects.toThrow(/40[03]/)
  await platform(admin, 'organizations/burger-house/support', { method: 'POST', data: { reason: 'Prueba e2e de soporte', hours: 2 } })
  await page.goto('/organizacion/soporte')
  const asked = page.getByRole('row', { name: /Prueba e2e de soporte/ })
  await expect(asked).toContainText('Pedido, sin aprobar')
  await asked.getByRole('button', { name: 'Aprobar' }).click()
  await expect(asked).toContainText('Vigente')
  const { url } = await platform<{ url: string }>(admin, 'organizations/burger-house/support/enter', { method: 'POST' })
  const support = await (await browser.newContext()).newPage()
  await support.goto(url)
  await support.waitForURL(/\/organizacion/)
  await expect(support.getByRole('status', { name: 'Sesión de soporte' })).toContainText('Sesión de soporte de ProjectApp')
  const again = await (await browser.newContext()).newPage()
  await again.goto(url)
  await expect(again.getByRole('alert')).toBeVisible()
  await asked.getByRole('button', { name: 'Quitar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Quitar' }).click()
  await expect(asked).toContainText('Revocado')
  await expect(api(support, 'auth/me', {}, new URL(url).hostname.split('.')[0])).rejects.toThrow(/401|403/)
  for (const p of [admin, support, again]) await p.context().close()
})

// Falla si Horas y propinas no carga el informe del periodo o el valor de la hora no se puede editar en Equipo (plan Y5).
test('horas y propinas por persona', async ({ page }) => {
  await signIn(page, USERS.owner)
  await page.waitForURL(/\/organizacion/)
  await page.getByRole('link', { name: 'Horas y propinas' }).click()
  await expect(page.getByRole('table', { name: 'Horas y propinas' }).or(page.getByText('Nadie trabajó en este periodo.'))).toBeVisible()
  await page.getByRole('link', { name: 'Equipo' }).click()
  await page.getByRole('row', { name: /^Sofía/ }).getByRole('button', { name: 'Editar' }).click()
  await expect(page.getByRole('dialog').getByLabel('Valor de la hora ($)')).toBeVisible()
})
