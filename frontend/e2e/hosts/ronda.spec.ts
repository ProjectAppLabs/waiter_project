import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { devices, expect, type Browser, type Page } from '@playwright/test'

import { QA_ORG, qaApi } from '../helpers/ronda'
import { test } from '../helpers/rondaFixture'

// Waiter es una sola app de Next: el comensal vive en el host menu.*, la landing en el dominio central y la consola en
// platform.* (proxy.ts y next.config.ts). Chromium resuelve *.localhost a esta máquina, así que menu.localhost:<puerto>
// es el menú del mismo servidor; el dominio central, la consola y un Host ajeno se mapean a él con --host-resolver-rules.
const RONDA = new URL(process.env.POS_URL ?? 'http://127.0.0.1:3117')
const MENU = `http://menu.localhost:${RONDA.port}`
const CENTRAL = 'http://waiter.projectapp.co'
const AJENO = 'http://intruso.example'
const SEDE = { slug: 'local-qa', nombre: 'Local QA' }
// La mesa del comensal que siembra scripts/calidad/seed_ronda.py; la 931 es de los pedidos del POS.
const MESA = 932
const PLATO = 'Plato gravado QA r3'
const CABECERA = `Waiter QA x0 · ${SEDE.nombre} · Mesa ${MESA}`
const PUBLICO = join(__dirname, '..', '..', 'public')

test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: [`--host-resolver-rules=MAP waiter.projectapp.co ${RONDA.host}, MAP platform.waiter.projectapp.co ${RONDA.host}, MAP intruso.example ${RONDA.host}`],
  },
})

// El token se lee del contrato real de la organización aislada, como el resto de las fixtures de la ronda.
async function tokenDeLaMesa(page: Page): Promise<string> {
  await page.goto('/dashboard')
  const { restaurants } = await qaApi<{ restaurants: { id: string; name: string }[] }>(page, 'auth/me')
  const local = restaurants.find((restaurant) => restaurant.name === SEDE.nombre)
  if (!local) throw new Error(`${QA_ORG} no expone la sede fixture ${SEDE.nombre}.`)
  const { floors } = await qaApi<{ floors: { tables: { number: number; token: string }[] }[] }>(page, `floors?restaurant_id=${local.id}`)
  const mesa = floors.flatMap((floor) => floor.tables).find((table) => table.number === MESA)
  if (!mesa) throw new Error(`La sede fixture ${SEDE.nombre} no tiene la mesa ${MESA}.`)
  return mesa.token
}

// El teléfono del comensal: un contexto propio, sin la sesión del POS.
async function telefono(browser: Browser): Promise<Page> {
  return (await browser.newContext({ ...devices['Pixel 7'], locale: 'es-CO', timezoneId: 'America/Bogota' })).newPage()
}

for (const barra of ['', '/']) {
  // Falla si el QR o el NFC impreso de una mesa deja de abrir su carta, con o sin la barra final: el comensal pasó de
  // trailingSlash: true a la app única sin redirecciones (skipTrailingSlashRedirect), y los enlaces impresos no cambian.
  test(`el QR de la mesa ${barra ? 'con' : 'sin'} barra final abre la carta de esa mesa`, {
    tag: ['@flow:diner-table-entry', '@outcome:success'],
  }, async ({ page, browser }) => {
    const token = await tokenDeLaMesa(page)
    // La forma exacta del enlace de mesa que arma el backend: experience/experience_app/services/online_payments.py:134-136.
    const enlace = `${MENU}/${QA_ORG}/${SEDE.slug}/t/${token}${barra}`
    const comensal = await telefono(browser)
    const contexto = comensal.waitForResponse(`${MENU}/api/v1/${QA_ORG}/${SEDE.slug}/t/${token}/`)
    const respuesta = await comensal.goto(enlace)
    expect(respuesta?.request().redirectedFrom()?.url() ?? null, 'el enlace impreso no se redirige').toBeNull()
    expect((await contexto).status(), 'la carta pide el contexto de esa mesa').toBe(200)
    await comensal.getByRole('button', { name: 'Omitir introducción', exact: true }).click()
    await expect(comensal.getByText(CABECERA, { exact: true })).toBeVisible()
    await expect(comensal).toHaveURL(enlace)
    // Navegar dentro de la carta sigue en el mismo host: el plato abre su ficha en la ruta del comensal.
    await comensal.getByRole('link', { name: new RegExp(PLATO) }).click()
    await expect(comensal).toHaveURL(new RegExp(`^${MENU}/${QA_ORG}/${SEDE.slug}/t/${token}/plato/\\d+$`))
    await expect(comensal.getByRole('heading', { name: PLATO, exact: true })).toBeVisible()
    await comensal.context().close()
  })
}

