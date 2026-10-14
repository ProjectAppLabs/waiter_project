import { act, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { PrintHost } from '@/components/print/PrintHost'
import type { Comanda } from '@/lib/domain/comanda'
import { messages } from '@/lib/i18n/messages'
import { printFiredCourse } from '@/lib/print/autoComanda'
import { DEFAULT_PRINT, printReceipt, readPrintSettings, writePrintSettings } from '@/lib/print/settings'
import { listTickets } from '@/lib/services/core/kitchen'
import { usePrintStore } from '@/lib/stores/printStore'

jest.mock('@/lib/services/core/kitchen', () => ({ listTickets: jest.fn() }))
jest.mock('@/lib/services/core/catalogBridge', () => ({ currentRestaurantId: () => 4 }))

const comanda: Comanda = {
  number: 'DI-004', place: { kind: 'table', number: 12 }, waiter: 'Sofía', at: '2026-10-03T15:00:00Z', note: '', station: null,
  lines: [{ qty: 2, name: 'Hamburguesa', options: ['Doble'], note: 'sin cebolla', station: 'Plancha' }, { qty: 1, name: 'Limonada', options: [], note: '', station: 'Barra' }],
}
const print = jest.fn()
beforeEach(() => { localStorage.clear(); print.mockReset(); window.print = print; usePrintStore.setState({ sheets: null }) })
const host = () => render(<NextIntlClientProvider locale="es" messages={messages}><PrintHost /></NextIntlClientProvider>)

// Falla si los ajustes de impresión aceptan valores inválidos del almacenamiento o no recuerdan los del equipo.
it('lee y guarda los ajustes de este equipo', () => {
  expect(readPrintSettings()).toEqual(DEFAULT_PRINT)
  localStorage.setItem('waiter.print', JSON.stringify({ paper: 'A4', autoComanda: 'sí', stations: [1, 'Barra'], receiptCopies: 9 }))
  expect(readPrintSettings()).toEqual({ paper: '80', autoComanda: false, stations: ['Barra'], receiptCopies: 1 })
  writePrintSettings({ paper: '58', autoComanda: true, stations: ['Plancha'], receiptCopies: 2 })
  expect(readPrintSettings()).toEqual({ paper: '58', autoComanda: true, stations: ['Plancha'], receiptCopies: 2 })
})

// Falla si el recibo no sale con las copias configuradas en este equipo.
it('imprime las copias del recibo', () => {
  writePrintSettings({ ...DEFAULT_PRINT, receiptCopies: 2 })
  printReceipt()
  expect(print).toHaveBeenCalledTimes(2)
})

// Falla si la comanda no pinta una hoja por estación con la cantidad, el plato, sus opciones y la nota, o si no abre la
// impresión, o si al terminar las hojas se quedan pegadas.
it('pinta las hojas y abre la impresión', async () => {
  host()
  await act(async () => { usePrintStore.getState().printComanda(comanda) })
  await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))) })
  const sheets = document.querySelectorAll('.comanda-sheet')
  expect(sheets).toHaveLength(2)
  expect(sheets[0].textContent).toContain('Plancha')
  expect(sheets[0].textContent).toContain('2× Hamburguesa')
  expect(sheets[0].textContent).toContain('+ Doble')
  expect(sheets[0].textContent).toContain('sin cebolla')
  expect(sheets[0].textContent).toContain('Mesa 12')
  expect(print).toHaveBeenCalled()
  await act(async () => { window.dispatchEvent(new Event('afterprint')) })
  expect(document.querySelectorAll('.comanda-sheet')).toHaveLength(0)
})

// Falla si la impresión automática imprime sin estar activada, o si imprime estaciones que no son de este equipo.
it('al enviar a cocina imprime solo si el equipo lo pide y solo sus estaciones', async () => {
  jest.mocked(listTickets).mockResolvedValue({ completed: [], tickets: [{ id: 9, order_id: 3, number: 'DI-004', table_number: 12, service: 'dine_in', waiter: 'Sofía', note: '', fired_at: '2026-10-03T15:00:00Z', preparation_at: null, ready_at: null,
    lines: [{ id: 1, name: 'Hamburguesa', qty: 1, note: '', station: 'Plancha', options: [], ready_at: null, served_at: null }, { id: 2, name: 'Limonada', qty: 1, note: '', station: 'Barra', ready_at: null, served_at: null }] }] })
  await printFiredCourse(9)
  expect(usePrintStore.getState().sheets).toBeNull()
  writePrintSettings({ ...DEFAULT_PRINT, autoComanda: true, stations: ['Barra'] })
  await printFiredCourse(9)
  expect(usePrintStore.getState().sheets?.map((s) => s.station)).toEqual(['Barra'])
})
