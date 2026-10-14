import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import { chromium, expect, test as base, type Browser, type Page } from '@playwright/test'

import { nextCode, saveSecret, savedSecret } from './totp'

// Pruebas de punta a punta sobre el sistema propio (plan T): Burger House migrado y la consola de ProjectApp. Los datos
// que cada prueba necesita se preparan por la API del POS desde el propio navegador (cookie y organización de la
// sesión); lo que se verifica es lo que ve la persona en pantalla.

export const BURGER = { org: 'burger-house', base: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000' }
export const DINER = process.env.PLAYWRIGHT_DINER_URL || 'http://localhost:3001'
export const USERS = {
  owner: { login: 'admin', password: 'admin' },
  manager: { login: 'laura.encargada', password: 'waiter-demo-2026' },
  cashier: { login: 'carlos.cajero', password: 'waiter-demo-2026' },
  waiter: { login: 'sofia.mesera', password: 'waiter-demo-2026' },
  platform: { login: 'ana.projectapp', password: 'Plataforma-2026' },
}

// En esta máquina el navegador vive fuera de WSL y se usa por CDP (PLAYWRIGHT_CDP=http://127.0.0.1:9333). Sin esa
// variable, Playwright lanza su propio Chromium.
export const test = base.extend<object, { browser: Browser }>({
  browser: [async ({ playwright }, use) => {
    void playwright
    const cdp = process.env.PLAYWRIGHT_CDP
    const browser = cdp ? await chromium.connectOverCDP(cdp) : await chromium.launch()
    await use(browser)
    await browser.close()
  }, { scope: 'worker' }],
})
export { expect }

// Entrar con usuario y contraseña. En `next dev` la hidratación puede llegar después del primer relleno y React vacía
// los campos: se rellena de nuevo hasta que «Entrar» se habilita.
export async function signIn(page: Page, user: { login: string; password: string }, path = '/login') {
  await page.goto(path)
  const submit = page.getByRole('button', { name: 'Entrar' })
  await expect(async () => {
    await page.getByLabel('Usuario o correo').fill(user.login)
    await page.getByLabel('Contraseña', { exact: true }).fill(user.password)
    await expect(submit).toBeEnabled({ timeout: 1_000 })
  }).toPass({ timeout: 60_000 })
  await submit.click()
}

// Plan Y3: la persona de ProjectApp entra con doble factor. La primera vez lo activa desde Seguridad (la consola no deja
// abrir otra cosa) y guarda el secreto; después escribe el código de la app. Si el servidor tiene un doble factor cuyo
// secreto no está guardado (base nueva u otra máquina), se le quita desde Django para volver a activarlo.
export async function signInPlatform(page: Page) {
  await signIn(page, USERS.platform)
  const step = page.getByRole('heading', { name: 'Código de verificación' })
  await expect(step.or(page.getByRole('navigation', { name: 'Consola de ProjectApp' }))).toBeVisible({ timeout: 30_000 })
  if (await step.isVisible()) {
    if (!savedSecret()) {
      execFileSync(join(__dirname, '..', '..', '..', 'experience', 'venv', 'bin', 'python'), ['manage.py', 'shell', '-c',
        "from tenancy.models import PlatformUser; PlatformUser.objects.filter(username='ana.projectapp').update(two_factor=False, totp_secret='', totp_pending='', recovery_hashes=[])"],
      { cwd: join(__dirname, '..', '..', '..', 'experience') })
      return signInPlatform(page)
    }
    await page.getByLabel('Código de verificación').fill(await nextCode())
    await page.getByRole('button', { name: 'Verificar y entrar' }).click()
  }
  await expect(page.getByRole('navigation', { name: 'Consola de ProjectApp' })).toBeVisible()
  if (page.url().endsWith('/plataforma/seguridad') && await page.getByRole('button', { name: 'Activar doble factor' }).isVisible()) {
    await page.getByRole('button', { name: 'Activar doble factor' }).click()
    const secret = (await page.locator('code').first().textContent())?.trim() ?? ''
    saveSecret(secret)
    await page.getByLabel('Código de la app').fill(await nextCode())
    await page.getByRole('button', { name: 'Activar', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Códigos de respaldo' })).toBeVisible()
    await page.getByRole('button', { name: 'Ya los guardé' }).click()
    await page.goto('/plataforma')
  }
  await page.waitForURL(/\/plataforma$/)
}

// Llamada a la API del POS con la sesión del navegador.
export async function api<T = unknown>(page: Page, path: string, init: { method?: string; data?: unknown } = {}, org = BURGER.org): Promise<T> {
  return page.evaluate(async ([path, init, org]) => {
    const r = await fetch(`/experience/api/pos/v1/${path}`, {
      method: init.method || 'GET', credentials: 'include', headers: { 'X-Waiter-Org': org, 'Content-Type': 'application/json' },
      body: init.data === undefined ? undefined : JSON.stringify(init.data),
    })
    const body = await r.text()
    if (!r.ok) throw new Error(`${r.status} ${path} ${body.slice(0, 300)}`)
    return body ? JSON.parse(body) : null
  }, [path, init, org] as const) as Promise<T>
}

interface Me { restaurants: { id: string; name: string }[] }
interface Floor { id: number; tables: { id: number; number: number; token: string; active: boolean }[] }
interface Menu { products: { id: number; name: string; final_price: number; sold_out?: boolean }[] }
export interface Order { id: number; number: string; total: number; lines: { id: number }[]; courses: { id: number }[]; table_number: number | null }

export const restaurantId = async (page: Page) => Number((await api<Me>(page, 'auth/me')).restaurants[0].id)

export async function ensureOpenShift(page: Page, rid: number) {
  const open = await api<{ shift: { id: number } | null }>(page, `shifts/open?restaurant_id=${rid}`)
  if (open.shift) return open.shift.id
  return (await api<{ shift: { id: number } }>(page, 'shifts', { method: 'POST', data: { restaurant_id: rid, opening_cash: 100000, notes: 'Prueba e2e' } })).shift.id
}

// Una mesa sin pedido abierto y un plato disponible de la carta de la sede.
export async function freeTableAndDish(page: Page, rid: number) {
  const [floors, open, menu] = await Promise.all([
    api<{ floors: Floor[] }>(page, `floors?restaurant_id=${rid}`),
    api<{ orders: { table_id: number | null }[] }>(page, `orders?restaurant_id=${rid}&state=open`),
    api<Menu>(page, `catalog?restaurant_id=${rid}`),
  ])
  const busy = new Set(open.orders.map((o) => o.table_id))
  const table = floors.floors.flatMap((f) => f.tables).find((t) => t.active && !busy.has(t.id))
  const dish = menu.products.find((p) => !p.sold_out)
  if (!table || !dish) throw new Error('No hay mesa libre o plato disponible para la prueba.')
  return { table, dish }
}

export async function createOrder(page: Page, rid: number, note = 'Prueba e2e') {
  const { table, dish } = await freeTableAndDish(page, rid)
  const order = (await api<{ order: Order }>(page, 'orders', { method: 'POST', data: {
    restaurant_id: rid, uuid: crypto.randomUUID(), service: 'dine_in', table_id: table.id, guests: 2,
    lines: [{ uuid: crypto.randomUUID(), product_id: dish.id, qty: 1, note }], fire: true,
  } })).order
  return { order, table, dish }
}

// Cobra en efectivo lo que quede abierto de la sede, para que las pruebas no dejen cuentas que bloqueen el cierre.
export async function settleOpenOrders(page: Page, rid: number) {
  const open = await api<{ orders: (Order & { paid: number })[] }>(page, `orders?restaurant_id=${rid}&state=open`)
  if (!open.orders.length) return
  const cash = (await api<{ methods: { id: number; type: string }[] }>(page, `payment-methods?restaurant_id=${rid}`)).methods.find((m) => m.type === 'cash')!
  for (const o of open.orders) {
    for (const c of o.courses) await api(page, `courses/${c.id}/ready`, { method: 'POST' }).catch(() => undefined)
    if (o.total > o.paid) await api(page, `orders/${o.id}/payments`, { method: 'POST', data: { method_id: cash.id, amount: o.total - o.paid, request_key: `e2e-${crypto.randomUUID()}` } })
    await api(page, `orders/${o.id}/pay`, { method: 'POST' })
  }
}