// Falla si el /sw.js del host del menú cambia de ruta, de scope o de contenido: el service worker que ya está instalado en
// los teléfonos (registrado en /sw.js con scope /) quedaría huérfano, o el menú registraría otro junto a él.
test('el service worker ya instalado en el teléfono sigue en /sw.js con scope / al volver a la carta', {
  tag: ['@flow:diner-installed-app', '@outcome:success'],
}, async ({ page, browser }) => {
  const token = await tokenDeLaMesa(page)
  const comensal = await telefono(browser)
  const instalado = { scope: `${MENU}/`, script: `${MENU}/sw.js`, registros: 1 }
  const registro = () => comensal.evaluate(async () => {
    const activo = await navigator.serviceWorker.ready
    return { scope: activo.scope, script: activo.active?.scriptURL, registros: (await navigator.serviceWorker.getRegistrations()).length }
  })
  await comensal.goto(`${MENU}/${QA_ORG}/${SEDE.slug}/t/${token}`)
  expect(await registro()).toEqual(instalado)
  // El teléfono vuelve a la carta con el service worker ya instalado: la controla el mismo y no aparece otro registro.
  await comensal.reload()
  await comensal.getByRole('button', { name: 'Omitir introducción', exact: true }).click()
  await expect(comensal.getByText(CABECERA, { exact: true })).toBeVisible()
  expect(await comensal.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(instalado.script)
  expect(await registro()).toEqual(instalado)
  // El archivo es el del comensal (public/diner/sw.js), no el del POS (public/sw.js), y el manifiesto es el de la carta.
  expect(await (await comensal.request.get(instalado.script)).text()).toBe(readFileSync(join(PUBLICO, 'diner', 'sw.js'), 'utf8'))
  expect(await (await comensal.request.get(`${MENU}/manifest.webmanifest`)).json()).toMatchObject({ name: 'Carta del restaurante', start_url: '/' })
  await comensal.context().close()
})

// Falla si el dominio central deja de mostrar la landing, si su navegación interna (Condiciones → Privacidad) se sale de
// ella o si /login deja de ser el inicio de sesión del POS en esa misma dirección.
test('el dominio central muestra la landing con su navegación y deja el inicio de sesión al POS', {
  tag: ['@flow:app-host-routing', '@outcome:success'],
}, async ({ browser }) => {
  const visitante = await (await browser.newContext({ locale: 'es-CO' })).newPage()
  await visitante.goto(`${CENTRAL}/terms`)
  await expect(visitante).toHaveTitle('Condiciones del servicio de Waiter')
  await visitante.getByRole('link', { name: 'política de privacidad', exact: true }).click()
  await expect(visitante).toHaveURL(`${CENTRAL}/privacy`)
  await expect(visitante).toHaveTitle('Política de privacidad de Waiter')
  await visitante.goto(`${CENTRAL}/login`)
  await expect(visitante.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
  await visitante.context().close()
})

// Falla si un Host que nginx no deja pasar recibe algo más que el POS con la lógica de tenant de siempre: la landing, el
// comensal, los prefijos internos o un sitio elegido por el cliente con el encabezado x-waiter-sitio.
test('un Host ajeno sólo llega al POS, sin landing, sin comensal y sin prefijos internos', {
  tag: ['@flow:app-host-routing', '@outcome:failure'],
}, async ({ page, browser }) => {
  // quality: allow-no-interaction (el reparto por Host ocurre en el servidor antes de cualquier pantalla; lo que se prueba es qué responde a cada dirección)
  const token = await tokenDeLaMesa(page)
  const intruso = await (await browser.newContext({ locale: 'es-CO', extraHTTPHeaders: { 'x-waiter-sitio': 'diner' } })).newPage()
  await intruso.goto(`${AJENO}/`)
  await expect(intruso).toHaveTitle('Waiter · POS')
  expect((await intruso.goto(`${AJENO}/privacy`))?.status(), 'sin landing').toBe(404)
  expect((await intruso.goto(`${AJENO}/${QA_ORG}/${SEDE.slug}/t/${token}`))?.status(), 'sin comensal').toBe(404)
  expect((await intruso.goto(`${AJENO}/diner/${QA_ORG}/${SEDE.slug}/t/${token}`))?.status(), 'sin prefijo interno').toBe(404)
  expect(await (await intruso.goto(`${AJENO}/sw.js`))?.text()).toBe(readFileSync(join(PUBLICO, 'sw.js'), 'utf8'))
  await intruso.context().close()
})

// Falla si un enlace viejo a /plataforma deja de llegar a la misma pantalla en /platform, o si el host de la consola
// (platform.) deja de ser la consola: tomado por una organización llamada «platform», por el dominio central o quedándose
// en su propio inicio de sesión. Sin sesión, la consola termina en el inicio universal del dominio central.
test('la consola vive en platform. y sin sesión manda al inicio universal del dominio central', {
  tag: ['@flow:app-host-routing', '@outcome:success'],
}, async ({ browser }) => {
  // quality: allow-no-interaction (el reparto por Host y la redirección de la ruta vieja ocurren antes de cualquier pantalla; lo que se prueba es a dónde lleva cada dirección)
  const consola = 'http://platform.waiter.projectapp.co'
  const visitante = await (await browser.newContext({ locale: 'es-CO' })).newPage()
  // Solo hasta la respuesta: la consola sin sesión se va sola al inicio universal apenas arranca.
  const respuesta = await visitante.goto(`${consola}/plataforma/metricas`, { waitUntil: 'commit' })
  expect(respuesta?.request().redirectedFrom()?.url(), 'el enlace viejo se redirige').toBe(`${consola}/plataforma/metricas`)
  expect(respuesta?.url(), 'a la misma pantalla en la ruta nueva, en el mismo host').toBe(`${consola}/platform/metricas`)
  await expect(visitante).toHaveURL(`${CENTRAL}/login`)
  await expect(visitante.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
  await visitante.context().close()
})
