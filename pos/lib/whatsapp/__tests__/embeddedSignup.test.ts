import { readSignupEvent, runEmbeddedSignup } from '@/lib/whatsapp/embeddedSignup'

const signup = { app_id: '1825282295557750', config_id: 'cfg-1', graph_version: 'v25.0' }
const fbMessage = (data: unknown, origin = 'https://www.facebook.com') => new MessageEvent('message', { origin, data: JSON.stringify(data) })

// Falla si se aceptan mensajes de una página que no es de Meta (cualquiera podría inyectar ids de otra cuenta), o si los
// eventos de terminar, cancelar y error del registro integrado no se distinguen.
it('solo lee los eventos del registro integrado que vienen de Meta', () => {
  const finish = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: 'W1', phone_number_id: 'P1' } }
  expect(readSignupEvent(fbMessage(finish))).toEqual({ waba_id: 'W1', phone_number_id: 'P1' })
  expect(readSignupEvent(fbMessage(finish, 'https://malicioso.example'))).toBeNull()
  expect(readSignupEvent(fbMessage({ type: 'OTRO', event: 'FINISH' }))).toBeNull()
  expect(readSignupEvent(fbMessage({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL' }))).toEqual({ cancelled: true })
  expect(readSignupEvent(fbMessage({ type: 'WA_EMBEDDED_SIGNUP', event: 'ERROR', data: { error_message: 'Número en uso' } }))).toEqual({ error: 'Número en uso' })
  expect(readSignupEvent(fbMessage({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data: { waba_id: 'W2' } }))).toEqual({ waba_id: 'W2', phone_number_id: undefined })
  expect(readSignupEvent(new MessageEvent('message', { origin: 'https://www.facebook.com', data: 'no es json' }))).toBeNull()
})

// Falla si la ventana no se abre con la configuración del registro integrado (y la de coexistencia para la app del
// celular), si no se devuelve el código con los ids, o si cerrar la ventana se trata como conexión.
it('abre la ventana de Meta y devuelve el código con los ids', async () => {
  jest.useFakeTimers()
  try {
    let options: Record<string, unknown> = {}
    window.FB = { init: jest.fn(), login: jest.fn((cb, o) => { options = o; window.dispatchEvent(fbMessage({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: 'W1', phone_number_id: 'P1' } })); cb({ authResponse: { code: 'c0de' } }) }) }
    const pending = runEmbeddedSignup(signup, 'business_app')
    await jest.advanceTimersByTimeAsync(500)
    await expect(pending).resolves.toEqual({ code: 'c0de', waba_id: 'W1', phone_number_id: 'P1' })
    expect(options).toMatchObject({ config_id: 'cfg-1', response_type: 'code', override_default_response_type: true, extras: { featureType: 'whatsapp_business_app_onboarding' } })
    window.FB.login = jest.fn((cb) => { window.dispatchEvent(fbMessage({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL' })); cb({ authResponse: null }) })
    const cancelled = runEmbeddedSignup(signup, 'new_number')
    await jest.advanceTimersByTimeAsync(500)
    await expect(cancelled).resolves.toBeNull()
  } finally { jest.useRealTimers(); delete window.FB }
})
