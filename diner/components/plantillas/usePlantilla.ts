'use client'

import { useDinerStore } from '@/lib/stores/dinerStore'
import { templateFor, templateMarker, type TemplatableComponent } from '@/lib/domain/plantillas'

// Plantilla propia de un componente (si la sede la tiene y es válida) y los atributos que marcan su raíz.
export function usePlantilla(component: TemplatableComponent) {
  const arbol = useDinerStore((s) => templateFor(s.template.tema, component))
  return { arbol, marker: templateMarker(component, arbol) }
}
