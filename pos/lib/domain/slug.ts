// El slug del restaurante sale de su nombre: minúsculas, sin tildes, palabras unidas por guiones. Es la parte de la URL
// del menú (/<organización>/<restaurante>/).
export function slugify(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}
export const validSlug = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
