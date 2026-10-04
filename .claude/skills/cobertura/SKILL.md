---
name: cobertura
description: Verifica la calidad de las pruebas y del QA de Waiter de punta a punta - cobertura de pytest (experience, en MySQL), jest (POS y comensal) y la suite e2e; pruebas sin comentario «Falla si»; planes sin casos en las guías de QA; guías de QA del repo frente a las publicadas en el MCP. Úsala cuando pidan «verificar cobertura», «cómo estamos de pruebas», «revisar el QA», antes de fusionar una fase grande a main o al cerrar un plan. Entrega un informe con los huecos priorizados; no escribe pruebas a menos que se lo pidan.
---

# Cobertura de pruebas y QA

Produce un informe de estado con huecos priorizados. No cambia código salvo que la persona lo pida después del informe.

## 1. Preparar

- Lee el «Estado» del plan más reciente en `docs/planes/` para saber qué se construyó última vez.
- Comprueba que MySQL (`waiter-mysql`, puerto 3307) responde y que `./scripts/dev.sh status` muestra los servicios
  (la e2e los necesita). Si experience cambió desde que se levantó, reinícialo:
  `kill $(cat /tmp/waiter-dev/experience.pid); ./scripts/dev.sh up`.
- Guarda los resultados en el scratchpad de la sesión, no en el repo.

## 2. Medir (en paralelo cuando se pueda)

| Qué | Comando | Dónde mirar |
|---|---|---|
| experience | `cd experience && DJANGO_TEST_DB_NAME=test_waiter_dos venv/bin/pytest -q -p no:cacheprovider --cov=. --cov-report=json:<scratchpad>/cov-exp.json --cov-report=term` (unos 17 min; en segundo plano) | total y archivos de `--cov-report=term` |
| POS | `cd pos && NODE_OPTIONS=--no-deprecation npx jest --coverage` | `pos/coverage/coverage-summary.json` |
| Comensal | `cd diner && NODE_OPTIONS=--no-deprecation npx jest --coverage` | `diner/coverage/coverage-summary.json` |
| e2e | `cd pos && PLAYWRIGHT_CDP=http://127.0.0.1:9333 ./node_modules/.bin/playwright test --project="Desktop Chrome" --workers=1` | pasan, fallan y omitidas (la de emergencia se omite sin `PLAYWRIGHT_PROD=1`) |
| «Falla si» | `python3 scripts/calidad/falla_si.py` | pruebas sin su comentario, con archivo y línea |

`DJANGO_TEST_DB_NAME=test_waiter_dos` permite correr pytest mientras otra suite usa la base de pruebas por omisión.

## 3. Analizar

1. **Huecos de cobertura que importan.** No persigas el porcentaje global: ordena por líneas sin cubrir y por
   riesgo. Alto riesgo es dinero (cobros, caja, devoluciones, propinas, precios, facturación), permisos y aislamiento
   entre organizaciones, modo sin conexión y emergencia, y todo lo del último plan. Agrupa por carpeta
   (`app/(pos)`, `components/orders`, `lib/services`…) y señala archivos en 0 % que tienen lógica (no solo marcado).
2. **Lo que solo cubre la e2e.** Las páginas y flujos de pantalla completa (tomar pedido, salón, caja) suelen estar en
   0 % en jest pero recorridos por Playwright. Dilo así en el informe: no es lo mismo «sin pruebas» que «solo e2e».
3. **Código nuevo sin pruebas.** `git diff --stat main...HEAD` (o contra el último merge) y cruza los archivos
   cambiados con su cobertura: lo cambiado y en 0 % va primero.
4. **«Falla si».** Cuenta las faltas por carpeta. Una prueba sin el comentario no dice qué error atrapa: proponer el
   comentario exige leer la prueba, no inventarlo.
5. **QA por plan.** Para cada plan en `docs/planes/` con estado implementado, busca sus casos en `docs/qa/guia-qa-0*.md`
   (los casos citan el plan o la función). Lista funciones sin caso y casos que describen pantallas que ya no existen.
6. **QA publicado.** Las guías se publican en el MCP de documentos (carpeta «Waiter SaaS / QA», documentos 218 a 226;
   ver la memoria `guia-qa-waiter`). Compara el texto del repo con `read_document` de cada una y lista las que estén
   desactualizadas. No republiques sin que lo pidan.
7. **Umbrales.** `pos/jest.config.cjs` y `diner/jest.config.*` tienen `coverageThreshold`. Si la cobertura medida
   supera el umbral por más de 5 puntos, propón subirlo a un par de puntos por debajo de lo medido (trinquete: la
   cobertura no puede bajar). Para experience, propón `--cov-fail-under` con el mismo criterio.

## 4. Informe

En español, corto y ordenado por prioridad:

1. **Resumen:** tabla con líneas, ramas y funciones de experience, POS y comensal; e2e pasan/fallan/omitidas;
   pruebas sin «Falla si»; guías de QA desactualizadas.
2. **Huecos prioritarios** (máximo 10): archivo o flujo, por qué importa, qué prueba falta (unitaria o e2e) y su
   «Falla si» propuesto.
3. **Deuda menor:** el resto, agrupado.
4. **Umbrales propuestos.**
5. **Siguiente paso sugerido:** qué atacar primero y si conviene delegarlo a Codex (pruebas de servidor) mientras
   Claude hace las del POS.

No digas que algo está cubierto si no lo mediste en esta corrida. Si una medición falló, dilo con su error.
