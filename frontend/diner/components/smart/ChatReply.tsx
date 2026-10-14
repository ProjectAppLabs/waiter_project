'use client'

import { gsap } from 'gsap'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Presentation reveal after the server has validated the complete response. */
export function ChatReply({ text, animate, children }: { text: string; animate: boolean; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const words = text.match(/\S+\s*/g) ?? []
  const [visible, setVisible] = useState(animate ? 0 : words.length)
  const [ready, setReady] = useState(!animate)
  useEffect(() => {
    const count = (text.match(/\S+\s*/g) ?? []).length
    const media = gsap.matchMedia()
    media.add({ motion: '(prefers-reduced-motion: no-preference)', reduce: '(prefers-reduced-motion: reduce)' }, context => {
      if (!animate || context.conditions?.reduce) { setVisible(count); setReady(true); return }
      setVisible(0); setReady(false)
      const progress = { words: 0 }
      gsap.to(progress, { words: count, duration: Math.min(4.5, Math.max(.7, count / 18)), ease: 'none',
        onUpdate: () => setVisible(Math.floor(progress.words)), onComplete: () => { setVisible(count); setReady(true) } })
    }, root)
    return () => media.revert()
  }, [animate, text])
  useEffect(() => {
    if (!ready || !animate) return
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.sm-chat-reply-content', { opacity: 0, y: 8, duration: .3, clearProps: 'all' })
    }, root)
    return () => media.revert()
  }, [ready, animate])
  return <div ref={root}>
    <p className="sm-chat-reply-text"><span className="sr-only">{text}</span><span aria-hidden="true">{words.slice(0, visible).join('')}{!ready && <span className="sm-chat-caret">▍</span>}</span></p>
    {ready && <div className="sm-chat-reply-content">{children}</div>}
  </div>
}

export function ChatCarousel({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null)
  function move(direction: number) {
    const element = rail.current
    if (!element) return
    element.scrollBy({ left: direction * element.clientWidth * .85, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  return <section className="sm-chat-category" aria-label={title}>
    <header><h3>{title}</h3>{count > 1 && <div><button type="button" aria-label={`Anterior en ${title}`} onClick={() => move(-1)}>‹</button><button type="button" aria-label={`Siguiente en ${title}`} onClick={() => move(1)}>›</button></div>}</header>
    <div className={count > 1 ? 'sm-chat-carousel' : 'sm-chat-single'} ref={rail} tabIndex={count > 1 ? 0 : undefined} aria-label={count > 1 ? `Opciones de ${title}` : undefined}>{children}</div>
  </section>
}
