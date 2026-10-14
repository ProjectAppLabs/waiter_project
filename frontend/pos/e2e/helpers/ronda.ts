import { expect, type Locator, type Page } from '@playwright/test'

export const QA_ORG = 'qa-x0'
const QA_USER = { login: 'operador.qa', password: 'Waiter-X0-QA-2026!' }
const RESTAURANT_NAME = 'Local QA'
const PRODUCT_NAME = 'Hamburguesa QA'
const TOTAL = 38_900

export interface QaOrder {
  id: number
  number: string
  total: number
  state: string
}

type ApiInit = { method?: string; data?: unknown }
type FixtureRestaurant = { id: string; name: string }
type FixtureProduct = { id: number; name: string; final_price: number; sold_out: boolean }
type FixtureSource = { restaurantId: number; productId: number }

// Las fixtures usan la API sólo para preparar una cuenta aislada; la navegación y las operaciones comprobadas ocurren en la UI.
export async function qaApi<T>(page: Page, path: string, init: ApiInit = {}): Promise<T> {
  return page.evaluate(async ([path, init]) => {
    const response = await fetch(`/experience/api/pos/v1/${path}`, {
      method: init.method ?? 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Waiter-Org': 'qa-x0' },
      body: init.data === undefined ? undefined : JSON.stringify(init.data),
    })
    const body = await response.text()
    if (!response.ok) throw new Error(`${response.status} ${path}: ${body.slice(0, 300)}`)
    return body ? JSON.parse(body) : null
  }, [path, init] as const) as Promise<T>
}

