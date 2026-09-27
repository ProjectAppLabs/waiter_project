import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { McpKeysForm } from '@/components/settings/McpKeysForm'
import { messages } from '@/lib/i18n/messages'
import { createMcpKey, listMcpKeys, revokeMcpKey } from '@/lib/services/mcpKeys'

jest.mock('@/lib/services/mcpKeys', () => ({
  ...jest.requireActual('@/lib/services/mcpKeys'),
  listMcpKeys: jest.fn(), createMcpKey: jest.fn(), revokeMcpKey: jest.fn(),
}))
const URL = 'http://192.168.1.13:8001/mcp/'
const KEY = { id: 4, nombre: 'Claude de Gustavo', prefijo: 'wtr_Ab12Cd', creadaPor: 'Laura', creada: '2026-09-23T20:00:00Z', ultimoUso: null, revocada: null }
const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><McpKeysForm /></NextIntlClientProvider>)
beforeEach(() => {
  jest.mocked(listMcpKeys).mockResolvedValue({ claves: [], mcpUrl: URL })
  jest.mocked(createMcpKey).mockResolvedValue({ ...KEY, clave: 'wtr_Ab12CdSECRETO', mcpUrl: URL })
  jest.mocked(revokeMcpKey).mockResolvedValue({ revocada: 4 })
})

// Falla si la clave nueva no se muestra (una vez) con la URL para claude.ai y el comando de Claude Code, o si al cerrar el
// aviso la clave en claro sigue en pantalla.
it('generates a key and shows it once with both ways to connect', async () => {
  wrap()
  expect(await screen.findByText('Aún no hay claves.')).toBeInTheDocument()
  jest.mocked(listMcpKeys).mockResolvedValue({ claves: [KEY], mcpUrl: URL })
  await userEvent.type(screen.getByLabelText('Nombre de la clave'), 'Claude de Gustavo')
  await userEvent.click(screen.getByRole('button', { name: /Generar clave/ }))
  expect(createMcpKey).toHaveBeenCalledWith('Claude de Gustavo')
  expect(await screen.findByText('wtr_Ab12CdSECRETO')).toBeInTheDocument()
  expect(screen.getByText(`${URL}wtr_Ab12CdSECRETO/`)).toBeInTheDocument()
  expect(screen.getByText(`claude mcp add --transport http waiter ${URL} --header "Authorization: Bearer wtr_Ab12CdSECRETO"`)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Ya la copié' }))
  expect(screen.queryByText('wtr_Ab12CdSECRETO')).toBeNull()
  expect(screen.getByText('Claude de Gustavo')).toBeInTheDocument()
})

// Falla si revocar no pide confirmación antes (una clave revocada corta a quien la esté usando).
it('asks before revoking a key', async () => {
  jest.mocked(listMcpKeys).mockResolvedValue({ claves: [KEY], mcpUrl: URL })
  wrap()
  await userEvent.click(await screen.findByRole('button', { name: 'Revocar' }))
  expect(revokeMcpKey).not.toHaveBeenCalled()
  jest.mocked(listMcpKeys).mockResolvedValue({ claves: [{ ...KEY, revocada: '2026-09-23T21:00:00Z' }], mcpUrl: URL })
  await userEvent.click(screen.getByRole('button', { name: 'Sí, revocar' }))
  expect(revokeMcpKey).toHaveBeenCalledWith(4)
  await waitFor(() => expect(screen.getByText('Revocada')).toBeInTheDocument())
})
