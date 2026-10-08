# Verificación conjunta de mejora — Waiter w0

Checkout verificado: `/home/dev_env/webapps/.wt/waiter_project/queue-08102026-1146`, rama `queue/integration-08102026-1146`, SHA `2ba7475df7ce9b64aba3ca0d777090d1ac70b2f7`.

El workflow remoto `Validación de la ronda`, ejecución [37773308888](https://github.com/ProjectAppLabs/waiter_project/actions/runs/37773308888), hizo checkout de ese SHA en sus tres jobs y terminó `success` el 2026-10-08:

| Capa | Comando real | Resultado y evidencia |
| --- | --- | --- |
| Backend | `python scripts/calidad/validar_ronda.py backend` | 27 pruebas en MySQL 8.4, 0 fallos/errores/skips. Incluye las cuatro pruebas de listado de turnos del candidato I-P; el presupuesto de consultas fue 6,6,6 para 1/12/50 turnos. `ci-combinado/backend-ronda/backend.xml` |
| Frontend unit | `JEST_JUNIT_OUTPUT_DIR=../test-results python ../scripts/calidad/validar_ronda.py pos` | 11 suites, 83 pruebas, todas verdes. La evidencia asociada cubre caché, store de autenticación y HTTP (I-S), y SSE/reintentos/cursor/callbacks (I-O). `ci-combinado/pos-ronda/junit.xml` y `pos.json` |
| E2E live | `npx playwright test --config=playwright.ronda.config.ts` | Aplicación Django y POS construidos y servidos desde el checkout del CI con MySQL 8.4 aislado; 17/17 passed, 0 skipped/unexpected/flaky. I-S cubre cierre normal y con backend cortado más recarga/ruta protegida; I-R cubre buscar, filtrar, limpiar y crear con $38.900 en portrait, compact, landscape, desktop y wide. `ci-combinado/navegador-ronda/test-results/improvement/2026-10-08-waiter-w0/playwright.json` |
| Gate | `python scripts/calidad/validar_ronda.py gate` | Gate estricto: 13 archivos, 62 pruebas, 0 errors, 0 infra_errors, score 100; ruff y eslint sin hallazgos. Quedan sólo dos informativos `too_many_assertions` en el caso parametrizado responsive, revisados como necesarios para comprobar cada tamaño. `ci-combinado/pos-ronda/gate.json` |

Los cambios funcionales tienen aserciones que observarían una regresión: el cierre invalida la identidad antes de que conteste el servidor, la caché rechaza respuestas tardías y separa organizaciones, SSE detiene handles terminales y conserva el cursor tras un corte, el resumen de turnos contrasta importes, propina, pagos, permisos y aislamiento, y Pedidos comprueba tanto geometría alcanzable como los resultados de las acciones de la persona usuaria. No hay pruebas verdes que sólo comprueben visibilidad.

No hay configuración de mutation testing en este proyecto; por tanto no se ejecutó una puerta de mutación. La base objetiva disponible para esta ronda es el gate estricto nativo y las ejecuciones reales de CI documentadas arriba.

STATUS: APPROVED
gate: clean (0 errores nuevos; 2 informativos revisados)
runs: backend 27 pass; frontend-unit 83 pass; e2e live 17 pass; CI 3/3 success
rejected_because: none
HANDOFF: none
