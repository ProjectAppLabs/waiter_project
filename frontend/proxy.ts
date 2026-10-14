import { NextResponse } from 'next/server'

// La galería es una herramienta local: el servidor publicado no sirve esta ruta.
export function proxy() {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  return NextResponse.next()
}

export const config = { matcher: '/kit/:path*' }
