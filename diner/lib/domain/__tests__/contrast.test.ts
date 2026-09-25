import { contrastRatio, readableText } from '../contrast'
import { DEFAULT_TEMPLATE, templateVars } from '../template'

// Falla si el amarillo decorativo sigue usándose como texto ilegible o si el cálculo altera el fondo de los botones.
it('deriva una tinta legible para precios y conserva el amarillo decorativo', () => {
  const vars = templateVars(DEFAULT_TEMPLATE)
  expect(vars['--t-tinta-terciaria']).toBe('#FFB01D')
  for (const surface of ['#F8F8FA', '#FFFFFF', '#EEEBF5']) {
    expect(contrastRatio(vars['--sm-highlight-text'], surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(vars['--sm-accent-text'], surface)).toBeGreaterThanOrEqual(4.5)
  }
})

// Falla si los colores claros de un tema oscuro o los grises intermedios dejan de leerse sobre sus superficies.
it('resuelve tintas para superficies oscuras, claras y colores de acción intermedios', () => {
  for (const surfaces of [['#111111', '#222222', '#252525'], ['#F8F8FA', '#FFFFFF', '#EEEBF5']]) {
    for (const preferred of ['#FFFFFF', '#000000', '#DDDDDD', '#808080', '#FFB01D', '#6755A0', '#666687']) {
      const ink = readableText(preferred, surfaces, '#32324D')
      expect(surfaces.every(surface => contrastRatio(ink, surface) >= 4.5)).toBe(true)
    }
  }
  const vars = templateVars({ ...DEFAULT_TEMPLATE, tokens: { ...DEFAULT_TEMPLATE.tokens, tintaTerciaria: '#808080' } })
  expect(contrastRatio(vars['--sm-highlight-ink'], '#808080')).toBeGreaterThanOrEqual(4.5)
})

// Falla si una tinta que ya cumple cambia innecesariamente o si se pierde el respaldo para paletas externas incompatibles.
it('conserva las tintas válidas y admite un respaldo explícito', () => {
  expect(readableText('#32324D', ['#FFFFFF'], '#000000')).toBe('#32324D')
  expect(readableText('#808080', ['#000000', '#777777', '#FFFFFF'], '#32324D')).toBe('#32324D')
})
