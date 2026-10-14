// Paleta medida en el .fig del kit CloudPos (Plan I). Única fuente: CSS la lee vía globals.css, las pruebas y las gráficas vía este módulo.
export const KIT_LIGHT = {
  primary: '#447DFC', primarySoft: '#EEF4FF', primaryInk: '#FFFFFF',
  canvas: '#F8FAFC', surface: '#FFFFFF', muted: '#F1F5F9', border: '#E2E8F0',
  ink: '#0F172A', soft: '#475569', dim: '#94A3B8', overlay: '#131316',
  progress: '#F59E0B', progressSoft: '#FFFBEB', progressInk: '#B45309',
  success: '#22C55E', successSoft: '#F0FDF4', successInk: '#15803D',
  danger: '#EF4444', dangerSoft: '#FEF3F2', dangerInk: '#B91C1C',
  info: '#6172F3', infoSoft: '#EEF4FF', infoInk: '#3538CD',
  reserved: '#0F172A', reservedInk: '#FFFFFF',
} as const
export type KitToken = keyof typeof KIT_LIGHT

export const KIT_DARK: Record<KitToken, string> = {
  primary: '#447DFC', primarySoft: '#1E2A44', primaryInk: '#FFFFFF',
  canvas: '#131316', surface: '#1A1A1E', muted: '#26272B', border: '#51525C',
  ink: '#F7F7F7', soft: '#A0A0AB', dim: '#70707B', overlay: '#000000',
  progress: '#F59E0B', progressSoft: '#78350F', progressInk: '#FDE68A',
  success: '#22C55E', successSoft: '#14532D', successInk: '#BBF7D0',
  danger: '#EF4444', dangerSoft: '#7F1D1D', dangerInk: '#FECACA',
  info: '#6172F3', infoSoft: '#1E2A44', infoInk: '#C7D2FE',
  reserved: '#F7F7F7', reservedInk: '#131316',
}

export const THEME_MODES = ['system', 'light', 'dark'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

// Convierte camelCase a kebab-case para el nombre de la variable CSS (--kit-primary-soft).
export const cssVar = (token: KitToken): string => `--kit-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`

// ---- Lo que documenta /kit. Si agregas un valor aquí, aparece solo en la vista; si es de CSS, decláralo también
// en app/globals.css (la prueba de tokens falla cuando uno de los dos se queda atrás).

// Escala tipográfica en uso. `className` es la clase de Tailwind que se escribe en el componente.
export const TYPE_SCALE = [
  { name: 'Frase del acceso', className: 'text-[40px] leading-[1.1] font-semibold tracking-[-0.025em]', use: 'Una sola vez por pantalla: panel del acceso.' },
  { name: 'Marca', className: 'text-[28px] font-semibold tracking-[-0.02em]', use: 'Waiter. en el acceso.' },
  { name: 'Título de pantalla', className: 'text-[24px] font-semibold', use: 'Inicio de terminal, títulos de asistentes.' },
  { name: 'Título de sección', className: 'text-[16px] font-semibold', use: 'Cabecera de tarjeta y de panel.' },
  { name: 'Cuerpo', className: 'text-base', use: 'Texto de botones y párrafos. 16 px para leerse a un brazo de distancia.' },
  { name: 'Etiqueta de campo', className: 'text-[15px] font-medium', use: 'Label de formularios y filas de ajustes.' },
  { name: 'Apoyo', className: 'text-[13px] text-soft', use: 'Ayudas bajo un campo, metadatos.' },
  { name: 'Cifras', className: 'tabular text-lg font-semibold', use: 'Dinero y cantidades: siempre con .tabular para que las columnas no bailen.' },
  { name: 'Código', className: 'font-mono text-[15px]', use: 'PIN, códigos de mesa y referencias. IBM Plex Mono.' },
] as const

// Radios (--radius-*) y alturas táctiles (--spacing-tap*) del @theme de globals.css.
export const RADII = [
  { token: 'sm', px: 8, className: 'rounded-sm', use: 'Chips pequeños, celdas.' },
  { token: 'md', px: 12, className: 'rounded-md', use: 'Botones y campos.' },
  { token: 'lg', px: 16, className: 'rounded-lg', use: 'Tarjetas y paneles.' },
  { token: 'xl', px: 24, className: 'rounded-xl', use: 'Modales y hojas.' },
] as const
export const TAP_SIZES = [
  { token: 'tap-min', px: 48, className: 'h-tap-min', use: 'Mínimo tocable: botón compacto, campo.' },
  { token: 'tap', px: 56, className: 'h-tap', use: 'Botón estándar.' },
  { token: 'tap-money', px: 64, className: 'h-tap-money', use: 'Acciones de cobro.' },
] as const

// Aurora del acceso: fondo azul noche y cinco manchas. Mismos valores que .login-aurora / .login-blob-* en globals.css.
export const AURORA = {
  base: ['#152A78', '#0D1840', '#0B1430'],
  blobs: [
    { key: 'blue', core: '#447DFC', from: 'Primario del kit', seconds: 26 },
    { key: 'indigo', core: '#6172F3', from: 'Info', seconds: 32 },
    { key: 'amber', core: '#F59E0B', from: 'En curso', seconds: 22 },
    { key: 'mint', core: '#2DD4A7', from: 'Listo, aclarado', seconds: 36 },
    { key: 'rose', core: '#F4628C', from: 'Acento cálido propio del acceso', seconds: 29 },
  ],
} as const
