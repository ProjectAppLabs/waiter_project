'use client'

import { useEffect, useState } from 'react'

import { reverseAddress } from '@/lib/services/api'
import type { Point } from './LocationPicker'

// Plan D: cuando el pin se asienta, se busca su dirección aproximada (medio segundo después, para no consultar en cada
// movimiento). Si el servidor no puede leerla, queda vacía y el cliente la escribe.
export function usePinAddress(rest: string | null | undefined, point: Point | null) {
  const [address, setAddress] = useState(''), [loading, setLoading] = useState(false)
  const lat = point?.lat, lng = point?.lng
  useEffect(() => {
    if (!rest || lat === undefined || lng === undefined) return
    let alive = true
    setLoading(true)
    const timer = setTimeout(() => {
      Promise.resolve().then(() => reverseAddress(rest, lat, lng)).then((text) => { if (alive) setAddress(text ?? '') }).catch(() => { if (alive) setAddress('') })
        .finally(() => { if (alive) setLoading(false) })
    }, 500)
    return () => { alive = false; clearTimeout(timer) }
  }, [rest, lat, lng])
  return { address, loading }
}
