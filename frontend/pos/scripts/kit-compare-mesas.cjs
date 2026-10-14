// Captura los estados de la pantalla Mesas (kit 6 – Table) que no son una ruta: barra de mesa seleccionada,
// detalle de mesa, cambiar mesa, lista de reservas, engranaje y el wizard del plano. Claro y oscuro.
// Uso: PLAYWRIGHT_BASE_URL=http://192.168.56.10:3013 node scripts/kit-compare-mesas.cjs [dark]
const { chromium, devices } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')

const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const theme = process.argv[2] === 'dark' ? 'dark' : 'light'
const out = path.join(__dirname, '..', 'kit-compare', `mesas-${theme}`)

async function main() {
  fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({ ...devices['iPad Pro 11 landscape'] })
  const page = await context.newPage()
  await page.addInitScript((mode) => { try { localStorage.setItem('waiter.theme', mode) } catch { /* sin almacenamiento */ } }, theme)
  await page.goto(`${base}/login`)
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Correo').fill('admin'); await page.getByLabel('Contraseña').fill('admin')
  await page.getByRole('button', { name: 'Abrir mi turno' }).waitFor({ state: 'attached' })
  await page.getByRole('button', { name: 'Abrir mi turno' }).click()
  await page.waitForURL('**/salon')
  await page.waitForFunction(() => document.body.innerText.includes('Info del piso'), null, { timeout: 60_000 })
    .catch(async () => { await page.screenshot({ path: path.join(out, '00-debug.png') }); throw new Error('el salón no pintó el plano') })
  const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log('captura', name) }

  // Mesa reservada: lista de reservas con filas reales y su detalle (Reservation Information / Details.png).
  const booked = page.getByRole('button', { name: 'Mesa 1: Reservada' })
  await booked.waitFor({ timeout: 10_000 }).catch(() => undefined)
  if (await booked.count()) {
    await booked.click()
    await page.getByRole('button', { name: 'Info de reserva' }).click()
    await page.waitForTimeout(800)
    await shot('12-lista-reservas-llena')
    await page.getByRole('dialog', { name: 'Lista de reservas' }).getByRole('button', { name: 'Detalle', exact: true }).first().click()
    await page.waitForTimeout(800)
    await shot('13-detalle-reserva')
    // Cerrar el detalle vuelve a la lista (como en el kit); se cierra también para seguir con el plano.
    await page.getByRole('dialog', { name: 'Detalle de reserva' }).getByRole('button', { name: 'Cerrar' }).click()
    await page.getByRole('dialog', { name: 'Lista de reservas' }).getByRole('button', { name: 'Cerrar' }).click()
    await page.getByRole('button', { name: 'Quitar selección' }).click()
  }

  // Home ya lo captura kit:compare. Aquí: mesa seleccionada con pedido (Table Selected.png).
  const busy = page.getByRole('button', { name: /^Mesa 11: / })
  await busy.click()
  await shot('01-mesa-seleccionada')

  await page.getByRole('button', { name: 'Info de reserva' }).click()
  await shot('02-lista-reservas')
  await page.getByRole('dialog', { name: 'Lista de reservas' }).getByRole('button', { name: 'Cerrar' }).click()

  await page.getByRole('button', { name: 'Detalle de mesa' }).click()
  await page.getByRole('dialog', { name: 'Detalle de mesa' }).waitFor()
  await page.waitForTimeout(800)
  await shot('03-detalle-mesa')

  const change = page.getByRole('button', { name: 'Cambiar mesa' })
  if (await change.count()) {
    await change.click()
    await shot('04-elegir-mesa-nueva')
    await page.getByRole('button', { name: /^Mesa 3: / }).click()
    await shot('05-cambiar-mesa')
    await page.getByRole('dialog', { name: 'Cambiar mesa' }).getByRole('button', { name: 'Cancelar' }).click()
    await page.getByRole('button', { name: 'Cancelar cambio' }).click()
  }

  await page.getByRole('button', { name: 'Ajustes de mesas' }).click()
  await shot('06-engranaje')
  await page.getByRole('button', { name: 'Agregar piso' }).click()
  await page.getByRole('dialog', { name: 'Agregar plano' }).waitFor()
  await shot('07-wizard-info')
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await shot('08-wizard-organizar')

  // Una mesa arrastrada al plano, para ver la cuadrícula ocupada y el modal del nombre.
  const palette = await page.getByRole('button', { name: 'Mesa pequeña' }).boundingBox()
  const canvas = await page.getByTestId('layout-canvas').boundingBox()
  await page.mouse.move(palette.x + palette.width / 2, palette.y + palette.height / 2)
  await page.mouse.down()
  await page.mouse.move(canvas.x + 200, canvas.y + 140, { steps: 8 })
  await shot('09-wizard-arrastrando')
  await page.mouse.up()
  await shot('10-wizard-nombre')
  await page.getByRole('textbox', { name: 'Nombre de la mesa' }).fill('1')
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await shot('11-wizard-mesa-puesta')
  await browser.close()
}
main()
