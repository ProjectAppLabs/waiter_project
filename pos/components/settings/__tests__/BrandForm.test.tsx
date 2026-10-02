import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { BrandForm } from '@/components/settings/BrandForm'
import { resizeImage } from '@/lib/domain/image'
import messages from '@/lib/i18n/messages/es.json'
import { CoreError } from '@/lib/services/core/http'
import { getBrand, getBrandLogo, saveBrand, type BrandInfo } from '@/lib/services/settings'

jest.mock('@/lib/services/settings', () => ({ getBrand: jest.fn(), getBrandLogo: jest.fn(), saveBrand: jest.fn() }))
jest.mock('@/lib/domain/image', () => ({ ...jest.requireActual('@/lib/domain/image'), resizeImage: jest.fn() }))
const mGet = getBrand as jest.Mock
const mLogo = getBrandLogo as jest.Mock
const mSave = saveBrand as jest.Mock
const mResize = resizeImage as jest.Mock
const BRAND: BrandInfo = { companyId: 1, color: '#7A2E2A', font: 'Lora', radius: '14', tagline: 'Cocina de barrio', greeting: '', waiterName: 'Alex', welcome: '', hasLogo: true }
const PNG = 'iVBORw0KGgoAAAANSUhEUg=='

const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><BrandForm restaurantName="La Provincia" /></NextIntlClientProvider>)
const upload = (file: File) => fireEvent.change(screen.getByLabelText('Subir logo'), { target: { files: [file] } })
beforeEach(() => { mGet.mockReset().mockResolvedValue(BRAND); mLogo.mockReset().mockResolvedValue(PNG); mSave.mockReset().mockResolvedValue(undefined); mResize.mockReset() })
afterEach(() => jest.restoreAllMocks())

