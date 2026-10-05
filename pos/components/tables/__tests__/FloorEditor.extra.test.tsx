import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { FloorEditor } from '@/components/tables/FloorEditor'
import type { FloorDocument } from '@/lib/domain/floorPlan'
import { savePlan } from '@/lib/services/floorPlan'
import { useAuthStore } from '@/lib/stores/authStore'

jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: { getState: jest.fn() } }))
jest.mock('@/lib/services/floorPlan', () => ({ savePlan: jest.fn() }))

const initial: FloorDocument = { id: 1, name: 'Sala', revision: 0, walls: [], zones: [], tables: [
  { id: 1, key: '1', number: 1, seats: 6, zone: '', x: 40, y: 40, width: 120, height: 240 },
  { id: 2, key: '2', number: 2, seats: 4, zone: '', x: 200, y: 40, width: 120, height: 120 },
] }
// La cámara arranca en (50, 50) con zoom 0,8: un punto de pantalla (x, y) cae en ((x-50)/0,8, (y-50)/0,8) del plano.
function mount(plan: FloorDocument = initial, background?: string) {
  const onSaved = jest.fn(async () => {})
  render(<FloorEditor initial={plan} background={background} configId={1} onCancel={jest.fn()} onSaved={onSaved} />)
  const svg = screen.getByLabelText('Cuadrícula del restaurante')
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, x: 0, y: 0, toJSON: () => null })
  return { svg, onSaved }
}
const selected = () => screen.getByRole('button', { name: 'Mover elemento seleccionado' })
const lastSent = () => (savePlan as jest.Mock).mock.calls.at(-1)[1] as FloorDocument

class FakeImage { onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 1000; naturalHeight = 500; set src(_v: string) { setTimeout(() => this.onload?.()) } }
// Muchas consultas por rol sobre un lienzo grande: con la máquina cargada pasan de los 5 s por defecto.
jest.setTimeout(30_000)
const realImage = window.Image
beforeEach(() => {
  Object.defineProperty(window, 'PointerEvent', { value: MouseEvent, configurable: true })
  SVGElement.prototype.setPointerCapture = jest.fn()
  jest.clearAllMocks()
  ;(savePlan as jest.Mock).mockImplementation(async (_c: number, p: FloorDocument) => p)
  ;(useAuthStore.getState as jest.Mock).mockReturnValue({ employee: { id: 1 } })
})
afterEach(() => { window.Image = realImage })

