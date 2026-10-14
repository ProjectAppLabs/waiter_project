import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { CompanyForm, DisplayForm, PaymentMethodsList, TaxesList, UsersForm } from '@/components/settings/KitSettingsForms'
import { play, setStation } from '@/lib/audio/sounds'
import { messages } from '@/lib/i18n/messages'
import { saveCompany, type CompanyInfo } from '@/lib/services/settings'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import type { Catalog } from '@/lib/types'

jest.mock('@/lib/services/settings', () => ({ ...jest.requireActual('@/lib/services/settings'), saveCompany: jest.fn() }))
jest.mock('@/lib/audio/sounds', () => ({ ...jest.requireActual('@/lib/audio/sounds'), play: jest.fn(), setStation: jest.fn() }))

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const COMPANY: CompanyInfo = { id: 0, name: 'Burger House', vat: '900123456-7', phone: '3001234567', email: 'hola@burger.co', street: 'Calle 10 # 5-20', city: 'Medellín' }
const setCategories = (stations: (string | null)[]) => useCatalogStore.setState({ catalog: { categories: stations.map((station, i) => ({ id: i + 1, name: `C${i}`, station })) } as unknown as Catalog })

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  setCategories([])
})

// Falla si los datos editados de la empresa no llegan al guardado o si la pantalla no confirma que se guardaron.
it('la empresa guarda lo editado y confirma', async () => {
  jest.mocked(saveCompany).mockResolvedValue(undefined)
  wrap(<CompanyForm initial={COMPANY} />)
  fireEvent.change(screen.getByLabelText('Ciudad'), { target: { value: 'Bogotá' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(saveCompany).toHaveBeenCalledWith(expect.objectContaining({ name: 'Burger House', city: 'Bogotá' })))
  expect(await screen.findByRole('status')).toHaveTextContent('Guardado')
})

// Falla si se puede guardar la empresa sin nombre.
it('no deja guardar sin nombre', () => {
  wrap(<CompanyForm initial={COMPANY} />)
  const save = screen.getByRole('button', { name: 'Guardar' })
  expect(save).toBeEnabled()
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: '   ' } })
  expect(save).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Burger' } })
  expect(save).toBeEnabled()
})

// Falla si un fallo al guardar la empresa no se avisa.
it('avisa cuando la empresa no se pudo guardar', async () => {
  jest.mocked(saveCompany).mockRejectedValue(new Error('red'))
  wrap(<CompanyForm initial={COMPANY} />)
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
})

// Falla si «Empresa e impuestos» vuelve a ofrecer el enlace de Google Maps: la empresa no guarda ubicación (es de cada
// local) y lo pegado se perdía al guardar sin avisar.
it('la empresa no ofrece un campo de ubicación que no se guarda', () => {
  wrap(<CompanyForm initial={COMPANY} />)
  expect(screen.queryByLabelText('Enlace de Google Maps')).not.toBeInTheDocument()
})

// Falla si un medio de pago no muestra su nombre o el tipo traducido.
it('lista los medios de pago con su tipo', () => {
  wrap(<PaymentMethodsList methods={[{ id: 1, name: 'Caja', type: 'cash' }, { id: 2, name: 'Datáfono', type: 'bank' }, { id: 3, name: 'Fiado', type: 'pay_later' }]} />)
  expect(screen.getByText('Caja').parentElement).toHaveTextContent('Efectivo')
  expect(screen.getByText('Datáfono').parentElement).toHaveTextContent('Datáfono / banco')
  expect(screen.getByText('Fiado').parentElement).toHaveTextContent('Cuenta de cliente')
})

// Falla si un impuesto no muestra su porcentaje.
it('lista los impuestos con su porcentaje', () => {
  wrap(<TaxesList taxes={[{ id: 1, name: 'IVA', amount: 19 }, { id: 2, name: 'INC', amount: 8 }]} />)
  expect(screen.getByText('IVA').parentElement).toHaveTextContent('19%')
  expect(screen.getByText('INC').parentElement).toHaveTextContent('8%')
})

// Falla si el equipo no muestra el horario y el rol de cada persona, o si quien no tiene rol ni turno sale sin texto.
it('muestra el equipo con su horario y rol', () => {
  wrap(<UsersForm employees={[
    { id: 1, name: 'Sofía', code: null, role: 'waiter', shift: { from: 8, to: 16 } },
    { id: 2, name: 'Pedro', code: null, role: null, shift: null },
  ]} />)
  const team = screen.getByRole('region', { name: 'Tu equipo' })
  expect(team).toHaveTextContent('Sofía'); expect(team).toHaveTextContent('Mesero')
  expect(screen.getByText('Pedro').closest('div')!.parentElement).toHaveTextContent('Sin horario')
  expect(screen.getByText('Pedro').closest('div')!.parentElement).toHaveTextContent('Rol de su cuenta')
})

