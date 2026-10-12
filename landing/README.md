# Waiter · landing

El home público de Waiter. Reproduce tal cual el diseño «Landing Waiter» de Claude Design
(`design/Landing Waiter.dc.html`): Next.js con App Router, GSAP 3.13.0 y ScrollTrigger, sin Tailwind.

- `npm run dev` la sirve en `http://192.168.56.10:3002` (y en `localhost:3002` por el puente). También la levanta `scripts/dev.sh up`.
- `components/sections/*.tsx` y `app/hover.css` se generan del diseño con `npm run generar` (`scripts/dc2jsx.py`):
  si el diseño cambia, se reemplaza `design/Landing Waiter.dc.html` y se regenera; los estilos no se editan a mano.
- `components/WaiterLanding.tsx` es la lógica del diseño portada línea por línea (animaciones, chat del mesero,
  formulario). Lo único distinto: GSAP llega por npm y, como el servidor pinta con ancho de escritorio, al montar se
  ajusta al ancho real antes de animar.
- La navegación no sale del diseño: es `components/Nav.tsx`, en pill como la de projectapp.co (flotante y translúcida,
  con un resaltado que sigue a la sección visible; en pantallas de menos de 1120 px, barra completa con menú a pantalla
  completa). El conversor la omite (`PROPIOS` en `dc2jsx.py`) y conecta los enlaces legales que el diseño dejó en «#».
  «Iniciar sesión» lleva al inicio de sesión universal (`/login` del mismo dominio; en desarrollo
  `http://localhost:3000/login`; se cambia con `NEXT_PUBLIC_LOGIN_URL`).
- En producción la landing es la raíz de `waiter.projectapp.co` y comparte el dominio con el POS, que sirve `/login`.
  Por eso sus archivos van bajo `/_landing/_next` (`assetPrefix` en `next.config.ts`) y Caddy le manda solo sus rutas
  (`/`, `/privacy`, `/terms`, `/data-deletion`, `/icon.svg`, `/img/*`, `/_landing/*`): una página nueva se agrega
  también al `@landing` de `deploy/Caddyfile`. Los enlaces hacia el POS van con `<a>`, no con `<Link>`.
- Las secciones que en el diseño tienen fondo blanco llevan la Aurora ambiental del sistema de diseño
  (`components/AuroraFondo.tsx` y `app/aurora.css`, copia de `pos/components/kit/Aurora.tsx` y de sus estilos en
  `pos/app/globals.css`). La pone el conversor; en «Así funciona» va dentro del escenario fijo.
- `/privacy`, `/terms` y `/data-deletion` son las páginas legales de projectapp.co/es-co/waiter con su mismo texto
  (copias en `design/legal/`). Se generan con `npm run generar:legal` (`scripts/legal2jsx.py`) y usan `app/legal.css`.
- `public/img/` son las imágenes del proyecto de Claude Design. Ocho llegaron cortadas por el límite de 256 KiB de
  DesignSync (`cocinera*`, `mano-telefono`, `mesa-nfc`, `mesero-rolo`, `moto`, `viernes-8pm`) y se rehicieron con el
  canal alfa exacto del diseño y el color del PNG original de cada ilustración (su versión WebP está en
  `assets/landing/ilustraciones/`), a la misma medida. Si se exportan desde Claude Design, basta con reemplazarlas.
