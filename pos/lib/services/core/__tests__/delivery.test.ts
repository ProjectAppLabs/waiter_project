import { customerProfile } from '@/lib/services/core/loyalty'
import { deliverySettings } from '@/lib/services/core/delivery'
import { coreFetch } from '@/lib/services/core/http'

jest.mock('@/lib/services/core/http', () => ({ coreFetch: jest.fn() }))

// Falla si la ficha del cliente lee mal la autorización, las coordenadas o los indicadores que van dentro de `customer`.
it('lee el perfil del cliente dentro de customer', async () => {
  jest.mocked(coreFetch).mockResolvedValueOnce({ customer: { id: 1, name: 'Ana',
    addresses: [{ id: 3, label: 'Casa', text: 'Calle 9', details: '', latitude: '6.21', longitude: '-75.57', last_used_at: null }],
    consent: { active: true, data_consent_at: '2026-10-09T00:00:00Z', data_consent_channel: 'menu', data_consent_version: '2026-10-09', data_consent_revoked_at: null },
    insights: { orders: 1 } } })
  const perfil = await customerProfile(1)
  expect(perfil.consent).toEqual({ granted_at: '2026-10-09T00:00:00Z', channel: 'menu', version: '2026-10-09', revoked_at: null })
  expect(perfil.addresses[0]).toMatchObject({ latitude: 6.21, longitude: -75.57 })
  expect(perfil.insights).toEqual({ orders: 1 })
})

// Falla si los ajustes de domicilio llegan como texto decimal y la pantalla los compara como texto.
it('convierte a números los ajustes de domicilio', async () => {
  jest.mocked(coreFetch).mockResolvedValueOnce({ restaurants: [{ restaurant_id: 25, name: 'Centro', has_location: true,
    settings: { enabled: true, radius_km: '5.00', tiers: [{ up_to_km: '5.00', fee: '6000.00' }], min_order: '0.00', methods: ['cash'], notes: '' } }] })
  const [sede] = await deliverySettings()
  expect(sede.settings).toEqual({ enabled: true, radius_km: 5, tiers: [{ up_to_km: 5, fee: 6000 }], min_order: 0, methods: ['cash'], notes: '' })
})
