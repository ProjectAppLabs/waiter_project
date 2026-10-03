import { USERS, api, expect, signIn, signInPlatform, test } from './helpers/waiter'

async function platform<T>(page: import('@playwright/test').Page, path: string, init: { method?: string; data?: unknown } = {}): Promise<T> {
  return page.evaluate(async ([path, init]) => {
    const r = await fetch(`/experience/api/platform/v1/${path}`, { method: init.method || 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: init.data === undefined ? undefined : JSON.stringify(init.data) })
    const body = await r.text()
    if (!r.ok) throw new Error(`${r.status} ${path} ${body.slice(0, 300)}`)
    return JSON.parse(body)
  }, [path, init] as const) as Promise<T>
}
type Credits = { balances: { module: string; unit: string; balance: number }[] }
const pedidos = (c: Credits) => c.balances.find((b) => b.unit === 'pedido_asistente')?.balance ?? 0

// Falla si el dueño no puede pedir una recarga desde Consumo, si la cuenta de recarga no llega a Cobros de ProjectApp,
// si el saldo sube antes de registrar el pago, o si no sube al registrarlo (plan X).
test('el dueño recarga y el saldo llega al registrar el pago', async ({ page, browser }) => {
  const admin = await (await browser.newContext()).newPage()
  await signInPlatform(admin)
  // Burger House con el plan Inicial de WhatsApp, para que tenga paquetes de recarga.
  const org = (await platform<{ organization: { pricing?: Record<string, unknown> } }>(admin, 'organizations/burger-house')).organization
  await platform(admin, 'organizations/burger-house', { method: 'PATCH', data: { pricing: { ...(org.pricing ?? { mode: 'personalizado' }), whatsapp_plan: 'inicial' } } })
  const before = pedidos(await platform<Credits>(admin, 'organizations/burger-house/credits'))
  try {

  await signIn(page, USERS.owner)
  await page.waitForURL('**/organizacion')
  await page.goto('/organizacion/consumo')
  await page.getByRole('button', { name: 'Recargar' }).click()
  await page.getByRole('dialog', { name: 'Recargar' }).getByRole('button', { name: /100 pedidos/ }).click()
  await expect(page.getByRole('status')).toContainText('El saldo se suma cuando ProjectApp registre el pago')
  const recharge = (await api<{ recharges: { id: number; state: string }[] }>(page, 'recharges')).recharges.find((r) => r.state === 'pending')!
  expect(pedidos(await platform<Credits>(admin, 'organizations/burger-house/credits'))).toBe(before)

  await admin.goto('/plataforma/cobros')
  await expect(admin.getByText('Recarga').first()).toBeVisible()
  await platform(admin, `charges/${recharge.id}/pay`, { method: 'POST', data: { method: 'transferencia', reference: `e2e-${Date.now()}`, notes: '' } })
  expect(pedidos(await platform<Credits>(admin, 'organizations/burger-house/credits'))).toBe(before + 100)
  await page.reload()
  await expect(page.getByRole('list', { name: 'Tus recargas' })).toContainText('Pagada')
  } finally {
    // Burger House vuelve a sus precios de antes de la prueba.
    if (org.pricing) await platform(admin, 'organizations/burger-house', { method: 'PATCH', data: { pricing: org.pricing } })
    await admin.context().close()
  }
})
