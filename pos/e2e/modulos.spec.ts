import { USERS, api, expect, restaurantId, signIn, signInPlatform, test } from './helpers/waiter'

// Llama a la API de la plataforma desde una página con la sesión de ProjectApp.
async function platform<T>(page: import('@playwright/test').Page, path: string, init: { method?: string; data?: unknown } = {}): Promise<T> {
  return page.evaluate(async ([path, init]) => {
    const r = await fetch(`/experience/api/platform/v1/${path}`, { method: init.method || 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: init.data === undefined ? undefined : JSON.stringify(init.data) })
    const body = await r.text()
    if (!r.ok) throw new Error(`${r.status} ${path} ${body.slice(0, 300)}`)
    return JSON.parse(body)
  }, [path, init] as const) as Promise<T>
}

// Falla si apagar Inventario para un local desde la consola de ProjectApp no lo saca de la barra del POS de ese local,
// si entrar por la dirección no explica que no está en el plan, si el servidor sigue respondiendo sus datos, o si al
// quitar la excepción no vuelve todo como estaba (plan W).
test('ProjectApp apaga Inventario en un local y el POS lo refleja', async ({ page, browser }) => {
  await signIn(page, USERS.manager)
  await page.waitForURL(/dashboard|caja|salon/)
  const rid = await restaurantId(page)
  const admin = await (await browser.newContext()).newPage()
  await signInPlatform(admin)
  try {
    await platform(admin, 'organizations/burger-house/modules', { method: 'PATCH', data: { key: 'inventario', active: false, restaurant_id: rid } })
    await page.goto('/dashboard')
    await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Pedidos' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Inventario' })).toHaveCount(0)
    await page.goto('/inventario')
    await expect(page.getByRole('alert').filter({ hasText: 'Esta función no está activa en tu plan' })).toContainText('Inventario')
    await expect(api(page, `inventory?restaurant_id=${rid}`)).rejects.toThrow(/403 .*module_inactive/)
    // En la ficha del cliente se ve la excepción del local.
    await admin.goto('/plataforma/clientes/burger-house')
    await expect(admin.getByRole('table', { name: 'Módulos por local' }).getByRole('row').filter({ hasText: 'Inventario' })).toContainText('Excepción del local')
  } finally {
    await platform(admin, 'organizations/burger-house/modules', { method: 'PATCH', data: { key: 'inventario', restaurant_id: rid, clear: true } })
    await admin.context().close()
  }
  await page.goto('/inventario')
  await expect(page.getByRole('alert').filter({ hasText: 'Esta función no está activa en tu plan' })).toHaveCount(0)
})
