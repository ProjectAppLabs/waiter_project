'use client'

/* eslint-disable @next/next/no-img-element -- Las decoraciones son PNG del paquete de fábrica del propio comensal. */
import { Component, createElement, Fragment, type ReactNode } from 'react'
import { formatCop } from '@/lib/domain/cart'
import { TEMPLATE_TAGS, decorationFile, resolveData, truthy, type TemplateData, type TemplateSlots } from '@/lib/domain/plantillas'
import type { TemplateNode } from '@/lib/types'

// Plan K2: dibuja el árbol validado de una plantilla con React, nunca con HTML crudo. Los datos y las ranuras los aporta
// el componente real; la plantilla solo decide la estructura y las utilidades ds-*.
export interface PlantillaProps { arbol: TemplateNode[]; datos: TemplateData; ranuras: TemplateSlots; fallback: ReactNode }

function format(value: unknown, formato?: 'texto' | 'precio' | 'numero'): string | null {
  if (value === undefined || value === null || value === false) return null
  if (formato === 'precio') return typeof value === 'number' && Number.isFinite(value) ? `$ ${formatCop(value)}` : null
  if (formato === 'numero') return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('es-CO', { maximumFractionDigits: 1 }) : null
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null
}

function render(nodes: TemplateNode[], datos: TemplateData, ranuras: TemplateSlots, scope: Record<string, TemplateData>, prefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${prefix}${index}`
    switch (node.tipo) {
      case 'elemento': {
        if (!(TEMPLATE_TAGS as readonly string[]).includes(node.etiqueta)) throw new Error(`etiqueta no admitida ${node.etiqueta}`)
        const className = node.clases.filter((c) => /^ds-[a-z0-9-]+$/.test(c)).join(' ') || undefined
        return createElement(node.etiqueta, { key, className }, ...render(node.hijos, datos, ranuras, scope, `${key}.`))
      }
      case 'texto': return <Fragment key={key}>{node.texto}</Fragment>
      case 'dato': return <Fragment key={key}>{format(resolveData(node.nombre, datos, scope), node.formato)}</Fragment>
      case 'ranura': {
        const slot = ranuras[node.nombre]
        if (slot === undefined) return null
        return <Fragment key={key}>{typeof slot === 'function' ? slot(render(node.hijos, datos, ranuras, scope, `${key}.`)) : slot}</Fragment>
      }
      case 'si': return truthy(resolveData(node.dato, datos, scope)) ? <Fragment key={key}>{render(node.hijos, datos, ranuras, scope, `${key}.`)}</Fragment> : null
      case 'cada': {
        const list = resolveData(node.dato, datos, scope)
        if (!Array.isArray(list)) return null
        return <Fragment key={key}>{list.map((item, i) => <Fragment key={i}>{render(node.hijos, datos, ranuras, { ...scope, [node.como]: (item ?? {}) as TemplateData }, `${key}.${i}.`)}</Fragment>)}</Fragment>
      }
      case 'decoracion':
        return <img key={key} src={decorationFile(node)} alt="" aria-hidden="true" loading="lazy"
          className={`ds-decoracion ds-mov-${node.movimiento}${node.posicion === 'libre' ? '' : ` ds-esquina-${node.posicion}`}`} />
      default: return null
    }
  })
}

// Si algo del árbol no se puede dibujar (un dato con forma inesperada, una etiqueta fuera de la lista), se muestra
// el componente de fábrica: una plantilla nunca deja un hueco en la carta.
class Respaldo extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export function Plantilla({ arbol, datos, ranuras, fallback }: PlantillaProps) {
  // El árbol se convierte a elementos antes de entregarlo a React: un nodo o una ranura que falle aquí cae al respaldo
  // sin pasar por un error de renderizado. El límite de error queda para lo que falle dentro de una ranura ya montada.
  let elements: ReactNode
  try { elements = render(arbol, datos, ranuras, {}, '') } catch { return <>{fallback}</> }
  return <Respaldo fallback={fallback}>{elements}</Respaldo>
}
