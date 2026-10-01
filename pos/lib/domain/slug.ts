// El slug del restaurante sale de su nombre: minúsculas, sin tildes, palabras unidas por guiones. Es la parte de la URL
// del menú (/<organización>/<restaurante>/).
export function slugify(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}
export const validSlug = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)

// Plan P: el usuario con el que entra cada persona. Minúsculas, letras, números y puntos, de 3 a 32; único en toda la
// organización (lo comprueba Odoo). Se sugiere desde el nombre: «Sofía Mesera» → «sofia.mesera».
export function suggestUsername(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 32).replace(/\.+$/, '')
}
export const validUsername = (username: string) => /^[a-z0-9.]{3,32}$/.test(username)
