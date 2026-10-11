// Plan WA: registro integrado de Meta (Embedded Signup). Abre la ventana de Meta, el dueño conecta su número y Meta
// devuelve un código de un solo uso (para el token) y, por un mensaje de la ventana, los ids de su cuenta y su número.
// El código se cambia por el token en el servidor: nunca se guarda en el navegador.

interface FbLoginResponse { authResponse?: { code?: string } | null; status?: string }
interface Fb { init: (o: Record<string, unknown>) => void; login: (cb: (r: FbLoginResponse) => void, o: Record<string, unknown>) => void }
declare global { interface Window { FB?: Fb; fbAsyncInit?: () => void } }

export interface SignupResult { code: string; waba_id: string; phone_number_id: string }
export type SignupMode = 'new_number' | 'business_app'

let sdk: Promise<Fb> | null = null
function loadSdk(appId: string, version: string): Promise<Fb> {
  if (sdk) return sdk
  sdk = new Promise((resolve, reject) => {
    if (window.FB) { window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version }); resolve(window.FB); return }
    window.fbAsyncInit = () => { window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version }); resolve(window.FB!) }
    const script = Object.assign(document.createElement('script'), { src: 'https://connect.facebook.net/es_LA/sdk.js', async: true, defer: true, crossOrigin: 'anonymous' })
    script.onerror = () => { sdk = null; reject(new Error('No se pudo cargar la ventana de Meta. Revisa la conexión o un bloqueador de anuncios.')) }
    document.body.appendChild(script)
  })
  return sdk
}

// Los eventos de la ventana: FINISH (número nuevo) o FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING (coexistencia con la app
// del celular). CANCEL y ERROR cierran sin conectar.
export function readSignupEvent(event: MessageEvent): { waba_id?: string; phone_number_id?: string; cancelled?: boolean; error?: string } | null {
  if (typeof event.origin !== 'string' || !event.origin.endsWith('facebook.com')) return null
  let data: { type?: string; event?: string; data?: Record<string, string> }
  try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data } catch { return null }
  if (!data || data.type !== 'WA_EMBEDDED_SIGNUP') return null
  if (data.event === 'CANCEL') return { cancelled: true }
  if (data.event === 'ERROR') return { error: data.data?.error_message ?? 'Meta no pudo completar la conexión.' }
  if (data.event?.startsWith('FINISH')) return { waba_id: data.data?.waba_id, phone_number_id: data.data?.phone_number_id }
  return null
}

export async function runEmbeddedSignup(signup: { app_id: string; config_id: string; graph_version: string }, mode: SignupMode): Promise<SignupResult | null> {
  const fb = await loadSdk(signup.app_id, signup.graph_version)
  let ids: { waba_id?: string; phone_number_id?: string } = {}
  let failure: string | null = null
  let cancelled = false
  const onMessage = (e: MessageEvent) => {
    const r = readSignupEvent(e)
    if (!r) return
    if (r.cancelled) cancelled = true
    else if (r.error) failure = r.error
    else ids = { ...ids, ...r }
  }
  window.addEventListener('message', onMessage)
  try {
    const code = await new Promise<string | null>((resolve) => fb.login((r) => resolve(r.authResponse?.code ?? null), {
      config_id: signup.config_id, response_type: 'code', override_default_response_type: true,
      extras: { setup: {}, sessionInfoVersion: '3', ...(mode === 'business_app' ? { featureType: 'whatsapp_business_app_onboarding' } : {}) },
    }))
    // El mensaje con los ids puede llegar un instante después del cierre de la ventana.
    await new Promise((r) => setTimeout(r, 400))
    if (failure) throw new Error(failure)
    if (!code || cancelled) return null
    if (!ids.waba_id) throw new Error('Meta no devolvió la cuenta de WhatsApp. Vuelve a intentarlo.')
    return { code, waba_id: ids.waba_id, phone_number_id: ids.phone_number_id ?? '' }
  } finally { window.removeEventListener('message', onMessage) }
}
