/** @jest-environment node */
import { NextRequest } from 'next/server'

import { orgFromHost } from '@/lib/domain/tenant'
import { SITIO, SITIOS } from '@/lib/sitio'
import nextConfig from '@/next.config'
import { decidir, proxy } from '@/proxy'

// La forma exacta del enlace de una mesa como la arma el backend (experience/experience_app/services/online_payments.py,
// líneas 134-136): <host del menú>/<organización>/<sede>/t/<token>. El token nuevo son 32 hexadecimales
// (experience/tables/models.py:10-11) y el migrado de Odoo, seis alfanuméricos (el validador de las líneas 44-45).
const MESAS = ['/burger-house/poblado/t/0f1e2d3c4b5a69788796a5b4c3d2e1f0', '/burger-house/poblado/t/Z2XUVG']
const MENU = ['menu.waiter.projectapp.co', 'menu.localhost:3000']
const POS = ['burger-house.waiter.projectapp.co', 'platform.waiter.projectapp.co', '127.0.0.1:3117', 'localhost:3000', 'frisby.localhost:3000']
// Hosts que nginx no deja pasar (sólo los server_name del kit) con la organización que les asigna la lógica de tenant.
const AJENOS: [string, string][] = [['intruso.example', 'intruso'], ['intruso.example:8443', 'intruso'], ['waiter.projectapp.co.intruso.example', 'waiter']]

const pedido = (host: string, ruta: string, encabezados: Record<string, string> = {}) =>
  new NextRequest(`http://127.0.0.1:3117${ruta}`, { headers: { host, ...encabezados } })
// El sitio que el proxy anota en la petición que sigue al router, o null si no anota ninguno.
const sitioAnotado = (respuesta: Response) => respuesta.headers.get(`x-middleware-request-${SITIO}`)

describe('proxy: el host del menú es el comensal', () => {
  // Falla si el QR o el NFC impreso de una mesa deja de abrir el comensal, con o sin la barra final que dejaba
  // trailingSlash: true en la app vieja del comensal.
  it.each(MENU.flatMap((host) => MESAS.flatMap((mesa) => [[host, mesa], [host, `${mesa}/`]])))('%s%s abre el comensal', (host, ruta) => {
    expect(decidir(host, ruta)).toEqual({ tipo: 'sitio', sitio: 'diner' })
  })

  // Falla si /sw.js, los íconos o el manifiesto del menú dejan de ser los del comensal: el service worker ya instalado
  // en los teléfonos quedaría huérfano. En un host del POS siguen siendo los del POS.
  it.each(['/sw.js', '/icons/icon-192.png', '/manifest.webmanifest'])('%s del menú es el del comensal', (ruta) => {
    expect(decidir('menu.waiter.projectapp.co', ruta)).toEqual({ tipo: 'sitio', sitio: 'diner' })
    expect(decidir('burger-house.waiter.projectapp.co', ruta)).toEqual({ tipo: 'pasar' })
  })

  // Falla si el menú deja de compartir los archivos de Next, su API o los recursos públicos: la carta no cargaría.
  it.each(['/_next/static/chunks/main.js', '/api/v1/burger-house/poblado/t/Z2XUVG/', '/smart-menu/olas.png', '/mapas/medellin.pmtiles'])(
    'el menú comparte %s con el resto de la app', (ruta) => {
      expect(decidir('menu.waiter.projectapp.co', ruta)).toEqual({ tipo: 'pasar' })
    })

  // Falla si el host del menú abre una pantalla del POS: /login, /caja o la consola siguen siendo rutas del comensal, como
  // antes, y la ruta vieja de la consola (/plataforma) tampoco se redirige ahí.
  it.each(['/login', '/caja', '/platform', '/plataforma', '/organizacion'])('el menú no abre %s del POS', (ruta) => {
    expect(decidir('menu.waiter.projectapp.co', ruta)).toEqual({ tipo: 'sitio', sitio: 'diner' })
  })
})

describe('proxy: el dominio central y los hosts del POS', () => {
  // Falla si el dominio central deja de mostrar la landing en sus cuatro páginas o se la muestra al inicio de sesión.
  it.each(['/', '/privacy', '/privacy/', '/terms', '/data-deletion'])('el dominio central muestra la landing en %s', (ruta) => {
    expect(decidir('waiter.projectapp.co', ruta)).toEqual({ tipo: 'sitio', sitio: 'landing' })
  })

  // Falla si el inicio de sesión universal o los archivos del POS dejan de servirse en el dominio central.
  it.each(['/login', '/entrar', '/sw.js', '/manifest.webmanifest'])('el dominio central deja %s al POS', (ruta) => {
    expect(decidir('waiter.projectapp.co', ruta)).toEqual({ tipo: 'pasar' })
  })

  // Falla si una organización, la consola, una IP o localhost pierden alguna ruta del POS por la landing o el comensal.
  it.each(POS.flatMap((host) => ['/', '/privacy', '/login', MESAS[0]].map((ruta) => [host, ruta])))('%s%s es del POS', (host, ruta) => {
    expect(decidir(host, ruta)).toEqual({ tipo: 'pasar' })
  })

  // Falla si los prefijos internos se alcanzan pidiéndolos directo: el comensal y la landing aparecerían bajo cualquier host.
  it.each([...MENU, 'waiter.projectapp.co', ...POS, ...AJENOS.map(([host]) => host)])('%s no sirve /diner ni /landing directo', (host) => {
    for (const ruta of ['/diner', '/diner/burger-house/poblado', '/landing', '/landing/privacy']) {
      expect(decidir(host, ruta)).toEqual({ tipo: 'no-encontrado' })
    }
  })

  // Falla si la galería del kit, una herramienta local, queda publicada en el servidor.
  it('la galería del kit sólo existe en desarrollo', () => {
    expect(decidir('127.0.0.1:3117', '/kit')).toEqual({ tipo: 'no-encontrado' })
    expect(decidir('127.0.0.1:3117', '/kit/botones')).toEqual({ tipo: 'no-encontrado' })
    expect(decidir('127.0.0.1:3117', '/kit', true)).toEqual({ tipo: 'pasar' })
  })
})

