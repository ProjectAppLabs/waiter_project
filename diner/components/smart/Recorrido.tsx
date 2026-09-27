'use client'

/* eslint-disable @next/next/no-img-element -- Las ilustraciones son PNG del paquete de fábrica o el logo de la marca. */
import type { HTMLAttributes, ReactNode } from 'react'
import { Plantilla } from '@/components/plantillas/Renderizador'
import { usePlantilla } from '@/components/plantillas/usePlantilla'

// Plan K, paquete C: la pantalla de recorrido (ilustración orbital, título, frase, contenido propio de la pantalla y pie con
// acciones) que arman la introducción, la ubicación, la cuenta lista, el correo, el canal, el éxito al restablecer, el éxito
// de la opinión y la celebración del pago. La sección .sm-journey sigue siendo de cada pantalla (clases, título con volver,
// diálogos); dentro va este envoltorio, donde se dibuja la plantilla del contrato «recorrido», de fábrica o propia de la sede.
export interface RecorridoProps {
  titulo: string
  texto?: string
  /** Atributos del párrafo de la frase (clase sm-note, role="status"…). */
  textoAtributos?: HTMLAttributes<HTMLParagraphElement>
  /** Ruta de la ilustración; sin ella la ranura queda vacía. */
  ilustracion?: string
  /** Diapositivas: cuál está activa (desde 0), cuántas hay y cómo cambiar. */
  diapositivas?: { actual: number; total: number; ir: (indice: number) => void }
  /** Contenido propio de la pantalla entre la frase y el pie: formularios, opciones, enlaces. */
  cuerpo?: ReactNode
  /** Acciones del pie (.sm-journey-footer); sin ellas no hay pie. */
  acciones?: ReactNode
}

// Datos que una plantilla del recorrido puede enlazar (contrato «recorrido»).
export function recorridoTemplateData(p: RecorridoProps) {
  return { 'recorrido.titulo': p.titulo, 'recorrido.texto': p.texto ?? '', 'recorrido.paso': p.diapositivas ? p.diapositivas.actual + 1 : 0,
    'recorrido.pasos': p.diapositivas?.total ?? 0, 'recorrido.ilustrado': !!p.ilustracion }
}

export function Recorrido(p: RecorridoProps) {
  const { arbol, marker } = usePlantilla('recorrido')
  const { diapositivas } = p
  const ilustracion = p.ilustracion ? <div className="sm-orbit-hero"><img src={p.ilustracion} alt="" /></div> : undefined
  const puntos = diapositivas ? <nav className="sm-slide-dots" aria-label="Introducción">{Array.from({ length: diapositivas.total }, (_, i) =>
    <button key={i} aria-label={`Página ${i + 1}`} aria-current={i === diapositivas.actual ? 'step' : undefined} onClick={() => diapositivas.ir(i)} />)}</nav> : undefined
  const titulo = <h1>{p.titulo}</h1>
  const texto = p.texto === undefined ? undefined : <p {...p.textoAtributos}>{p.texto}</p>
  const acciones = p.acciones ? <div className="sm-journey-footer">{p.acciones}</div> : undefined
  const factory = <>{ilustracion}{puntos}{titulo}{texto}{p.cuerpo}{acciones}</>
  return <div className="sm-recorrido" {...marker}>
    {arbol ? <Plantilla arbol={arbol} datos={recorridoTemplateData(p)} ranuras={{ ilustracion, puntos, titulo, texto, cuerpo: p.cuerpo, acciones }} fallback={factory} /> : factory}
  </div>
}
