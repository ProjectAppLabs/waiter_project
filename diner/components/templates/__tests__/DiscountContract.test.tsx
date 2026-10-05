import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { CART_LAYOUTS } from '@/components/templates/registry'
import { GenericCart } from '@/components/templates/generic/GenericCart'
import { AccountHome } from '@/components/templates/generic/AccountHome'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import { useDinerStore } from '@/lib/stores/dinerStore'
import messages from '@/lib/i18n/messages/es.json'
import type { TemplateFamily } from '@/lib/types'

const account = { id: 'a', nombre: 'Ana', correo: 'ana@example.com', verificada: true }
const wrap = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
afterEach(cleanup)

// Falla si alguna plantilla no resta el descuento verificado del total o invita a registrarse a quien ya tiene cuenta.
it.each(['A', 'B', 'C', 'D', 'E', 'F', 'generic'])('%s: verified projected discount reduces the gross cart without inviting registration', (family) => {
  useDinerStore.setState({ account, entry: null })
  const Layout = family === 'generic' ? GenericCart : (CART_LAYOUTS[family as TemplateFamily] ?? GenericCart)
  const discount = { porcentaje: 5, monto: 500, aplicable: true, aplicado: false, registrado: true }
  wrap(<Layout template={{ ...DEFAULT_TEMPLATE, codigo: family === 'generic' ? 'B1' : `${family}1`, familia: (family === 'generic' ? 'B' : family) as TemplateFamily }}
    cart={{ sesion: 's', total: 10000, mio: 10000, por_comensal: [], descuento: discount, lineas: [{ id: 1, comensal: 'a', mio: true, producto_id: 3, nombre: 'Plato', precio: 10000, cantidad: 1, nota: '', subtotal: 10000 }] }}
    discount={discount} busy={false} error={null} setQty={jest.fn()} remove={jest.fn()} confirm={jest.fn()} goPay={jest.fn()} goMenu={jest.fn()} retry={jest.fn()}
    hrefs={{ home: '/h', menu: '/m', pay: '/p', table: '/t', signup: '/signup' }} />)
  expect(screen.getByText('$ 9.500')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Regístrate/ })).toBeNull()
})

// Falla si el ahorro acumulado se suma como porcentaje o se trunca en vez de mostrarse en pesos.
it('adds savings as money, including amounts larger than 100', () => {
  wrap(<AccountHome account={account} orders={[{ id: 'o', fecha: '', local: 'Local', mesa: 1, items: 1, total: 83430.9, estado: 'pagado', descuento: 4391.1 }]} discountPct={5} discountUsed onSignup={jest.fn()} onLogout={jest.fn()} busy={false} />)
  expect(screen.getByText('$ 4.391')).toBeInTheDocument()
})
