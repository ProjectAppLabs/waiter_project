# Waiter · landing

El home público de Waiter. Reproduce tal cual el diseño «Landing Waiter» de Claude Design
(`design/Landing Waiter.dc.html`): Next.js con App Router, GSAP 3.13.0 y ScrollTrigger, sin Tailwind.

- `npm run dev` la sirve en `http://192.168.56.10:3002` (y en `localhost:3002` por el puente). También la levanta `scripts/dev.sh up`.
- `components/sections/*.tsx` y `app/hover.css` se generan del diseño con `npm run generar` (`scripts/dc2jsx.py`):
  si el diseño cambia, se reemplaza `design/Landing Waiter.dc.html` y se regenera; los estilos no se editan a mano.
- `components/WaiterLanding.tsx` es la lógica del diseño portada línea por línea (animaciones, chat del mesero,
  formulario). Lo único distinto: GSAP llega por npm y, como el servidor pinta con ancho de escritorio, al montar se
  ajusta al ancho real antes de animar.
- `public/img/` son las imágenes del proyecto de Claude Design. Ocho llegaron cortadas por el límite de 256 KiB de
  DesignSync (`cocinera*`, `mano-telefono`, `mesa-nfc`, `mesero-rolo`, `moto`, `viernes-8pm`) y se rehicieron con el
  canal alfa exacto del diseño y el color del PNG original de cada ilustración (su versión WebP está en
  `assets/landing/ilustraciones/`), a la misma medida. Si se exportan desde Claude Design, basta con reemplazarlas.
