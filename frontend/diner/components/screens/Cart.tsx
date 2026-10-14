'use client'

import { DemoPaymentNotice } from '@/components/ui/DemoPaymentNotice'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { GenericCart } from '@/components/templates/generic/GenericCart'
import { CART_LAYOUTS } from '@/components/templates/registry'
import { pathFor } from '@/lib/domain/route'
import { DEFAULT_TEMPLATE, familyOf } from '@/lib/domain/template'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Entry } from '@/lib/types'

// Pedido: el carrito es de la mesa. El contenedor asegura la sesión, enruta y delega el dibujo al carrito de la familia de la plantilla.
export function Cart({ rest, venue, token }: { entry: Entry; rest: string; venue: string; token: string | null; id: string | null }) {
  const router = useRouter()
  const store = useDinerStore()
  const { cart, busy, error, setQty, remove, confirm, refreshCart, ensureSession } = store
  const template = store.template ?? DEFAULT_TEMPLATE
  // Solo se asegura la sesión: la página relee el carrito al entrar a la pantalla y al abrirse la sesión (un único GET).
  useEffect(() => { void ensureSession() }, [ensureSession])
  // Lectura directa del registro (no una llamada): la regla static-components exige que el componente no se cree en el render.
  const Layout = CART_LAYOUTS[familyOf(template.layouts?.carrito, template.familia)] ?? GenericCart
  const go = (screen: Parameters<typeof pathFor>[3]) => router.push(pathFor(rest, venue, token, screen))
  // Idempotente en el servidor. Si el envío entró, se va al estado del pedido devuelto; si no, el store guarda el detalle y la página lo pinta.
  const onConfirm = async () => { const id = await confirm(); if (id) router.push(pathFor(rest, venue, token, 'estado', id)); return id }
  return (
    <>
    <DemoPaymentNotice />
    <Layout
      cart={cart ?? null} template={template} busy={busy} error={error ?? null}
      setQty={(lineId, qty) => void setQty(lineId, qty)} remove={(lineId) => void remove(lineId)} confirm={onConfirm}
      goPay={() => go('pago')} goMenu={() => go('carta')} discount={cart?.descuento ?? null} retry={() => void refreshCart()}
      hrefs={{ home: pathFor(rest, venue, token, 'portada'), menu: pathFor(rest, venue, token, 'carta'), pay: pathFor(rest, venue, token, 'pago'), table: pathFor(rest, venue, token, 'la-cuenta'), signup: pathFor(rest, venue, token, 'cuenta/registro') }}
    />
    </>
  )
}
