import { redirect } from 'next/navigation'

// El Catálogo de Administración se fundió con Inventario (la ficha comercial del plato se edita desde su tarjeta).
// La ruta se conserva para los marcadores y enlaces viejos.
export default function CatalogoPage() {
  redirect('/inventario')
}
