import { render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { FloorPane } from '@/components/tables/FloorPane'
import type { FloorDocument } from '@/lib/domain/floorPlan'
import { messages } from '@/lib/i18n/messages'
import { readPlan } from '@/lib/services/floorPlan'
import type { Floor } from '@/lib/types'

jest.mock('@/lib/services/floorPlan', () => ({ ...jest.requireActual('@/lib/services/floorPlan'), readPlan: jest.fn() }))
// La barra de zonas pide su reparto al servidor; aquí solo importa el plano.
jest.mock('@/components/tables/FloorZones', () => ({ FloorZones: () => null }))

const floor = { id: 91, name: 'Terraza', tableIds: [], hasBackground: false } as unknown as Floor
const plan: FloorDocument = { id: 91, name: 'Terraza', revision: 1, tables: [], walls: [], images: [],
  zones: [{ id: 'z', name: 'Ventanal', color: '#3b82f6', x: 0, y: 0, width: 300, height: 200 }] }
const mount = () => render(<NextIntlClientProvider locale="es" messages={messages}>
  <FloorPane floor={floor} configId={1} views={[]} reserved={{}} selectedId={null} onSelect={jest.fn()} pickFree={false} codeFor={() => null} refreshKey={1} />
</NextIntlClientProvider>)

// Falla si al volver a Mesas el plano (zonas, paredes, imágenes) espera otra vez al servidor: antes solo las mesas salían
// enseguida y el resto «saltaba» un momento después. Debe pintarse al instante con el último conocido y releerse detrás.
it('paints the last known plan at once when the pane mounts again, and still refreshes it', async () => {
  jest.mocked(readPlan).mockResolvedValue(plan)
  const first = mount()
  expect(await screen.findByText('Ventanal')).toBeInTheDocument()
  first.unmount()

  let answer: (p: FloorDocument) => void = () => undefined
  jest.mocked(readPlan).mockReturnValue(new Promise((resolve) => { answer = resolve }))
  mount()
  expect(screen.getByText('Ventanal')).toBeInTheDocument() // sin esperar: la respuesta del servidor aún no llega
  expect(readPlan).toHaveBeenCalledTimes(2) // y aun así se relee
  answer({ ...plan, revision: 2, zones: [{ ...plan.zones[0], name: 'Ventanal nuevo' }] })
  await waitFor(() => expect(screen.getByText('Ventanal nuevo')).toBeInTheDocument())
})
