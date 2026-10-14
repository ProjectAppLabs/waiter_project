'use client'

import { useEffect, useState } from 'react'

import { getCompany, type CompanyInfo } from '@/lib/services/settings'

// Datos del emisor que van impresos en la cuenta de cobro. Cambian muy de vez en cuando (Configuración ›
// Restaurante), así que se leen una vez por sesión del navegador y se comparten: el cobro no puede esperar
// una consulta más, y el papel no puede salir sin NIT.
let cached: CompanyInfo | null = null
let inFlight: Promise<CompanyInfo | null> | null = null

export function loadIssuer(): Promise<CompanyInfo | null> {
  if (cached) return Promise.resolve(cached)
  // Si falla (sin red, sin permiso) el documento se imprime igual con lo que ya sabe: el nombre.
  inFlight ??= getCompany().then((c) => { cached = c; return c }).catch(() => null).finally(() => { inFlight = null })
  return inFlight
}

export function useIssuer(): CompanyInfo | null {
  const [issuer, setIssuer] = useState<CompanyInfo | null>(cached)
  useEffect(() => {
    if (cached) return
    let alive = true
    void loadIssuer().then((c) => { if (alive && c) setIssuer(c) })
    return () => { alive = false }
  }, [])
  return issuer
}

// Solo para las pruebas: deja el caché como estaba al empezar.
export function resetIssuerCache(): void { cached = null; inFlight = null }
