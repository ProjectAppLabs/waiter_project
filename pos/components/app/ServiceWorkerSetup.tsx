'use client'

import { useEffect } from 'react'

// Plan U2: el service worker guarda la app para abrirla sin internet. Se registra solo en producción.
// En desarrollo se quita el que haya quedado de una prueba con la versión de producción en el mismo puerto: serviría
// CSS y JS viejos (en desarrollo los archivos no cambian de nombre al editarlos) y la pantalla mezclaría versiones,
// como la franja del menú móvil visible en escritorio. Vive en la raíz para cubrir todas las pantallas: el POS, la
// consola del dueño, la de ProjectApp y el inicio (antes solo estaba en el POS y el dueño nunca pasaba por ahí).
export function ServiceWorkerSetup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV === 'production') { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); return }
    void cleanDevelopment()
  }, [])
  return null
}

export async function cleanDevelopment(reload: () => void = () => window.location.reload()) {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((r) => r.unregister()))
    if ('caches' in window) for (const name of await caches.keys()) if (name.startsWith('waiter-app')) await caches.delete(name)
    // Si esta página ya la servía el service worker viejo, sigue con sus archivos hasta recargar: una sola vez.
    if (registrations.length && navigator.serviceWorker.controller) reload()
  } catch { /* sin permisos de almacenamiento: no hay nada que limpiar */ }
}
