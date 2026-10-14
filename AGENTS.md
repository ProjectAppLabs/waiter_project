# Instrucciones para agentes

- **Antes de empezar, lee el «Estado» de `docs/planes/2026-10-01-plan-T-sistema-propio.md`.** Waiter ya no usa Odoo
  ni el registro: todo vive en `experience/` (Django, MySQL 8.4 en el contenedor `waiter-mysql`, el estándar de ProjectApp), con el POS y el
  comensal hablando con él. `docs/traspaso/` describe la etapa anterior con Odoo y queda como historia.
- El contexto del producto y la arquitectura está en `docs/README.md`.
- Las tres apps de Next viven en `frontend/` como workspaces de npm con un solo `package-lock.json`: `frontend/pos`,
  `frontend/diner` y `frontend/landing`. Se instala una vez con `npm ci` en `frontend/`. Cada app tiene su propio
  `AGENTS.md`: usan una versión nueva de Next.js, así que consulta la documentación incluida antes de usar sus APIs; con
  las dependencias elevadas está en `frontend/node_modules/next/dist/docs/`.
- Comentarios, textos de interfaz y commits en español. Cada prueba lleva un comentario `// Falla si …` que dice qué
  error atrapa.
