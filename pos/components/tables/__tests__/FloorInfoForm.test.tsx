import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { useState } from 'react'

import { FloorInfoForm, type FloorInfo } from '@/components/tables/FloorInfoForm'
import { messages } from '@/lib/i18n/messages'
import { toast } from '@/lib/stores/toastStore'

jest.mock('@/lib/stores/toastStore', () => ({ toast: jest.fn() }))

const empty: FloorInfo = { number: '', type: 'indoor', background: undefined, preview: null }
let last: FloorInfo = empty
function Host({ initial = empty, edit = false }: { initial?: FloorInfo; edit?: boolean }) {
  const [value, setValue] = useState(initial)
  return <NextIntlClientProvider locale="es" messages={messages}><FloorInfoForm value={value} edit={edit} onChange={(v) => { last = v; setValue(v) }} /></NextIntlClientProvider>
}
const png = (bytes = 10) => new File([new Uint8Array(bytes)], 'plano.png', { type: 'image/png' })

beforeEach(() => { jest.clearAllMocks(); last = empty })
afterEach(() => { jest.useRealTimers() })

// Falla si escribir el número o elegir Exterior no llega al valor del formulario, o si el radio marcado no sigue la elección.
it('cambia el número y el tipo de piso', () => {
  render(<Host />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Número de piso' }), { target: { value: '3' } })
  expect(last.number).toBe('3')
  fireEvent.click(screen.getByRole('radio', { name: 'Exterior' }))
  expect(last.type).toBe('outdoor')
  expect(screen.getByRole('radio', { name: 'Exterior' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByRole('radio', { name: 'Interior' })).toHaveAttribute('aria-checked', 'false')
})

// Falla si al editar un piso existente aparece la subida de plano (solo existe al crearlo).
it('en modo edición no ofrece subir el plano', () => {
  render(<Host edit />)
  expect(screen.queryByLabelText('Sube tu plano')).toBeNull()
  expect(screen.getByRole('textbox', { name: 'Número de piso' })).toBeInTheDocument()
})

// Falla si una imagen de más de 10 MB se acepta en vez de avisar, o si se lee igualmente.
it('rechaza una imagen de más de 10 MB con un aviso', () => {
  render(<Host />)
  const big = png(); Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 })
  fireEvent.change(screen.getByLabelText('Sube tu plano'), { target: { files: [big] } })
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'La imagen supera los 10 MB.', tone: 'danger' }))
  expect(last.background).toBeUndefined()
})

// Falla si el plano subido no guarda su base64 sin cabecera, si «Analizando tu plano» no aparece ni se va solo,
// si la vista previa no se muestra, o si «Quitar imagen» deja el fondo puesto.
it('lee la imagen, muestra el análisis 1,5 s, la vista previa y permite quitarla', async () => {
  jest.useFakeTimers()
  render(<Host />)
  fireEvent.change(screen.getByLabelText('Sube tu plano'), { target: { files: [png()] } })
  await act(async () => { await jest.advanceTimersByTimeAsync(20) })
  expect(screen.getByRole('status')).toHaveTextContent('Analizando tu plano')
  expect(last.preview).toMatch(/^data:image\/png;base64,/)
  expect(last.background).toBe(last.preview!.split(',')[1])
  act(() => { jest.advanceTimersByTime(1_500) })
  expect(screen.queryByRole('status')).toBeNull()
  expect(document.querySelector('img')).toHaveAttribute('src', last.preview)
  fireEvent.click(screen.getByRole('button', { name: 'Quitar imagen' }))
  expect(last).toMatchObject({ background: null, preview: null })
  expect(document.querySelector('img')).toBeNull()
})

// Falla si cancelar el selector de archivos (sin archivo) cambia el valor o lanza un error.
it('no hace nada si no se elige archivo', () => {
  render(<Host />)
  fireEvent.change(screen.getByLabelText('Sube tu plano'), { target: { files: [] } })
  expect(last).toBe(empty)
  expect(toast).not.toHaveBeenCalled()
})

// Falla si tocar el recuadro grande no abre el selector de archivos.
it('el recuadro de subida abre el selector de archivos', () => {
  render(<Host />)
  const input = screen.getByLabelText('Sube tu plano') as HTMLInputElement
  const click = jest.spyOn(input, 'click').mockImplementation(() => {})
  fireEvent.click(screen.getByText('Toca aquí'))
  expect(click).toHaveBeenCalled()
})
