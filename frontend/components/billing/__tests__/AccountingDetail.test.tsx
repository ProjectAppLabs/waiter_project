import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { AccountingDetail } from '@/components/billing/AccountingDetail'
import { messages } from '@/lib/i18n/messages'
import { coreFetch } from '@/lib/services/core/http'

jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)

// Detalle contable tal como lo entrega el servidor (billing/api.py): `untaxed` es la base sin impuestos y ya deja fuera
// la propina, que va aparte y sin impuestos.
const detail = {
  ready: true, issues: [], company: 'Burger House SAS', journal: 'SETP', date: '2026-10-08', origin: 'DI-001', currency: 'COP',
  company_currency: 'COP', untaxed: 92000, tax: 8000, total: 110000, residual: 0, tip: 10000, debit: 110000, credit: 110000, original: '',
  lines: [], taxes: [{ id: 1, name: '8% INC', amount: 8000 }],
}

// Falla si la venta neta del detalle contable vuelve a restar la propina: con 92.000 de base y 10.000 de propina mostraba
// 82.000 y las cifras de la ficha (venta + impuestos + propina) dejaban de sumar el total.
it('muestra la venta neta sin restar otra vez la propina', async () => {
  m.mockResolvedValue(detail)
  render(<NextIntlClientProvider locale="es" messages={messages}><AccountingDetail invoiceId={5} /></NextIntlClientProvider>)
  const net = (await screen.findByText('Venta neta sin impuestos')).parentElement
  expect(m).toHaveBeenCalledWith('documents/5/detail')
  expect(net).toHaveTextContent('COP 92.000')
})
