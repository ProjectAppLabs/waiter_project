/* Medidas calculadas en el navegador para comprobar que cada selector produce un cambio real. */
function measureVariants() {
  const activeRules = []
  let variantRules = 0
  const inspect = rules => {
    for (const rule of rules) {
      if (rule.selectorText?.includes('data-ds-')) {
        variantRules++
        if (document.querySelector(rule.selectorText)) activeRules.push(rule.selectorText)
      }
      if (rule.cssRules) inspect(rule.cssRules)
    }
  }
  for (const sheet of document.styleSheets) {
    // Las hojas de fuentes externas no permiten leer su CSSOM; las variantes son del mismo origen.
    try { inspect(sheet.cssRules) } catch (error) { if (error.name !== 'SecurityError') throw error }
  }
  const read = selector => {
    const element = [...document.querySelectorAll(selector)].find(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0)
    if (!element) return null
    const s = getComputedStyle(element), r = element.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height, display: s.display, columns: s.gridTemplateColumns,
      color: s.color, background: s.backgroundColor, border: s.borderTopWidth, borderStyle: s.borderTopStyle,
      radius: s.borderTopLeftRadius, shadow: s.boxShadow, aspect: s.aspectRatio, direction: s.flexDirection, textAlign: s.textAlign }
  }
  return {
    variantRules, activeRules,
    attributes: Object.fromEntries([...document.querySelector('main').attributes].filter(a => a.name.startsWith('data-ds-')).map(a => [a.name, a.value])),
    primary: read('.sm-primary'), card: read('.sm-food-card'), photo: read('.sm-food-card .sm-food-photo, .sm-dish-photo, .sm-cart-line > .sm-food-photo'),
    category: read('.sm-categories button[aria-pressed=true]'), price: read('.sm-food-price > strong, .sm-dish-heading > .sm-price'),
    categoryOverflow: [...document.querySelectorAll('.sm-categories button')].filter(button => {
      const range = document.createRange()
      range.selectNodeContents(button)
      const text = range.getBoundingClientRect(), box = button.getBoundingClientRect()
      return text.left < box.left - 1 || text.right > box.right + 1
    }).map(button => button.textContent),
    header: read('.sm-location-header'), greeting: read('.sm-greeting-line'), salute: read('.sm-greeting-line strong'),
    badge: read('.sm-rating-pill'), layout: read('.sm-food-rail, .sm-food-grid, .sm-food-list'), link: read('.sm-food-card > .sm-food-link'),
    dish: read('.sm-dish-layout'), hero: read('.sm-dish-hero'), details: read('.sm-dish-info'), cart: read('.sm-cart-line'),
    featured: read('.sm-featured'), featuredCopy: read('.sm-featured > div:first-child'),
  }
}
module.exports = { measureVariants }
