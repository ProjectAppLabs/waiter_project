// Mismos pares de contraste que el servidor; los colores decorativos necesitan una tinta propia sobre superficies.
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}

export function contrastRatio(a: string, b: string): number {
  const left = luminance(a), right = luminance(b)
  return (Math.max(left, right) + .05) / (Math.min(left, right) + .05)
}

export function readableText(preferred: string, backgrounds: string[], fallback: string): string {
  const readable = (color: string) => backgrounds.every(background => contrastRatio(color, background) >= 4.5)
  if (readable(preferred)) return preferred
  // La primera mezcla válida conserva lo máximo posible del color original.
  for (let step = 1; step <= 255; step++) {
    for (const target of [0, 255]) {
      const mixed = '#' + [1, 3, 5].map(i => {
        const value = parseInt(preferred.slice(i, i + 2), 16)
        return Math.round(value + (target - value) * step / 255).toString(16).padStart(2, '0')
      }).join('').toUpperCase()
      if (readable(mixed)) return mixed
    }
  }
  return fallback
}