describe('proxy: un Host que nginx no deja pasar', () => {
  // Falla si un Host ajeno recibe del proxy algo más que el POS con la lógica de tenant de siempre (la organización de
  // su primer nombre, nunca la de omisión): la landing, el comensal o un sitio anotado.
  it.each(AJENOS)('%s sólo llega al POS de la organización %s', (host, organizacion) => {
    for (const ruta of ['/', '/login', '/privacy', '/sw.js', MESAS[0]]) expect(decidir(host, ruta)).toEqual({ tipo: 'pasar' })
    expect(orgFromHost(host, 'qa-x0')).toBe(organizacion)
    expect(sitioAnotado(proxy(pedido(host, '/')))).toBeNull()
  })

  // Falla si el cliente puede elegir el sitio mandando el encabezado: un Host del POS mostraría el comensal o la landing.
  it.each(SITIOS)('el encabezado que pide %s desde el cliente se descarta', (sitio) => {
    for (const host of [...AJENOS.map(([ajeno]) => ajeno), ...POS]) expect(sitioAnotado(proxy(pedido(host, '/', { [SITIO]: sitio })))).toBeNull()
    expect(sitioAnotado(proxy(pedido('menu.waiter.projectapp.co', '/', { [SITIO]: 'landing' })))).toBe('diner')
    expect(sitioAnotado(proxy(pedido('waiter.projectapp.co', '/', { [SITIO]: 'diner' })))).toBe('landing')
  })

  // Falla si un prefijo interno pedido con un Host ajeno responde algo distinto del 404 propio del proxy.
  it('un prefijo interno responde 404 sin llegar a ninguna página', async () => {
    const respuesta = proxy(pedido('intruso.example', '/diner/burger-house/poblado/t/Z2XUVG'))
    expect(respuesta.status).toBe(404)
    expect(await respuesta.text()).toBe('Not Found')
  })
})

describe('proxy: la ruta vieja de la consola', () => {
  const VIEJAS = [['/plataforma', '/platform'], ['/plataforma/', '/platform/'], ['/plataforma/clientes/frisby', '/platform/clientes/frisby']]

  // Falla si un enlace o un marcador viejo a /plataforma deja de llegar a la misma pantalla de /platform en cualquier
  // host del POS (la consola, una organización, una IP o localhost).
  it.each(POS.flatMap((host) => VIEJAS.map(([vieja, nueva]) => [host, vieja, nueva])))('%s%s va a %s', (host, vieja, nueva) => {
    expect(decidir(host, vieja)).toEqual({ tipo: 'redirigir', ruta: nueva })
  })

  // Falla si la redirección se come una ruta que solo empieza parecido o vuelve a mandar a la ruta nueva.
  it.each(['/plataformas', '/plataforma-vieja', '/platform', '/platform/metricas'])('%s no se redirige', (ruta) => {
    expect(decidir('platform.waiter.projectapp.co', ruta)).toEqual({ tipo: 'pasar' })
  })

  // Falla si la redirección pierde la consulta (el código de una invitación vieja) o deja de ser permanente: el navegador
  // seguiría pidiendo la ruta vieja.
  it('redirige con 308 y conserva la consulta', () => {
    const respuesta = proxy(pedido('platform.waiter.projectapp.co', '/plataforma/login?codigo=ana.projectapp'))
    expect(respuesta.status).toBe(308)
    const destino = new URL(respuesta.headers.get('location') ?? '')
    expect(destino.pathname + destino.search).toBe('/platform/login?codigo=ana.projectapp')
  })
})

describe('next.config: la reescritura que sigue al proxy', () => {
  // Falla si next.config deja de reescribir con el encabezado que anota el proxy o vuelve a tener más de una regla por
  // sitio: las de beforeFiles se encadenan sobre la ruta ya reescrita y / terminaría en /diner/diner.
  it('reescribe cada sitio a su prefijo interno con una sola regla', async () => {
    const reglas = await nextConfig.rewrites!()
    if (Array.isArray(reglas)) throw new Error('next.config debe separar beforeFiles de afterFiles.')
    expect(reglas.beforeFiles).toEqual(SITIOS.map((sitio) => ({
      source: '/:ruta(.*)', has: [{ type: 'header', key: SITIO, value: sitio }], destination: `/${sitio}/:ruta` })))
  })
})
