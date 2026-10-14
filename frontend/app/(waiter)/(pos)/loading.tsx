import { PageSkeleton } from '@/components/kit/Skeleton'

// Mientras se abre una pantalla (su código se descarga o, en desarrollo, se compila), el contenido muestra su esqueleto
// y la barra de navegación, que vive en el layout, se queda quieta arriba.
export default function Loading() {
  return <PageSkeleton />
}
