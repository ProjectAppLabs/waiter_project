import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { BillingSettings } from '@/components/billing/BillingSettings'
import { messages } from '@/lib/i18n/messages'
import { billingSettings, type BillingSettings as Settings } from '@/lib/services/invoices'

jest.mock('@/lib/services/invoices', () => ({ billingSettings: jest.fn() }))

const SETTINGS: Settings = { company: 'Burger SAS', journal: 'Ventas POS', currency: 'COP', tipProduct: 'Propina', tipAccount: 'Propina recibida para terceros (no gravada)' }
const mount = () => render(<NextIntlClientProvider locale="es" messages={messages}><BillingSettings configId={3} /></NextIntlClientProvider>)
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Configuración contable' }))

beforeEach(() => { jest.clearAllMocks() })

// Falla si se consulta la configuración antes de abrir, o si al abrir no se ve la empresa, el diario y el tratamiento
// fijo de la propina (para terceros, fuera de la base de impuestos).
it('al abrir consulta y muestra la configuración con el tratamiento de la propina', async () => {
  jest.mocked(billingSettings).mockResolvedValue(SETTINGS)
  mount()
  expect(billingSettings).not.toHaveBeenCalled()
  open()
  expect(screen.getByText('Consultando configuración…')).toBeInTheDocument()
  expect(await screen.findByText('Burger SAS · COP · Ventas POS')).toBeInTheDocument()
  expect(billingSettings).toHaveBeenCalledWith(3)
  expect(screen.getByText(/«Propina recibida para terceros \(no gravada\)»: no hacen parte de los ingresos/)).toBeInTheDocument()
})

// Falla si vuelve el selector de cuenta de propinas de la etapa con Odoo: el sistema propio no tiene cuentas que elegir
// y la pantalla decía «Cuenta guardada» sin guardar nada.
it('no ofrece elegir ni guardar una cuenta', async () => {
  jest.mocked(billingSettings).mockResolvedValue(SETTINGS)
  mount(); open()
  await screen.findByText('Burger SAS · COP · Ventas POS')
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument()
})

// Falla si un fallo al consultar no se avisa o si «Reintentar» no vuelve a consultar.
it('si no carga, avisa y deja reintentar', async () => {
  jest.mocked(billingSettings).mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(SETTINGS)
  mount(); open()
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos consultar la configuración.')
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('Burger SAS · COP · Ventas POS')).toBeInTheDocument()
  expect(billingSettings).toHaveBeenCalledTimes(2)
})

// Falla si sin diario se muestra vacío o si sin producto de propinas se describe un tratamiento que no aplica.
it('sin diario ni producto de propinas lo dice', async () => {
  jest.mocked(billingSettings).mockResolvedValue({ ...SETTINGS, journal: '', tipProduct: '' })
  mount(); open()
  expect(await screen.findByText('Burger SAS · COP · Diario de ventas pendiente')).toBeInTheDocument()
  expect(screen.getByText('Este POS no tiene producto de propinas configurado.')).toBeInTheDocument()
  expect(screen.queryByText(/no hacen parte de los ingresos/)).not.toBeInTheDocument()
})

// Falla si cerrar el modal deja la consulta pintando sobre un modal cerrado o si no se puede cerrar.
it('se cierra y una respuesta tardía no rompe nada', async () => {
  let resolve!: (s: Settings) => void
  jest.mocked(billingSettings).mockReturnValue(new Promise((r) => { resolve = r }))
  mount(); open()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByText('Consultando configuración…')).not.toBeInTheDocument()
  await act(async () => resolve(SETTINGS))
  expect(screen.queryByText(/Burger SAS/)).not.toBeInTheDocument()
})