// Falla si el equipo sin personas rompe la pantalla.
it('el equipo vacío solo muestra el encabezado', () => {
  wrap(<UsersForm />)
  expect(screen.getByRole('region', { name: 'Tu equipo' })).toHaveTextContent('Tu equipo')
})

// Falla si la densidad o la estación no se aplican a la pantalla y al sonido, o no se recuerdan en este equipo.
it('la densidad y la estación se aplican y se guardan en el equipo', () => {
  localStorage.setItem('waiter.density', 'compact')
  wrap(<DisplayForm />)
  expect(screen.getByLabelText('Densidad de la interfaz')).toHaveValue('compact')
  expect(document.documentElement.dataset.density).toBe('compact')
  fireEvent.change(screen.getByLabelText('Densidad de la interfaz'), { target: { value: 'balanced' } })
  expect(document.documentElement.dataset.density).toBe('balanced')
  expect(localStorage.getItem('waiter.density')).toBe('balanced')
  fireEvent.change(screen.getByLabelText('Esta pantalla es'), { target: { value: 'kds' } })
  expect(setStation).toHaveBeenLastCalledWith('kds')
  expect(localStorage.getItem('waiter.station')).toBe('kds')
})

// Falla si el botón de probar un sonido no reproduce ese sonido.
it('prueba cada sonido', () => {
  wrap(<DisplayForm />)
  fireEvent.click(screen.getByRole('button', { name: 'Probar: critico' }))
  expect(play).toHaveBeenCalledWith('critico')
})

// Falla si la pantalla se cae cuando el navegador no deja usar el almacenamiento local.
it('funciona sin almacenamiento local', () => {
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
  try {
    wrap(<DisplayForm />)
    expect(screen.getByLabelText('Densidad de la interfaz')).toHaveValue('wide')
    expect(screen.getByLabelText('Esta pantalla es')).toHaveValue('tablet')
  } finally { get.mockRestore(); set.mockRestore() }
})

// Falla si el papel, las copias o la comanda automática no se guardan en los ajustes de impresión del equipo.
it('guarda papel, copias y comanda automática del equipo', () => {
  wrap(<DisplayForm />)
  fireEvent.change(screen.getByLabelText('Ancho del papel'), { target: { value: '58' } })
  fireEvent.change(screen.getByLabelText('Copias del recibo'), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('switch', { name: 'Imprimir la comanda al enviar a cocina' }))
  expect(JSON.parse(localStorage.getItem('waiter.print')!)).toEqual({ paper: '58', receiptCopies: 3, autoComanda: true, stations: [] })
  fireEvent.change(screen.getByLabelText('Ancho del papel'), { target: { value: '80' } })
  expect(JSON.parse(localStorage.getItem('waiter.print')!).paper).toBe('80')
})

// Falla si las estaciones de la carta no aparecen con la comanda automática, si se repiten, o si elegir y quitar una
// no cambia lo que imprime este equipo.
it('elige las estaciones que imprime este equipo', () => {
  setCategories(['cocina', 'barra', 'cocina', null])
  localStorage.setItem('waiter.print', JSON.stringify({ autoComanda: true }))
  wrap(<DisplayForm />)
  expect(screen.getAllByRole('button', { name: 'cocina' })).toHaveLength(1)
  expect(screen.getByText('Sin elegir ninguna, imprime todas.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'barra' }))
  expect(JSON.parse(localStorage.getItem('waiter.print')!).stations).toEqual(['barra'])
  expect(screen.getByText('Los platos sin estación se imprimen siempre.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'barra' }))
  expect(JSON.parse(localStorage.getItem('waiter.print')!).stations).toEqual([])
})

// Falla si las estaciones se muestran con la comanda automática apagada.
it('sin comanda automática no muestra estaciones', () => {
  setCategories(['cocina'])
  wrap(<DisplayForm />)
  expect(screen.queryByText('Estaciones que imprime este equipo')).not.toBeInTheDocument()
})

// Falla si DisplayForm se cae cuando la carta no ha cargado. Era un error real (corregido el 2026-10-04): el selector de PrintSettingsBox devolvía un arreglo nuevo en cada lectura cuando no hay
// carta (`s.catalog?.categories ?? []`), y zustand entra en un bucle de renders: «Maximum update depth exceeded».
// Hoy la página de Configuración no dibuja nada sin carta, pero cualquier otro uso de DisplayForm se cae.
it('se dibuja aunque la carta no haya cargado', () => {
  useCatalogStore.setState({ catalog: null })
  wrap(<DisplayForm />)
  expect(screen.getByRole('region', { name: 'Impresión en este equipo' })).toBeInTheDocument()
})
