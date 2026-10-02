import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { Receipt } from '@/components/pay/Receipt'
import { messages } from '@/lib/i18n/messages'
import { resetIssuerCache } from '@/lib/services/issuer'
import { getCompany } from '@/lib/services/settings'
import type { ReceiptData } from '@/lib/stores/orderStore'

jest.mock('@/lib/services/settings', () => ({ getCompany: jest.fn() }))

const data: ReceiptData = {
  company: 'Burger House', tableNumber: 8, reference: 'TA423', at: Date.parse('2026-09-23T05:49:00Z'),
  lines: [{ uuid: 'l1', name: 'Salsa de la casa', qty: 1, unitPrice: 3500, total: 4165 }],
  subtotal: 3500, tax: 665, tip: 0, total: 4165,
  payments: [{ method: 'Efectivo', amount: 4165, reference: '' }], change: 5835,
}

beforeEach(() => {
  resetIssuerCache()
  ;(getCompany as jest.Mock).mockResolvedValue({ id: 1, name: 'Burger House', vat: '900.123.456-7', phone: '(604) 444 5566', email: '', street: 'Cra 43A #5-15', city: 'Medellín' })
})

const show = () => render(<NextIntlClientProvider locale="es" messages={messages}><Receipt data={data} onClose={jest.fn()} /></NextIntlClientProvider>)

// Falla si el papel vuelve a llamarse "comprobante" o recupera cualquier aviso fiscal: el dueño los quitó
// los dos (decisión del 2026-09-23).
it('is titled as a cuenta de cobro and carries no fiscal disclaimer', async () => {
  show()
  expect(await screen.findByLabelText('Cuenta de cobro')).toBeInTheDocument()
  expect(screen.queryByText(/DIAN/)).not.toBeInTheDocument()
  expect(screen.queryByText(/no reemplaza la factura electrónica/)).not.toBeInTheDocument()
})

// Falla si el papel vuelve al modelo gringo de sumar el impuesto al final. En Colombia el precio ya lo
// lleva dentro: la línea se cobra por 4.165, la columna suma el total, y el IVA se declara sin sumarse.
it('prints Colombian style: prices with VAT inside and the VAT only declared', async () => {
  show()
  const doc = await screen.findByLabelText('Cuenta de cobro')
  const shown = [...doc.querySelectorAll('li span')].map((s) => s.textContent)
  expect(shown).toContain('4.165')
  expect(shown).not.toContain('3.500')
  expect(screen.getByText('Total').parentElement).toHaveTextContent('4.165')
  expect(screen.getByText('IVA incluido (19%)').parentElement).toHaveTextContent('665')
  expect(screen.queryByText('Subtotal')).not.toBeInTheDocument()
})

// Falla si el emisor deja de imprimirse: sin NIT ni dirección el papel no sirve como cuenta de cobro.
it('prints the issuer identification once it is loaded', async () => {
  show()
  expect(await screen.findByText(/900\.123\.456-7/)).toBeInTheDocument()
  expect(screen.getByText(/Cra 43A #5-15/)).toBeInTheDocument()
  expect(screen.getByText('Burger House')).toBeInTheDocument()
})

// Falla si el restaurante no tiene NIT cargado y el documento revienta o miente: debe imprimirse igual.
it('still prints when the restaurant has no tax id yet', async () => {
  ;(getCompany as jest.Mock).mockRejectedValue(new Error('sin permiso'))
  show()
  expect(await screen.findByLabelText('Cuenta de cobro')).toBeInTheDocument()
  expect(screen.getByText('Burger House')).toBeInTheDocument()
})

// Falla si la marca desaparece del papel: el dueño la pidió impresa arriba o abajo, y es tipográfica a
// propósito (un logo ráster sale con bandas en la térmica).
it('closes with the Waiter wordmark', async () => {
  show()
  expect(await screen.findByText('Waiter.')).toBeInTheDocument()
  expect(screen.getByText('by ProjectApp')).toBeInTheDocument()
})

// Falla si la propina se mezcla con el consumo: al cliente hay que mostrarle por separado qué comió y qué
// dejó de propina, y que el total es la suma de ambos.
it('separates the tip from the consumption when there is one', async () => {
  const conPropina: ReceiptData = { ...data, tip: 5000, total: 9165, payments: [{ method: 'Efectivo', amount: 9165, reference: '' }], change: 0 }
  render(<NextIntlClientProvider locale="es" messages={messages}><Receipt data={conPropina} onClose={jest.fn()} /></NextIntlClientProvider>)
  expect(await screen.findByText('Consumo')).toBeInTheDocument()
  expect(screen.getByText('Consumo').parentElement).toHaveTextContent('4.165')
  expect(screen.getByText('Propina').parentElement).toHaveTextContent('5.000')
  expect(screen.getByText('Total').parentElement).toHaveTextContent('9.165')
})

// Falla si el papel inventa un porcentaje cuando la carta mezcla tarifas (IVA 19 % con INC 8 %, exentos):
// entonces no hay una sola tarifa que declarar y debe decir "Impuestos incluidos" a secas (ni IVA ni INC).
it('does not invent a rate when the bill mixes tax rates', async () => {
  const mezclado: ReceiptData = { ...data, tax: 500, subtotal: 3665 }
  render(<NextIntlClientProvider locale="es" messages={messages}><Receipt data={mezclado} onClose={jest.fn()} /></NextIntlClientProvider>)
  expect(await screen.findByText('Impuestos incluidos')).toBeInTheDocument()
  expect(screen.queryByText(/incluido \(/)).not.toBeInTheDocument()
})

// Falla si un restaurante con INC 8 % imprime «IVA»: el papel debe nombrar el impuesto que de verdad lleva la carta (T4).
it('names INC when the rate is 8 %', async () => {
  render(<NextIntlClientProvider locale="es" messages={messages}><Receipt data={{ ...data, lines: [{ ...data.lines[0], qty: 1, unitPrice: 10800, total: 10800 }], total: 10800, tax: 800, tip: 0, subtotal: 10000 }} onClose={jest.fn()} /></NextIntlClientProvider>)
  expect(await screen.findByText('INC incluido (8%)')).toBeInTheDocument()
})
