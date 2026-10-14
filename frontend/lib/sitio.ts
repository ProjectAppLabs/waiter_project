// Los sitios que la app sirve bajo un prefijo interno (app/(diner)/diner y app/(landing)/landing). proxy.ts decide cuál
// sirve cada petición y lo anota en el encabezado SITIO; next.config.ts reescribe la ruta a ese prefijo. Sin imports:
// next.config.ts también lo carga.
export const SITIO = 'x-waiter-sitio'
export const SITIOS = ['diner', 'landing'] as const
export type Sitio = (typeof SITIOS)[number]
