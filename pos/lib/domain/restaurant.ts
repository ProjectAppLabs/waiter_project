// Plan O: el restaurante de este dispositivo (una tablet es de un local). Se recuerda para no preguntarlo en cada
// entrada; solo se pregunta cuando la cuenta del terminal opera varios restaurantes y aún no hay uno elegido.
export const DEVICE_RESTAURANT_KEY = 'waiter.device-restaurant'
export interface DeviceRestaurant { id: number; name: string }

export function readDeviceRestaurant(): DeviceRestaurant | null {
  try {
    const raw = JSON.parse(localStorage.getItem(DEVICE_RESTAURANT_KEY) || 'null') as Partial<DeviceRestaurant> | null
    return raw && Number.isInteger(raw.id) && (raw.id as number) > 0 && typeof raw.name === 'string' ? { id: raw.id as number, name: raw.name } : null
  } catch { return null }
}

export function storeDeviceRestaurant(value: DeviceRestaurant | null): void {
  try { if (value) localStorage.setItem(DEVICE_RESTAURANT_KEY, JSON.stringify(value)); else localStorage.removeItem(DEVICE_RESTAURANT_KEY) } catch { /* sin almacenamiento */ }
}

// Qué restaurante usar: el recordado si la cuenta aún lo opera; si opera uno solo, ese; si opera varios, ninguno (se
// pregunta).
export function pickRestaurant<T extends { id: number }>(available: T[], stored: DeviceRestaurant | null): T | null {
  const remembered = stored ? available.find((r) => r.id === stored.id) : undefined
  if (remembered) return remembered
  return available.length === 1 ? available[0] : null
}
