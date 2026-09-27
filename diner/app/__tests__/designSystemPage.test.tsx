import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, render, screen } from '@testing-library/react'
import DesignSystemPage from '../[rest]/[sede]/design-system/page'
import { COMPONENT_VARIANTS, SCREEN_LAYOUTS } from '@/lib/domain/designVariants'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import * as api from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { DesignContract, Entry, MenuTheme } from '@/lib/types'

let query: Record<string, string> = {}
jest.mock('next/navigation', () => ({ useParams: () => ({ rest: 'demo', sede: 'salón' }), useSearchParams: () => ({ get: (key: string) => query[key] ?? null }), useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/lib/services/api', () => ({ ...jest.requireActual('@/lib/services/api'), getDesignContract: jest.fn() }))

const root = join(__dirname, '../../../experience/experience_app/diseno')
const contract: DesignContract = { version: 2, esquema: JSON.parse(readFileSync(join(root, 'esquema.json'), 'utf8')), inventario: JSON.parse(readFileSync(join(root, 'inventario.json'), 'utf8')) }
const entry = { banners: null, contexto: { restaurante: { slug: 'demo', nombre: 'Demo' }, sede: { slug: 'salón', nombre: 'Salón principal' }, mesa: null,
  marca: { nombre: 'Casa Demo', lema: '', logo: null, saludo: '', mesero: '', bienvenida: '', color: '#6755A0', colorTexto: '#FFFFFF', colorSuave: '#EEEBF5', fuente: 'Mulish', radio: 16 } },
  carta: { restaurante: 'Casa Demo', categorias: [{ id: 1, nombre: 'Fuertes', productos: [{ id: 1, nombre: 'Bandeja', precio: 32000, agotado: false, categorias: [1], foto: '/b.png', descripcion: 'Con frijol y chicharrón.' }] }] } } as Entry
const theme: MenuTheme = { version: 2, variantes: { ...Object.fromEntries(Object.entries(COMPONENT_VARIANTS).map(([k, d]) => [k, d.default])), boton: 'contorno' } as MenuTheme['variantes'],
  distribucion: { ...Object.fromEntries(Object.entries(SCREEN_LAYOUTS).map(([k, d]) => [k, d.default])), carta: 'lista' } as MenuTheme['distribucion'],
  fundamentos: { densidad: 1.2, texto: 1, titulo: 1.1, forma: { tarjeta: 0.5, boton: 1, chip: 1, campo: 1, imagen: 1, hoja: 1 },
    colores: { fondo: '#F8F8FA', superficie: '#FFFFFF', tinta: '#32324D', tintaSuave: '#666687', tintaTerciaria: '#FFB01D', borde: '#EAEAEF', acento: '#234567', acentoTinta: '#FFFFFF', acentoSuave: '#E9ECF0' }, tipografia: { display: 'Lora', cuerpo: 'Lato' } } }
const template = { ...DEFAULT_TEMPLATE, tokens: { ...DEFAULT_TEMPLATE.tokens, acento: '#234567' }, tema: theme }
const fields = { ...COMPONENT_VARIANTS, ...SCREEN_LAYOUTS }
const initial = useDinerStore.getState()

beforeEach(() => {
  query = {}
  jest.mocked(api.getDesignContract).mockResolvedValue(contract)
  useDinerStore.setState({ ...initial, keys: { rest: 'demo', venue: 'salón', token: null }, entry, template, load: jest.fn().mockResolvedValue(undefined) }, true)
})
afterEach(() => useDinerStore.setState(initial, true))

// Falla si falta alguna opción del catálogo, si el <main> lleva atributos que contaminan las muestras, si la opción elegida no se marca
// o si las muestras admiten interacción.
it('muestra cada componente del inventario y cada opción de cada variante, marcando la elegida', async () => {
  await act(async () => { render(<DesignSystemPage />) })
  const main = screen.getByRole('main')
  expect([...main.attributes].some((a) => a.name.startsWith('data-ds-'))).toBe(false)
  for (const component of contract.inventario.componentes) expect(document.getElementById(`componente-${component.id}`)).not.toBeNull()
  for (const [field, definition] of Object.entries(fields)) {
    const layer = field in SCREEN_LAYOUTS ? theme.distribucion! : theme.variantes!
    for (const value of definition.values) {
      const option = document.querySelector(`.ds-option[data-campo="${field}"][data-valor="${value}"]`)!
      expect(option).not.toBeNull()
      expect(option.querySelector('.ds-sample')).toHaveAttribute(definition.attribute, value)
      expect(option).toHaveAttribute('data-elegida', String(layer[field as keyof typeof layer] === value))
    }
    // La opción demostrada cambia sin arrastrar las demás capas: cada muestra conserva el tema de la sede.
    expect(document.querySelector(`.ds-option[data-campo="${field}"] .ds-sample`)).toHaveAttribute(field === 'carta' ? 'data-ds-boton' : 'data-ds-carta', field === 'carta' ? 'contorno' : 'lista')
  }
  expect(document.querySelectorAll('.ds-option').length).toBe(Object.values(fields).reduce((n, d) => n + d.values.length, 0))
  for (const sample of document.querySelectorAll('.ds-sample')) expect(sample).toHaveAttribute('inert')
  expect(screen.getByText('Superficie del tema con borde y texto de acento legible.')).toBeInTheDocument()
  expect(screen.getByText('#234567')).toBeInTheDocument()
  expect(screen.getAllByText('Calculado a partir del acento y el fondo.')).toHaveLength(2)
  expect(screen.getByText('Aa Lora')).toBeInTheDocument()
  expect(screen.getAllByText('× 1,2').length).toBeGreaterThanOrEqual(1)
  expect(document.querySelector('.ds-status')).toHaveTextContent('Tema publicado')
  expect(screen.getByRole('link', { name: 'Abrir la carta' })).toHaveAttribute('href', '/demo/sal%C3%B3n/carta')
  expect(screen.queryByRole('link', { name: 'Ver el tema publicado' })).toBeNull()
  expect(screen.getByRole('main').style.getPropertyValue('--ds-densidad')).toBe('1.2')
  expect(screen.getAllByText('Bandeja').length).toBeGreaterThan(3)
})

// Falla si el borrador no se carga por su token, si la página no avisa que nada está publicado o si pierde la salida al tema publicado.
it('muestra un borrador con su caducidad y enlaces para verlo en la carta o volver al publicado', async () => {
  query = { borrador: 'tok-1' }
  const expires = new Date(Date.now() + 1_800_000).toISOString()
  useDinerStore.setState({ draftToken: 'tok-1', draftExpires: expires })
  await act(async () => { render(<DesignSystemPage />) })
  expect(useDinerStore.getState().load).toHaveBeenCalledWith({ rest: 'demo', venue: 'salón', token: null }, 'tok-1')
  expect(document.querySelector('.ds-status')).toHaveTextContent(/Tema de un borrador · caduca a las \d{1,2}:\d{2}.*Nada de lo que ves está publicado/)
  expect(screen.getByRole('link', { name: 'Ver el borrador en la carta' })).toHaveAttribute('href', '/demo/sal%C3%B3n/carta?borrador=tok-1')
  expect(screen.getByRole('link', { name: 'Ver el tema publicado' })).toHaveAttribute('href', '/demo/sal%C3%B3n/design-system')
})

// Falla si un token que aún no cargó pinta el tema publicado como si fuera el borrador, o si el error no ofrece salida.
it('espera al borrador antes de dibujar y muestra el error con la salida al tema publicado', async () => {
  query = { borrador: 'tok-2' }
  await act(async () => { render(<DesignSystemPage />) })
  expect(screen.getByRole('status')).toHaveTextContent('Preparando el borrador…')
  expect(screen.queryByRole('main')?.classList.contains('ds-root')).toBe(false)
  await act(async () => { useDinerStore.setState({ entry: null, draftToken: 'tok-2', error: 'El borrador caducó.' }) })
  expect(screen.getByRole('alert')).toHaveTextContent('No pudimos abrir el borrador. El borrador caducó.')
  expect(screen.getByRole('link', { name: 'Ver el tema publicado' })).toHaveAttribute('href', '/demo/sal%C3%B3n/design-system')
})

// Falla si la página depende del contrato público para dibujar los componentes y las opciones.
it('dibuja todas las opciones aunque el contrato del sistema de diseño no responda', async () => {
  jest.mocked(api.getDesignContract).mockRejectedValue(new Error('Sin conexión'))
  await act(async () => { render(<DesignSystemPage />) })
  expect(document.querySelectorAll('.ds-option').length).toBe(Object.values(fields).reduce((n, d) => n + d.values.length, 0))
  expect(document.querySelectorAll('.ds-component').length).toBe(contract.inventario.componentes.length)
  expect(screen.getByText(/El inventario de pantallas no está disponible/)).toBeInTheDocument()
})
