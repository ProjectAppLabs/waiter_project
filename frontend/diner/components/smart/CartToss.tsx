'use client'

import { gsap } from 'gsap'
import { useEffect } from 'react'

import { CART_ADDED } from '@/lib/domain/cartEvents'

// El carrito visible al que cae el papelito: primero el del mesero virtual si está abierto, si no el del muelle.
export function cartTarget(): HTMLElement | null {
  const inDialog = document.querySelector<HTMLElement>('dialog[open] [data-cart-target]')
  if (inDialog) return inDialog
  return [...document.querySelectorAll<HTMLElement>('[data-cart-target]')].filter((el) => !el.closest('dialog') && el.getClientRects().length).at(-1) ?? null
}

// Un papelito sale de donde la persona tocó, sube en arco y cae dentro del carrito, que da un saltico al recibirlo.
export function toss(from: { x: number; y: number }, target: HTMLElement) {
  const box = target.getBoundingClientRect()
  const paper = document.createElement('span')
  paper.className = 'sm-papelito'
  paper.setAttribute('aria-hidden', 'true')
  // Dentro del diálogo abierto, para que no quede detrás de la capa superior del navegador.
  ;(target.closest('dialog') ?? document.body).appendChild(paper)
  const dx = box.left + box.width / 2 - from.x, dy = box.top + box.height / 2 - from.y
  gsap.set(paper, { left: from.x - 9, top: from.y - 11 })
  const timeline = gsap.timeline({ onComplete: () => paper.remove() })
  timeline.to(paper, { x: dx, duration: .7, ease: 'power1.inOut' }, 0)
    .to(paper, { keyframes: [{ y: Math.min(-70, dy - 70), duration: .32, ease: 'power2.out' }, { y: dy, duration: .38, ease: 'power2.in' }] }, 0)
    .to(paper, { rotation: 300, scale: .45, duration: .7, ease: 'none' }, 0)
    .to(paper, { opacity: 0, duration: .12 }, .62)
    .fromTo(target, { scale: 1 }, { scale: 1.12, duration: .14, yoyo: true, repeat: 1, ease: 'power1.out', clearProps: 'transform' }, .66)
  return timeline
}

export function CartToss() {
  useEffect(() => {
    let last: { x: number; y: number } | null = null
    const point = (e: PointerEvent) => { last = { x: e.clientX, y: e.clientY } }
    const added = () => {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      // Espera a que el carrito aparezca: el primer plato hace visible el botón «Mi pedido».
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const target = cartTarget()
        if (target) toss(last ?? { x: window.innerWidth / 2, y: window.innerHeight * .6 }, target)
      }))
    }
    window.addEventListener('pointerdown', point, true)
    window.addEventListener(CART_ADDED, added)
    return () => { window.removeEventListener('pointerdown', point, true); window.removeEventListener(CART_ADDED, added) }
  }, [])
  return null
}
