import { render, screen } from '@testing-library/react'
import { SmartExperience } from '../SmartMenu'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Screen } from '@/lib/domain/route'
import type { Entry } from '@/lib/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), useParams: () => ({ rest: 'demo', sede: 'salon' }), useSearchParams: () => null }))
jest.mock('../SmartChat', () => ({ SmartChat: () => <button type="button">Mi mesero</button> }))
jest.mock('../SmartOrder', () => ({ SmartCart: () => <p>Pedido</p>, SmartPay: () => <p>Pago</p>, SmartStatus: () => null, SmartBill: () => null }))
const initial = useDinerStore.getState()
afterEach(() => useDinerStore.setState(initial, true))

const show = (name: Screen) => render(<SmartExperience route={{ token: null, screen: name, id: null }} rest="demo" venue="salon" token={null} id={null} entry={{} as Entry} />)

// Falla si «Mi mesero» vuelve a aparecer mientras la persona paga, o si desaparece del pedido.
it('quita el muelle con «Mi mesero» en el pago y lo deja en el pedido', () => {
  useDinerStore.setState({ cart: null, session: null, account: null, error: null })
  const { unmount } = show('pago')
  expect(screen.getByText('Pago')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Mi mesero' })).not.toBeInTheDocument()
  unmount()
  show('pedido')
  expect(screen.getByRole('button', { name: 'Mi mesero' })).toBeInTheDocument()
})
