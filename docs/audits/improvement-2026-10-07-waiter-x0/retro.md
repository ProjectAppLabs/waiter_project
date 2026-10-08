# Retro de QA · Waiter

Copia exclusiva del hallazgo de esta ronda, Class C, sin modificar engine, core, reglas ni guardas. Su número corresponde al registro local del toolkit; su publicación global está bloqueada por el archivo del repositorio.

| ID | Área | Hallazgo |
|---|---|---|
| F137 | monorepo discovery/routing (Class C) | **Declarar raíces físicas del monorepo también en el engine.** Waiter usa experience/pos/diner: el core configurado acredita seis archivos de las tres capas, pero el descubrimiento del engine no sigue frontend como symlink y su routing Python asume backend/. Se preservaron core, reglas, baseline y guards; el manifest tipado del SHA final acredita todas las capas y el verify adicional se declara E2E parcial. Propuesta: diseño de raíces configurables y recibo explícito del alcance descubierto, sin disfrazar una capa omitida como analizada. No se implementó una modificación del engine ni de la liberación del marcador; esa guarda sigue siendo Class S. Evidencia: [ronda Waiter](../audits/2026-10-07-waiter_project-improvement-pass-project-2026-10-07-waiter-x0.md). |
