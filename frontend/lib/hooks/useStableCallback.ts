import { useCallback, useEffect, useRef } from 'react'

// Devuelve una función con identidad fija que siempre ejecuta la versión más reciente de `fn`. Sirve para pasar
// manejadores a componentes memoizados sin invalidarlos en cada render (los manejadores cierran sobre estado que
// cambia, pero a quien los recibe solo le importa poder llamarlos).
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn)
  useEffect(() => { ref.current = fn })
  return useCallback((...args: A) => ref.current(...args), [])
}
