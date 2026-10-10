import { act, render } from '@testing-library/react'
import { gsap } from 'gsap'

import { CartToss, cartTarget, toss } from '../CartToss'
import { announceAdd, myCount } from '@/lib/domain/cartEvents'
import type { Cart } from '@/lib/types'

beforeEach(() => {
  document.body.innerHTML = ''
  window.matchMedia = jest.fn().mockReturnValue({ matches: false }) as never
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0 })
  HTMLElement.prototype.getClientRects = function () { return [{}] as unknown as DOMRectList }
})
afterEach(() => jest.restoreAllMocks())

// Falla si el papelito cae en el carrito del muelle cuando el mesero virtual está abierto (quedaría detrás del diálogo),
// o si escoge un carrito oculto.
it('elige el carrito visible, primero el del chat abierto', () => {
  document.body.innerHTML = '<a data-cart-target id="muelle"></a><dialog><a data-cart-target id="cerrado"></a></dialog>'
  expect(cartTarget()?.id).toBe('muelle')
  document.body.innerHTML += '<dialog open><a data-cart-target id="chat"></a></dialog>'
  expect(cartTarget()?.id).toBe('chat')
  document.body.innerHTML = '<dialog><a data-cart-target></a></dialog>'
  expect(cartTarget()).toBeNull()
})

// Falla si agregar al pedido no lanza el papelito desde donde se tocó, si queda basura en la página o si se anima con
// «reducir movimiento» activado.
it('lanza el papelito al agregar y lo retira al caer', () => {
  document.body.innerHTML = '<a data-cart-target></a>'
  render(<CartToss />)
  window.dispatchEvent(new MouseEvent('pointerdown', { clientX: 40, clientY: 300 }))
  act(() => announceAdd())
  const paper = document.querySelector<HTMLElement>('.sm-papelito')
  expect(paper).not.toBeNull()
  expect(paper!.style.left).toBe('31px')
  act(() => { gsap.globalTimeline.progress(1, false); gsap.globalTimeline.getChildren().forEach((t) => t.progress(1)) })
  expect(document.querySelector('.sm-papelito')).toBeNull()
  window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as never
  act(() => announceAdd())
  expect(document.querySelector('.sm-papelito')).toBeNull()
})

// Falla si el papelito de un carrito dentro del diálogo se dibuja fuera de él (la capa superior lo taparía).
it('dibuja el papelito dentro del diálogo del carrito', () => {
  document.body.innerHTML = '<dialog open><a data-cart-target id="chat"></a></dialog>'
  toss({ x: 10, y: 10 }, document.getElementById('chat')!)
  expect(document.querySelector('dialog .sm-papelito')).not.toBeNull()
})

// Falla si el número del carrito cuenta las líneas de otros comensales de la mesa.
it('cuenta solo los platos propios', () => {
  expect(myCount({ lineas: [{ mio: true, cantidad: 2 }, { mio: false, cantidad: 5 }, { mio: true, cantidad: 1 }] } as unknown as Cart)).toBe(3)
  expect(myCount(null)).toBe(0)
})
