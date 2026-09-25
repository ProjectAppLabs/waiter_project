// Catálogo cerrado de J3. Los valores predeterminados conservan la apariencia de J2.
export const COMPONENT_VARIANTS = {
  boton: { attribute: 'data-ds-boton', default: 'relleno', values: ['relleno', 'contorno', 'suave'] },
  formaBoton: { attribute: 'data-ds-forma-boton', default: 'tema', values: ['tema', 'pildora', 'recta'] },
  tarjeta: { attribute: 'data-ds-tarjeta', default: 'plana', values: ['plana', 'sombra', 'borde'] },
  categorias: { attribute: 'data-ds-categorias', default: 'chips', values: ['chips', 'pestanas', 'subrayado'] },
  precio: { attribute: 'data-ds-precio', default: 'destacado', values: ['destacado', 'normal', 'pildora'] },
  imagen: { attribute: 'data-ds-imagen', default: 'actual', values: ['actual', 'cuadrada', '4:3'] },
  formaImagen: { attribute: 'data-ds-forma-imagen', default: 'actual', values: ['actual', 'tema', 'circular'] },
  cabecera: { attribute: 'data-ds-cabecera', default: 'izquierda', values: ['izquierda', 'centrada'] },
  saludo: { attribute: 'data-ds-saludo', default: 'visible', values: ['visible', 'oculto'] },
  insignia: { attribute: 'data-ds-insignia', default: 'rellena', values: ['rellena', 'contorno'] },
} as const

export const SCREEN_LAYOUTS = {
  carta: { attribute: 'data-ds-carta', default: 'actual', values: ['actual', 'cuadricula', 'lista', 'foto-grande'] },
  ficha: { attribute: 'data-ds-ficha', default: 'actual', values: ['actual', 'heroe', 'dividida'] },
  carrito: { attribute: 'data-ds-carrito', default: 'tarjetas', values: ['tarjetas', 'compacta'] },
} as const

export type MenuVariants = { [K in keyof typeof COMPONENT_VARIANTS]: typeof COMPONENT_VARIANTS[K]['values'][number] }
export type MenuLayouts = { [K in keyof typeof SCREEN_LAYOUTS]: typeof SCREEN_LAYOUTS[K]['values'][number] }

type ThemeWithVariants = { version: number; variantes?: Partial<MenuVariants>; distribucion?: Partial<MenuLayouts> }

export function designSystemAttributes(theme?: ThemeWithVariants): Record<`data-ds-${string}`, string> {
  const source = theme?.version === 2 ? theme : undefined
  const attributes: Record<`data-ds-${string}`, string> = {}
  for (const [layer, definitions] of [['variantes', COMPONENT_VARIANTS], ['distribucion', SCREEN_LAYOUTS]] as const) {
    const values = source?.[layer] as Record<string, unknown> | undefined
    for (const [key, definition] of Object.entries(definitions)) {
      const value = values?.[key]
      attributes[definition.attribute] = typeof value === 'string' && (definition.values as readonly string[]).includes(value)
        ? value : definition.default
    }
  }
  return attributes
}
