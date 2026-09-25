import { act, render, screen } from '@testing-library/react'
import DinerPage from '../[rest]/[sede]/[[...ruta]]/page'
import { useDinerStore } from '@/lib/stores/dinerStore'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import type { Entry, MenuTheme } from '@/lib/types'

const params = { rest: 'demo', sede: 'salon', ruta: ['carta'] }
jest.mock('next/navigation', () => ({ useParams: () => params, useSearchParams: () => null }))
jest.mock('@/components/smart/FirstVisitIntro', () => ({ FirstVisitIntro: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('@/components/smart/SmartMenu', () => ({ SmartExperience: () => <p>Carta de prueba</p> }))
const initial = useDinerStore.getState()
afterEach(() => useDinerStore.setState(initial, true))

// Falla si la ruta omite los atributos del tema o conserva los de la sede anterior al cambiar la entrada.
it('aplica las variantes al main real y restablece las omitidas al cambiar de tema', async () => {
  useDinerStore.setState({ entry: {} as Entry, template: { ...DEFAULT_TEMPLATE, tema: {
    version: 2, variantes: { boton: 'contorno', saludo: 'oculto' }, distribucion: { carta: 'lista' },
  } as MenuTheme }, load: jest.fn().mockResolvedValue(undefined), refreshCart: jest.fn().mockResolvedValue(undefined) })
  // Solo el contenedor se monta; no hay peticiones de red ni sesiones reales.
  useDinerStore.setState({ entry: { contexto: { marca: { color: '#6755A0', colorTexto: '#FFFFFF', colorSuave: '#EEEBF5', fuente: 'Mulish', radio: 16 } } } as Entry })
  await act(async () => { render(<DinerPage />) })
  expect(screen.getByRole('main')).toHaveAttribute('data-ds-boton', 'contorno')
  expect(screen.getByRole('main')).toHaveAttribute('data-ds-carta', 'lista')
  expect(screen.getByRole('main')).toHaveAttribute('data-ds-saludo', 'oculto')
  await act(async () => { useDinerStore.setState({ template: DEFAULT_TEMPLATE }) })
  expect(screen.getByRole('main')).toHaveAttribute('data-ds-boton', 'relleno')
  expect(screen.getByRole('main')).toHaveAttribute('data-ds-carta', 'actual')
  expect(screen.getByRole('main')).toHaveAttribute('data-ds-saludo', 'visible')
})