// Falla si la rueda del ratón no acerca el plano alrededor del puntero, o si los botones Acercar/Alejar no cambian
// el porcentaje que se ve.
it('acerca con la rueda y con los botones de zoom', () => {
  const { svg } = mount()
  fireEvent.wheel(svg, { deltaY: -500, clientX: 50, clientY: 50 })
  const zoom = Number(svg.getAttribute('data-camera-zoom'))
  expect(zoom).toBeCloseTo(0.8 * Math.exp(0.5))
  // El punto bajo el puntero (el origen de la cámara) no se mueve al acercar.
  expect(Number(svg.getAttribute('data-camera-x'))).toBeCloseTo(50)
  expect(screen.getByText(`${Math.round(zoom * 100)}%`)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Alejar' }))
  expect(Number(svg.getAttribute('data-camera-zoom'))).toBeCloseTo(zoom / 1.2)
  fireEvent.click(screen.getByRole('button', { name: 'Acercar' }))
  fireEvent.click(screen.getByRole('button', { name: 'Acercar' }))
  expect(Number(svg.getAttribute('data-camera-zoom'))).toBeCloseTo(zoom * 1.2)
})

// Falla si agregar una mesa desde la paleta no la pone en el centro de la vista con el siguiente número, si
// Deshacer no la quita, o si Rehacer (botón, Ctrl+Y o Ctrl+Mayús+Z) no la devuelve.
it('agrega una mesa al centro y la deshace y rehace', async () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Mesa pequeña' }))
  expect(screen.getByRole('button', { name: 'Mesa 3, 4 personas' })).toBeInTheDocument()
  expect(selected()).toHaveAttribute('x', '500')
  expect(selected()).toHaveAttribute('y', '380')
  expect(screen.getByRole('button', { name: 'Rehacer' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
  expect(screen.queryByRole('button', { name: 'Mesa 3, 4 personas' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Rehacer' }))
  expect(screen.getByRole('button', { name: 'Mesa 3, 4 personas' })).toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
  expect(screen.getByRole('button', { name: 'Mesa 3, 4 personas' })).toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(savePlan).toHaveBeenCalled())
  expect(lastSent().tables).toEqual([...initial.tables, expect.objectContaining({ id: null, number: 3, seats: 4, x: 500, y: 380, width: 120, height: 120 })])
})

// Falla si soltar la esquina de tamaño no agranda la mesa ajustada a la cuadrícula, o si el cambio no se puede deshacer.
it('cambia el tamaño de una mesa con la esquina y se deshace en un paso', () => {
  const { svg } = mount()
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar capa: Mesa 2' }))
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Cambiar tamaño' }), { clientX: 100, clientY: 100 })
  fireEvent.pointerMove(svg, { clientX: 180, clientY: 116 })
  fireEvent.pointerUp(svg, { clientX: 180, clientY: 116 })
  expect(selected()).toHaveAttribute('width', '220')
  expect(selected()).toHaveAttribute('height', '140')
  fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
  expect(selected()).toHaveAttribute('width', '120')
})

// Falla si un arrastre interrumpido por el sistema (pointercancel) deja la mesa a medio mover en vez de devolverla.
it('un arrastre cancelado devuelve la mesa a su sitio', () => {
  const { svg } = mount()
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Mesa 2, 4 personas' }), { clientX: 300, clientY: 100 })
  fireEvent.pointerMove(svg, { clientX: 460, clientY: 100 })
  expect(selected()).toHaveAttribute('x', '400')
  fireEvent.pointerCancel(svg, { clientX: 460, clientY: 100 })
  expect(selected()).toHaveAttribute('x', '200')
  expect(screen.getByRole('button', { name: 'Deshacer' })).toBeDisabled()
})

// Falla si dibujar una pared o una zona no las crea donde se arrastró, si la zona no recoge las mesas que quedan dentro,
// o si tocar luego la pared o la zona en el lienzo no las selecciona para editarlas.
it('dibuja una pared y una zona, y se seleccionan tocándolas en el lienzo', async () => {
  const { svg } = mount()
  fireEvent.keyDown(window, { key: 'p' })
  fireEvent.pointerDown(svg, { clientX: 450, clientY: 450 })
  fireEvent.pointerMove(svg, { clientX: 530, clientY: 466 })
  fireEvent.pointerUp(svg, { clientX: 530, clientY: 466 })
  expect(screen.getByRole('button', { name: 'Seleccionar capa: Pared 1' })).toHaveAttribute('aria-pressed', 'true')
  expect(selected()).toHaveAttribute('x', '500')
  expect(selected()).toHaveAttribute('width', '100')
  expect(screen.getByRole('button', { name: 'Seleccionar elementos' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.keyDown(window, { key: 'z' })
  fireEvent.pointerDown(svg, { clientX: 34, clientY: 34 })
  fireEvent.pointerMove(svg, { clientX: 354, clientY: 290 })
  fireEvent.pointerUp(svg, { clientX: 354, clientY: 290 })
  expect(screen.getByRole('button', { name: 'Seleccionar capa: Zona Zona 1' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Pared' }), { clientX: 470, clientY: 460 })
  fireEvent.pointerUp(svg, { clientX: 470, clientY: 460 })
  expect(screen.getByRole('button', { name: 'Seleccionar capa: Pared 1' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Zona Zona 1' }), { clientX: 60, clientY: 60 })
  fireEvent.pointerUp(svg, { clientX: 60, clientY: 60 })
  expect(screen.getByRole('button', { name: 'Seleccionar capa: Zona Zona 1' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(savePlan).toHaveBeenCalled())
  const sent = lastSent()
  // Al guardar, el plano se recoloca para que empiece en el origen: se comparan posiciones relativas a la mesa 2.
  const t2 = sent.tables.find((t) => t.key === '2')!
  expect(sent.walls).toEqual([expect.objectContaining({ width: 100, height: 20 })])
  expect([sent.walls[0].x - t2.x, sent.walls[0].y - t2.y]).toEqual([300, 460])
  expect(sent.zones).toEqual([expect.objectContaining({ name: 'Zona 1' })])
  expect(sent.zones[0].x + sent.zones[0].width).toBeGreaterThanOrEqual(t2.x + t2.width)
  expect(sent.tables.find((t) => t.key === '2')!.zone).toBe(sent.zones[0].id)
})

// Falla si tocar una pieza de decoración en el lienzo no la selecciona o si arrastrarla no la mueve.
it('selecciona y mueve una pieza de decoración desde el lienzo', () => {
  const { svg } = mount()
  fireEvent.click(screen.getByRole('button', { name: 'Agregar Escalera' }))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByText('Pieza seleccionada')).toBeNull()
  const x = Number(screen.getByRole('button', { name: 'Escalera' }).getAttribute('transform')!.match(/translate\(([^ ]+)/)![1])
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Escalera' }), { clientX: 500, clientY: 400 })
  fireEvent.pointerMove(svg, { clientX: 532, clientY: 400 })
  fireEvent.pointerUp(svg, { clientX: 532, clientY: 400 })
  expect(screen.getByText('Pieza seleccionada')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Escalera' })).toHaveAttribute('transform', expect.stringContaining(`translate(${x + 40} `))
})

// Falla si «Ocultar panel» no cierra el panel ni suelta la selección.
it('ocultar el panel suelta la selección', () => {
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar capa: Mesa 1' }))
  expect(screen.getByRole('region', { name: 'Elemento seleccionado' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Ocultar panel/ }))
  expect(screen.queryByRole('region', { name: 'Elemento seleccionado' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Mover elemento seleccionado' })).toBeNull()
})

// Falla si se acepta un archivo que no es PNG ni JPG, si la primera imagen no pasa a ser la de referencia del piso,
// o si la segunda no se mide para conservar su proporción y no se agrega como imagen adicional seleccionada.
it('sube la imagen de referencia y una adicional con su proporción', async () => {
  window.Image = FakeImage as unknown as typeof Image
  mount()
  const input = () => screen.getByLabelText(/^Imagen de referencia/)
  fireEvent.change(input(), { target: { files: [new File(['hola'], 'notas.txt', { type: 'text/plain' })] } })
  expect(screen.getByRole('alert')).toHaveTextContent('Usa una imagen PNG o JPG de hasta 10 MB.')
  fireEvent.change(input(), { target: { files: [new File([new Uint8Array(8)], 'plano.png', { type: 'image/png' })] } })
  expect(await screen.findByRole('button', { name: 'Seleccionar capa: Imagen de referencia' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByText('Agregar otra imagen')).toBeInTheDocument()
  await act(async () => { fireEvent.change(input(), { target: { files: [new File([new Uint8Array(8)], 'patio.jpg', { type: 'image/jpeg' })] } }) })
  expect(await screen.findByRole('button', { name: 'Seleccionar capa: Imagen 2' })).toHaveAttribute('aria-pressed', 'true')
  expect(selected()).toHaveAttribute('width', '800')
  expect(selected()).toHaveAttribute('height', '400')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(savePlan).toHaveBeenCalled())
  const sent = lastSent()
  expect(sent.background).toEqual(expect.any(String))
  expect(sent.images).toEqual([expect.objectContaining({ width: 800, height: 400 })])
})

// Falla si con la imagen de referencia y las 8 adicionales todavía se puede subir otra.
it('no deja pasar del máximo de imágenes por piso', () => {
  const images = Array.from({ length: 8 }, (_, i) => ({ id: `i${i}`, data: 'AAAA', x: 0, y: 1000 + i * 100, width: 100, height: 100 }))
  mount({ ...initial, images }, '/plano.png')
  expect(screen.getByLabelText(/^Imagen de referencia/)).toBeDisabled()
  expect(screen.getByText('Llegaste al máximo de imágenes. Quita una para agregar otra.')).toBeInTheDocument()
})

// Falla si un error del servidor que no es de PIN se traga en silencio o deja el editor bloqueado en «Guardando…».
it('muestra el error del servidor al guardar y deja reintentar', async () => {
  ;(savePlan as jest.Mock).mockRejectedValueOnce(new Error('El plano cambió en otra caja.'))
  const { onSaved } = mount()
  fireEvent.change(screen.getByLabelText('Nombre del piso'), { target: { value: 'Sala nueva' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('El plano cambió en otra caja.')
  expect(onSaved).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
})
