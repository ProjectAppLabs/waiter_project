import { fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import InventarioPage from '../page'
import type { Ingredient } from '@/lib/domain/pantry'
import { messages } from '@/lib/i18n/messages'
import { useAuthStore } from '@/lib/stores/authStore'
import { usePantryStore } from '@/lib/stores/pantryStore'

// La red es la única frontera simulada: la recarga del inventario queda pendiente y la página pinta lo que ya trae el store.
beforeEach(() => { globalThis.fetch = jest.fn(() => new Promise<Response>(() => undefined)) as typeof fetch })

const HARINA: Ingredient = { id: 7, name: 'Harina', category: 'dry', qty: 2, uomId: 1, uomName: 'kg', level: 'low', status: 'request',
  supplierId: null, supplierName: null, hasImage: false, min: 5, max: 20 }

function ingredientsAs(role: 'owner' | 'admin') {
  useAuthStore.setState({ user: { uid: 1, name: 'Laura Encargada', companyId: 1, role }, employee: null })
  usePantryStore.setState({ tab: 'ingredients', ingredients: [HARINA] })
  render(<NextIntlClientProvider locale="es" messages={messages}><InventarioPage /></NextIntlClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Más opciones de Harina' }))
  return within(screen.getByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent)
}

// Falla si el encargado vuelve a ver crear, editar o borrar ingredientes, que el servidor reserva al dueño (save_product
// y archive exigen owner), o si pierde las existencias y la solicitud al proveedor, que sí le corresponden.
it('el encargado conserva existencias y solicitud, sin crear, editar ni borrar ingredientes', () => {
  expect(ingredientsAs('admin')).toEqual(['Existencias y movimientos', 'Solicitar ingrediente'])
  expect(screen.queryByRole('button', { name: 'Agregar ingrediente' })).toBeNull()
})

// Falla si condicionar los ingredientes al dueño le quita también al dueño crearlos, editarlos o borrarlos.
it('el dueño crea, edita y borra ingredientes', () => {
  expect(ingredientsAs('owner')).toEqual(['Existencias y movimientos', 'Editar ingrediente', 'Solicitar ingrediente', 'Eliminar ingrediente'])
  expect(screen.getByRole('button', { name: 'Agregar ingrediente' })).toHaveTextContent('Agregar ingrediente')
})
