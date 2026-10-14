/* J4: usa exclusivamente una base de experience desechable. Confirma temas en esa base, nunca en la sede operativa. */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright-core')

async function main() {
  const backend = process.env.DRAFT_API_URL
  assert(backend && ['localhost', '127.0.0.1'].includes(new URL(backend).hostname), 'DRAFT_API_URL debe apuntar al backend local con base desechable')
  assert(process.env.DRAFT_KEY_FILE, 'Falta la clave creada en la base desechable')
  const { key } = JSON.parse(await fs.readFile(process.env.DRAFT_KEY_FILE, 'utf8'))
  const output = path.resolve(process.env.DRAFT_EVIDENCE || 'test-reports/j4/navegador')
  const diner = process.env.DINER_URL || 'http://localhost:3001'
  const venue = '/burger-house/poblado'
  await fs.mkdir(output, { recursive: true })
  const rpc = async (name, arguments_ = {}) => {
    const response = await fetch(`${backend}/mcp/`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: arguments_ } }) })
    const data = await response.json()
    assert(response.ok && data.result && !data.result.isError, JSON.stringify(data))
    return data.result.structuredContent
  }
  const current = () => rpc('leer_design_system')
  const initial = await current()
  const prepared = await rpc('preparar_tema', { tema: { fundamentos: { texto: 1.1 }, variantes: { boton: 'contorno', categorias: 'subrayado' }, distribucion: { carta: 'lista', ficha: 'heroe' } } })
  // Falla si preparar publica el tema o entrega el mismo secreto para lectura y confirmación.
  assert.deepEqual((await current()).tema, initial.tema)
  assert.notEqual(prepared.token, prepared.borrador)
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9333')
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const writes = [], errors = [], checked = []
  page.on('pageerror', error => errors.push(error.message))
  // Las lecturas usan el backend real aislado. Ningún gesto del navegador puede llegar a abrir una caja en Odoo.
  await context.route('**/api/v1/**', async route => {
    if (route.request().method() !== 'GET') {
      writes.push(route.request().url())
      return route.fulfill({ status: 409, json: { detail: 'Escritura detenida por la auditoría.' } })
    }
    const parsed = new URL(route.request().url())
    const response = await route.fetch({ url: backend + parsed.pathname + parsed.search })
    await route.fulfill({ response })
  })
  await context.addCookies([{ name: 'waiter_intro_burger-house_v1', value: '1', url: diner }])
  const capture = async name => {
    await page.waitForLoadState('networkidle')
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' })
    await page.evaluate(() => document.fonts.ready)
    // Falla si salir del borrador deja un enlace demasiado pequeño para tocarlo en el teléfono.
    const exit = await page.getByRole('link', { name: 'Abrir menú publicado', exact: true }).boundingBox()
    assert(exit && exit.width >= 44 && exit.height >= 44)
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true })
    checked.push(name)
  }
  try {
    await page.goto(`${diner}${venue}/carta?borrador=${prepared.borrador}`)
    await page.locator('main[data-ds-carta="lista"] .sm-food-card').first().waitFor()
    assert.equal(await page.locator('main').getAttribute('data-ds-boton'), 'contorno')
    await capture('carta-borrador')
    // Falla si el enlace de ficha pierde el borrador o una recarga vuelve al tema publicado.
    const dish = page.locator('.sm-food-card .sm-food-link').first()
    assert((await dish.getAttribute('href')).includes(`borrador=${prepared.borrador}`))
    await dish.click()
    await page.locator('.sm-dish-layout').waitFor()
    await page.reload()
    await page.locator('main[data-ds-ficha="heroe"] .sm-dish-layout').waitFor()
    await capture('ficha-recargada')
    await page.getByRole('button', { name: /Agregar a mi pedido/ }).click()
    // Falla si una acción de pedido o un formulario que usa HTTP directo emite escrituras durante la vista previa.
    await page.goto(`${diner}${venue}/cuenta/entrar?borrador=${prepared.borrador}`)
    await page.getByLabel('Correo electrónico').fill('auditoria@example.invalid')
    await page.getByLabel('Contraseña', { exact: true }).fill('prueba-local')
    assert(await page.getByRole('button', { name: 'Entrar', exact: true }).isDisabled())
    await capture('formulario-sin-escrituras')
    assert.deepEqual(writes, [])
    assert.deepEqual((await current()).tema, initial.tema)
    // Falla si el borrador se puede abrir en otra sede o un error activa el menú operativo silenciosamente.
    await page.goto(`${diner}/burger-house/otra/carta?borrador=${prepared.borrador}`)
    await page.getByRole('alert').filter({ hasText: 'No pudimos abrir el borrador' }).waitFor()
    await capture('sede-ajena-rechazada')
    await rpc('confirmar_cambio', { token: prepared.token })
    assert.equal((await current()).tema.distribucion.carta, 'lista')
    await page.goto(`${diner}${venue}/carta?borrador=${prepared.borrador}`)
    await page.getByRole('alert').filter({ hasText: 'ya fue aplicado' }).waitFor()
    await capture('borrador-aplicado')
    assert.deepEqual(writes, [])
    // El menú público lee la nueva plantilla desde el backend sin necesitar el token.
    const publicEntry = await (await fetch(`${backend}/api/v1${venue}/`)).json()
    assert.equal(publicEntry.contexto.plantilla.tema.distribucion.carta, 'lista')
    const reset = await rpc('restablecer_tema', { capa: 'todo' })
    await rpc('confirmar_cambio', { token: reset.token })
    assert.deepEqual((await current()).tema, initial.tema)
    assert.deepEqual(errors, [])
    await fs.writeFile(path.join(output, 'resultado.json'), JSON.stringify({ escenarios: checked, errores: errors, escriturasDelNavegador: writes.length,
      preparacionSinPublicar: true, confirmadoYRestablecido: true }, null, 2))
    console.log(`${checked.length} escenarios correctos; confirmación y restablecimiento verificados en la base aislada`)
  } finally { await context.close(); await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
