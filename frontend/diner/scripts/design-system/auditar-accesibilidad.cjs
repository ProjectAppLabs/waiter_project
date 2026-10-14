/* Se ejecuta dentro del navegador; mide los elementos reales, no solo las declaraciones CSS. */
function auditAccessibility() {
  const controls = [], smallText = [], contrast = [], gradients = []
  const dialog = document.querySelector('dialog[open]')
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const rgba = value => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = value
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return [r, g, b, a / 255]
  }
  const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3])).concat(1)
  const luminance = color => color.slice(0, 3).map(v => v / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0)
  const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
  const visible = el => {
    const box = el.getBoundingClientRect(), style = getComputedStyle(el)
    if (!box.width || !box.height || style.visibility !== 'visible' || (dialog && !dialog.contains(el))) return false
    for (let parent = el; parent; parent = parent.parentElement) if (+getComputedStyle(parent).opacity < .05) return false
    return true
  }
  const identify = el => ({ tag: el.tagName.toLowerCase(), class: el.className, text: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 100) })
  const checkContrast = (el, color, suffix = '') => {
    if (el.closest(':disabled, [aria-disabled="true"]')) return
    const chain = []
    for (let parent = el; parent; parent = parent.parentElement) chain.unshift(parent)
    let bg = [255, 255, 255, 1], opacity = 1
    for (const parent of chain) {
      const style = getComputedStyle(parent)
      bg = over(rgba(style.backgroundColor), bg)
      opacity *= Number(style.opacity)
      if (style.backgroundImage !== 'none' && !gradients.includes(parent.className)) gradients.push(parent.className)
    }
    const fg = rgba(color); fg[3] *= opacity
    const value = ratio(over(fg, bg), bg)
    if (value < 4.5 - .01) contrast.push({ ...identify(el), suffix, ratio: Math.round(value * 100) / 100, color, background: bg })
  }
  for (const el of document.querySelectorAll('.smart-menu button, .smart-menu a, .smart-menu input, .smart-menu textarea, .smart-menu select, .smart-menu summary, .smart-menu [role="button"]')) {
    if (!visible(el)) continue
    let target = el
    if (el.matches('input[type="checkbox"], input[type="radio"]')) target = [...el.labels || []].find(visible) || el
    const box = target.getBoundingClientRect()
    if (box.width < 43.99 || box.height < 43.99) controls.push({ ...identify(el), width: box.width, height: box.height })
  }
  for (const el of document.querySelectorAll('.smart-menu *')) {
    if (el.closest('svg') || !visible(el)) continue
    const hasText = [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim())
    const input = el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea, select')
    if (!hasText && !input) continue
    const style = getComputedStyle(el)
    if (parseFloat(style.fontSize) < 13.99) smallText.push({ ...identify(el), size: style.fontSize })
    checkContrast(el, style.color)
    if (el.getAttribute('placeholder')) checkContrast(el, getComputedStyle(el, '::placeholder').color, 'placeholder')
  }
  return { controls, smallText, contrast, gradients, overflow: document.documentElement.scrollWidth > innerWidth }
}
module.exports = { auditAccessibility }
