# Instrucciones para agentes

- **Antes de empezar, lee el «Estado» de `docs/planes/2026-10-01-plan-T-sistema-propio.md`.** Waiter ya no usa Odoo
  ni el registro: todo vive en `experience/` (Django, MySQL 8.4 en el contenedor `waiter-mysql`, el estándar de ProjectApp), con el POS y el
  comensal hablando con él. `docs/traspaso/` describe la etapa anterior con Odoo y queda como historia.
- El contexto del producto y la arquitectura está en `docs/README.md`.
- `frontend/` es una sola app de Next con el POS, el comensal (host `menu.`) y la landing (el dominio central),
  repartidos por host en `frontend/proxy.ts`, con un solo `package.json` y un solo `package-lock.json` (`npm ci` en
  `frontend/`). Usa una versión nueva de Next.js: consulta la documentación incluida en
  `frontend/node_modules/next/dist/docs/` antes de usar sus APIs (lo pide `frontend/AGENTS.md`).
- Comentarios, textos de interfaz y commits en español. Cada prueba lleva un comentario `// Falla si …` que dice qué
  error atrapa.