// Falla si el formulario no refleja lo guardado en el servidor (color, fuente, redondeo, textos, logo) o pinta el logo como PNG sin serlo.
it('renders the saved brand, its contrast readout and the current logo', async () => {
  wrap()
  expect(await screen.findByLabelText('Código hex')).toHaveValue('#7A2E2A')
  expect(screen.getByLabelText('Tipografía de títulos')).toHaveValue('Lora')
  expect(screen.getByRole('button', { name: 'Suave 14' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByLabelText('Lema')).toHaveValue('Cocina de barrio')
  expect(screen.getByText('Contraste 9.33:1 · texto blanco')).toBeInTheDocument()
  expect(await screen.findByAltText('Logo actual')).toHaveAttribute('src', `data:image/png;base64,${PNG}`)
  expect(document.getElementById('waiter-brand-fonts')).toHaveAttribute('href', expect.stringContaining('Cormorant+Garamond'))
})

// Falla si la ayuda o el contador vuelven a entrar en el nombre accesible del campo («Lema Aparece en… 4/40») en vez
// de quedar como descripción, o si el contador deja de anunciarse al escribir.
it('keeps hints and counters out of the accessible name and exposes them as descriptions', async () => {
  wrap()
  const waiter = await screen.findByLabelText('Nombre del mesero')
  expect(waiter).toHaveAccessibleName('Nombre del mesero')
  expect(waiter).toHaveAccessibleDescription('Aparece en la línea «Soy Alex, tu mesero» 4/40')
  expect(screen.getByLabelText('Bienvenida')).toHaveAccessibleDescription(/Si la dejas vacía, no se muestra la línea del mesero/)
  expect(screen.getByText('4/40')).toHaveAttribute('aria-live', 'polite')
  expect(screen.getByLabelText('Saludo')).toHaveAttribute('placeholder', 'Según la hora: Buenos días / tardes / noches')
})

// Falla si un color sin contraste (#808080 queda en 4.49:1) deja guardar, o si la lectura no se actualiza al cambiar el color.
it('updates the contrast readout and blocks saving on a color below 4.5:1', async () => {
  wrap()
  const hex = await screen.findByLabelText('Código hex')
  fireEvent.change(hex, { target: { value: '#808080' } })
  expect(screen.getByRole('alert')).toHaveTextContent('Este color no alcanza 4.5:1 con ningún texto')
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  fireEvent.change(hex, { target: { value: '#2f7a4f' } })
  expect(screen.getByText('Contraste 5.23:1 · texto blanco')).toBeInTheDocument()
  expect(hex).toHaveValue('#2F7A4F')
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  fireEvent.change(hex, { target: { value: '#7A2E' } })
  expect(screen.getByRole('alert')).toHaveTextContent('Escribe un color como #7A2E2A.')
})

// Falla si el campo hex no se marca inválido ni se describe con la lectura de contraste (un lector de pantalla no sabría por qué no guarda).
it('marks the hex field invalid and describes it with the readout', async () => {
  wrap()
  const hex = await screen.findByLabelText('Código hex')
  expect(hex).toHaveAttribute('aria-invalid', 'false')
  expect(hex).toHaveAccessibleDescription('Contraste 9.33:1 · texto blanco')
  fireEvent.change(hex, { target: { value: '#808080' } })
  expect(hex).toHaveAttribute('aria-invalid', 'true')
  expect(hex).toHaveAccessibleDescription(/no alcanza 4.5:1/)
})

// Falla si un color que pasa con su tinta pero queda tenue como texto sobre el crema (#F2C94C, 1.5:1) no avisa, si el
// aviso bloquea el guardado, o si la vista previa no pinta «Ver todos» con el color tal cual, que es lo que ve el comensal.
it('warns in amber when the color reads poorly as link text on the cream background without blocking', async () => {
  wrap()
  const hex = await screen.findByLabelText('Código hex')
  fireEvent.change(hex, { target: { value: '#F2C94C' } })
  expect(screen.getByText('Como texto sobre el fondo claro este color contrasta 1.5:1; se verá tenue en enlaces')).toHaveClass('text-pending-ink')
  expect(screen.getByText('Contraste 11.16:1 · texto oscuro')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
  expect(screen.getByText('Ver todos')).toHaveStyle({ color: '#F2C94C' })
  fireEvent.change(hex, { target: { value: '#7A2E2A' } })
  expect(screen.queryByText(/se verá tenue/)).not.toBeInTheDocument()
})

// Falla si la vista previa enseña la línea del mesero sin bienvenida (el comensal no la muestra), si con nombre y
// bienvenida no arma «Soy X, tu mesero. …», o si sin nombre no deja la bienvenida sola.
it('shows the waiter line only with a welcome, like the diner home', async () => {
  wrap()
  await screen.findByLabelText('Código hex')
  const preview = within(screen.getByRole('complementary', { name: 'Vista previa' }))
  expect(preview.queryByText(/tu mesero/)).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Bienvenida'), { target: { value: 'Pide sin prisa.' } })
  expect(preview.getByText('Soy Alex, tu mesero. Pide sin prisa.')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Nombre del mesero'), { target: { value: '' } })
  expect(preview.getByText('Pide sin prisa.')).toBeInTheDocument()
  expect(preview.queryByText(/tu mesero/)).not.toBeInTheDocument()
  expect(preview.getByText(/Así se ve la portada en el celular\. Lo que dejes vacío/)).toBeInTheDocument()
})

// Falla si con nombre y bienvenida vacíos la vista previa no usa el ejemplo del diseño ni lo dice, o si el saludo
// vacío no se calcula por hora como hace el comensal (a las 9 es «Buenos días»).
it('falls back to the design sample line and the hourly greeting when the texts are empty', async () => {
  jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9)
  mGet.mockResolvedValue({ ...BRAND, waiterName: '', welcome: '' })
  wrap()
  await screen.findByLabelText('Código hex')
  expect(screen.getByText('Soy Alex, tu mesero. ¿Qué te provoca hoy?')).toBeInTheDocument()
  expect(screen.getByText(/la línea del mesero es la del ejemplo/)).toBeInTheDocument()
  expect(screen.getByText('Buenos días')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Saludo'), { target: { value: 'Hola' } })
  expect(screen.getByText('Hola')).toBeInTheDocument()
  expect(screen.queryByText('Buenos días')).not.toBeInTheDocument()
})

// Falla si guardar no manda los valores editados tal cual (sin tocar el logo) o si la pantalla no confirma.
it('saves the edited fields without touching the logo and confirms', async () => {
  wrap()
  fireEvent.change(await screen.findByLabelText('Lema'), { target: { value: 'Cocina de barrio E2E' } })
  fireEvent.click(screen.getByRole('button', { name: 'Recto 4' }))
  fireEvent.change(screen.getByLabelText('Tipografía de títulos'), { target: { value: 'Fraunces' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(mSave).toHaveBeenCalledWith({ ...BRAND, tagline: 'Cocina de barrio E2E', radius: '4', font: 'Fraunces' }, undefined))
  expect(await screen.findByRole('status')).toHaveTextContent('Guardado')
})

// Falla si el motivo que da el servidor al rechazar el guardado se pierde tras el mensaje estándar, si un AccessError (el
// usuario no es gerente del POS) no se dice con palabras propias, o si un fallo sin mensaje del servidor no cae en el estándar.
it('shows the real save error from el servidor and a plain message for access errors', async () => {
  wrap()
  await screen.findByLabelText('Código hex')
  mSave.mockRejectedValueOnce(new CoreError(400, 'validation_error', 'El color de acción debe ser #RRGGBB, por ejemplo #7A2E2A.'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('El color de acción debe ser #RRGGBB, por ejemplo #7A2E2A.')
  mSave.mockRejectedValueOnce(new CoreError(403, 'forbidden', 'You are not allowed to modify this document'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('Solo un administrador puede cambiar la marca')).toHaveAttribute('role', 'alert')
  mSave.mockRejectedValueOnce(new Error('Network Error'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByText('No se pudo completar. Intenta de nuevo.')).toBeInTheDocument()
  expect(mGet).toHaveBeenCalledTimes(1)
})

// Falla si un el servidor sin los campos brand_* (addon sin actualizar) deja la sección en blanco en vez de avisar.
it('shows the standard error when the brand cannot be read', async () => {
  mGet.mockRejectedValue(new Error('Invalid field brand_color'))
  wrap()
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar')
  expect(screen.queryByLabelText('Código hex')).not.toBeInTheDocument()
})

// Falla si un SVG (XSS al servirlo inline) o un archivo de más de 1 MB llega a resizeImage en vez de rechazarse con
// su mensaje, o si el error no queda como descripción del campo de archivo.
it('rejects an SVG and a file over 1 MB before reading them', async () => {
  wrap()
  await screen.findByLabelText('Código hex')
  upload(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Solo PNG o JPEG.')
  expect(screen.getByLabelText('Subir logo')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('Subir logo')).toHaveAccessibleDescription('Solo PNG o JPEG.')
  upload(new File([new Uint8Array(1024 * 1024 + 1)], 'big.png', { type: 'image/png' }))
  expect(screen.getByRole('alert')).toHaveTextContent('El archivo pesa más de 1 MB.')
  expect(mResize).not.toHaveBeenCalled()
})

// Falla si el botón «Subir logo» no abre el selector (el input nativo va oculto), si un PNG válido no se ajusta y se
// enseña, o si al guardar no viaja el base64 que devolvió resizeImage.
it('uploads a valid logo through the button, previews it and sends its base64 on save', async () => {
  const JPEG = '/9j/4AAQSkZJRg=='
  const open = jest.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
  mResize.mockResolvedValue(JPEG)
  wrap()
  await screen.findByAltText('Logo actual')
  fireEvent.click(screen.getByRole('button', { name: 'Subir logo' }))
  expect(open).toHaveBeenCalledTimes(1)
  const file = new File(['x'], 'logo.jpg', { type: 'image/jpeg' })
  upload(file)
  await waitFor(() => expect(screen.getByAltText('Logo actual')).toHaveAttribute('src', `data:image/jpeg;base64,${JPEG}`))
  expect(mResize).toHaveBeenCalledWith(file)
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(mSave).toHaveBeenCalledWith(BRAND, { base64: JPEG }))
  expect(await screen.findByRole('status')).toHaveTextContent('Guardado')
})

// Falla si "Quitar logo" no oculta la imagen ni manda remove al guardar, si el aviso «Sin logo» pierde el tamaño legible,
// o si hasLogo no se refresca tras guardar.
it('removes the logo and sends remove on save', async () => {
  wrap()
  await screen.findByAltText('Logo actual')
  fireEvent.click(screen.getByRole('button', { name: 'Quitar logo' }))
  expect(screen.queryByAltText('Logo actual')).not.toBeInTheDocument()
  expect(screen.getByText('Sin logo: se muestra el nombre')).toHaveClass('text-[13px]', 'text-soft')
  mGet.mockResolvedValue({ ...BRAND, hasLogo: false })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(mSave).toHaveBeenCalledWith(BRAND, { remove: true }))
  expect(await screen.findByRole('status')).toHaveTextContent('Guardado')
  expect(screen.queryByRole('button', { name: 'Quitar logo' })).not.toBeInTheDocument()
})
