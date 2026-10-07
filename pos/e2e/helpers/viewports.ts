export const RONDA_VIEWPORTS = [
  { alias: 'portrait', width: 835, height: 1194 },
  { alias: 'compact', width: 412, height: 915 },
  { alias: 'landscape', width: 1195, height: 835 },
  { alias: 'desktop', width: 1440, height: 900 },
  { alias: 'wide', width: 2560, height: 1440 },
] as const

export type RondaViewport = (typeof RONDA_VIEWPORTS)[number]
