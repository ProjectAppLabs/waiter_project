import { DINER, USERS, api, ensureOpenShift, expect, freeTableAndDish, restaurantId, signIn, test } from './helpers/waiter'

// Falla si el QR impreso de una mesa de Burger House deja de abrir la carta tras la migración, o si un pedido del menú
// no llega al POS con la mesa (planes T5 y T6).
test('el QR de la mesa abre la carta y el pedido del comensal llega al POS', async ({ page, browser }) => {
  await signIn(page, USERS.manager)
  await page.waitForURL(/dashboard|caja|salon/)
  const rid = await restaurantId(page)
  await ensureOpenShift(page, rid)
  const { table, dish } = await freeTableAndDish(page, rid)

  const diner = await (await browser.newContext({ viewport: { width: 400, height: 860 }, isMobile: true })).newPage()
  await diner.goto(`${DINER}/burger-house/poblado/t/${table.token}`)
  await expect(diner.getByText(/Conoce tu menú|menú/i).first()).toBeVisible({ timeout: 60_000 })
  // El pedido se arma por la API del comensal, desde su propio navegador y con su cookie.
  const result = await diner.evaluate(async ([token, productId]) => {
    const post = (url: string, body: unknown) => fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())
    const session = await post('/api/v1/sesiones/', { restaurante: 'burger-house', sede: 'poblado', token })
    const sid = session.sesion.id
    await post(`/api/v1/sesiones/${sid}/lineas/`, { producto_id: productId, cantidad: 1, nota: 'e2e comensal' })
    const confirmed = await post(`/api/v1/sesiones/${sid}/confirmar/`, {})
    const paid = await post(`/api/v1/sesiones/${sid}/pago/simulado/`, { metodo: 'tarjeta' })
    return { confirmed, paid }
  }, [table.token, dish.id] as const)
  expect(result.paid.estado, JSON.stringify(result)).toBe('aprobado')
  await diner.context().close()

  const orders = await api<{ orders: { table_number: number | null; origin: string; state: string }[] }>(page, `sales/orders?restaurant_id=${rid}&limit=20`)
  expect(orders.orders.some((o) => o.table_number === table.number && o.origin === 'diner' && o.state === 'paid')).toBe(true)
})