// El acceso pasa por login y selección visible de sede; la fixture conserva esa sesión real y cada prueba abre un contexto independiente.
export async function signInAsQaOperator(page: Page) {
  await page.goto('/login')
  const submit = page.getByRole('button', { name: 'Entrar', exact: true })
  await expect(async () => {
    await page.getByLabel('Usuario o correo', { exact: true }).fill(QA_USER.login)
    await page.getByLabel('Contraseña', { exact: true }).fill(QA_USER.password)
    await expect(submit).toBeEnabled({ timeout: 1_000 })
  }).toPass({ timeout: 60_000 })
  await submit.click()
  await expect(page).toHaveURL(/\/organizacion$/, { timeout: 60_000 })

  const organizationNav = page.getByRole('navigation', { name: 'Consola de la organización', exact: true })
  const openMenu = page.getByRole('button', { name: 'Abrir menú', exact: true })
  if (await openMenu.isVisible()) await openMenu.click()
  const restaurantsLink = organizationNav.getByRole('link', { name: 'Restaurantes', exact: true })
  await restaurantsLink.click()
  await expect(page).toHaveURL(/\/organizacion\/restaurantes$/)
  const restaurants = page.getByRole('list', { name: 'Restaurantes', exact: true })
  const localQa = restaurants.getByRole('listitem').filter({ hasText: RESTAURANT_NAME })
  await expect(localQa.getByRole('heading', { name: RESTAURANT_NAME, exact: true })).toHaveText(RESTAURANT_NAME)
  await localQa.getByRole('button', { name: 'Entrar al POS', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

function fixtureName(kind: 'Pago' | 'Historial', viewport: string) {
  return `${kind} QA ${viewport} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Los identificadores se descubren en el contrato real de la organización aislada: así la fixture no depende del orden de inserción de MySQL.
async function discoverFixtureSource(page: Page): Promise<FixtureSource> {
  const session = await qaApi<{ restaurants: FixtureRestaurant[] }>(page, 'auth/me')
  const restaurant = session.restaurants.find((candidate) => candidate.name === RESTAURANT_NAME)
  if (!restaurant) throw new Error(`qa-x0 no expone la sede fixture ${RESTAURANT_NAME}.`)
  const restaurantId = Number(restaurant.id)
  if (!Number.isInteger(restaurantId)) throw new Error(`La sede fixture ${RESTAURANT_NAME} no tiene id numérico.`)

  const catalog = await qaApi<{ products: FixtureProduct[] }>(page, `catalog?restaurant_id=${restaurantId}`)
  const product = catalog.products.find((candidate) => candidate.name === PRODUCT_NAME)
  if (!product || product.sold_out) throw new Error(`qa-x0 no expone el plato disponible ${PRODUCT_NAME}.`)
  if (product.final_price !== TOTAL) throw new Error(`${PRODUCT_NAME} debe costar ${TOTAL}; cuesta ${product.final_price}.`)
  return { restaurantId, productId: product.id }
}

async function createOrder(page: Page, kind: 'Pago' | 'Historial', viewport: string): Promise<QaOrder & { customerName: string }> {
  const source = await discoverFixtureSource(page)
  const open = await qaApi<{ shift: { id: number } | null }>(page, `shifts/open?restaurant_id=${source.restaurantId}`)
  if (!open.shift) throw new Error('La caja aislada de qa-x0 debe estar abierta antes de crear la fixture.')
  const customerName = fixtureName(kind, viewport)
  const result = await qaApi<{ order: QaOrder }>(page, 'orders', {
    method: 'POST',
    data: {
      restaurant_id: source.restaurantId,
      uuid: crypto.randomUUID(),
      service: 'takeout',
      customer_name: customerName,
      fire: false,
      lines: [{ uuid: crypto.randomUUID(), product_id: source.productId, qty: 1 }],
    },
  })
  if (result.order.total !== TOTAL) throw new Error(`La fixture debe totalizar ${TOTAL}; recibió ${result.order.total}.`)
  if (result.order.state !== 'draft') throw new Error(`La fixture nueva debe quedar pendiente; quedó ${result.order.state}.`)
  return { ...result.order, customerName }
}

export async function createPendingCheckout(page: Page, viewport: string) {
  return createOrder(page, 'Pago', viewport)
}

export async function createPaidHistory(page: Page, viewport: string) {
  const order = await createOrder(page, 'Historial', viewport)
  const source = await discoverFixtureSource(page)
  const methods = await qaApi<{ methods: { id: number; type: string }[] }>(page, `payment-methods?restaurant_id=${source.restaurantId}`)
  const cash = methods.methods.find((method) => method.type === 'cash')
  if (!cash) throw new Error('La fixture aislada de qa-x0 no tiene un medio de efectivo.')
  await qaApi(page, `orders/${order.id}/payments`, {
    method: 'POST', data: { method_id: cash.id, amount: TOTAL, request_key: `ronda-${crypto.randomUUID()}` },
  })
  const paid = await qaApi<{ order: QaOrder }>(page, `orders/${order.id}/pay`, { method: 'POST' })
  if (paid.order.state !== 'paid') throw new Error(`La fixture de historial debía quedar paid; quedó ${paid.order.state}.`)
  return { ...paid.order, customerName: order.customerName }
}

export async function orderById(page: Page, id: number) {
  return qaApi<{ order: QaOrder }>(page, `orders/${id}`)
}

export type Geometry = {
  width: number
  height: number
  fontSize: number
  inViewport: boolean
  clippingAncestors: string[]
}

// Mide el control ya desplazado al viewport y revisa cada ancestro que puede recortarlo; scrollWidth por sí solo no detecta modales estrechos.
export async function expectReachable<T extends HTMLElement = HTMLElement>(locator: Locator, name: string): Promise<Geometry> {
  const geometry = await locator.evaluate<Geometry, undefined, T>((element) => {
    element.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' })
    const target = element
    const rect = target.getBoundingClientRect()
    const clippingAncestors: string[] = []
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      const bounds = parent.getBoundingClientRect()
      const clipsX = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)
        && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)
      const clipsY = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)
        && (rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)
      if (clipsX || clipsY) clippingAncestors.push(parent.tagName)
    }
    return {
      width: rect.width,
      height: rect.height,
      fontSize: Number.parseFloat(getComputedStyle(target).fontSize),
      inViewport: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
      clippingAncestors,
    }
  }, undefined)
  expect(geometry.width, `${name} debe tener ancho`).toBeGreaterThan(0)
  expect(geometry.height, `${name} debe tener alto`).toBeGreaterThan(0)
  expect(geometry.inViewport, `${name} debe quedar dentro del viewport`).toBe(true)
  expect(geometry.clippingAncestors, `${name} no puede quedar recortado por un ancestro`).toEqual([])
  return geometry
}

export async function expectNoHorizontalDocumentOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
  expect(dimensions.scrollWidth, 'el documento no debe desbordar horizontalmente').toBeLessThanOrEqual(dimensions.viewport)
}
