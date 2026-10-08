# Ronda de mejora de Waiter · 2026-10-08

El operador aprobó una causa por frente con beneficio demostrado, tres sesiones implementadoras
y una única QA conjunta antes de integrar todo el trabajo mediante merge-queue.

Base del diagnóstico: `main@b1a32bffeae27405c0a471fdd160436a3b7d155e`, que ya contiene el PR #15.
La duplicación de caja, Pago e Historial no se vuelven a implementar.

## Diagnóstico y reparto

| Frente | Diagnóstico | Causa elegida | Dueño |
|---|---|---|---|
| Seguridad | CON BRECHAS: logout conserva lecturas que pueden restaurar identidad offline. | `I-S-f699a8c046a8` | w1 |
| Mantenibilidad | CON BRECHAS: el índice de documentación describe Odoo y registry retirados. | `I-M-ef387c19a523` | w0 |
| Observabilidad | CON BRECHAS: SSE reconecta después de eventos terminales ignorados. | `I-O-a86cb584a263` | w1 |
| Rendimiento | CON BRECHAS: MySQL confirma 12, 78 y 306 consultas para 1, 12 y 50 turnos; el cambio produce 6, 6 y 6. | `I-P-366dbded5c13` | w2 |
| Responsividad | CON BRECHAS: Pedidos llega a 501 px en un viewport de 412 px, con Crear pedido recortado. | `I-R-c4cb0d859789` | w3 |
| QA | CON BRECHAS: el mapa y el CI anterior sólo acreditan una parte del producto. | Validación de la unión de cambios | w0 |

Estas clasificaciones demuestran brechas; no certifican los módulos no inspeccionados. Las
mediciones de rendimiento no representan un perfil de producción: Waiter no figura en el
catálogo local y no se atribuye el perfil provisional del fleet a su servidor.

## Propiedad de archivos

- w1: caché, autenticación y transporte HTTP/SSE del POS, sus pruebas asignadas y E2E de acceso.
- w2: listado de turnos en la API de ventas y su archivo nuevo de pruebas.
- w3: página Pedidos y su archivo nuevo E2E.
- w0: documentación, registros, mapas y configuración de validación. Dependencias, lockfiles,
  migraciones, componentes y configuración compartida requieren su decisión antes de editar.

Las sesiones entregan PRs propios a main; el orquestador no absorbe sus implementaciones.
El clon del servicio y los worktrees anteriores permanecen intactos. No hay despliegue en esta ronda.

## Registro y evidencia

Por decisión explícita del operador, el ledger de esta ronda vive en `ledger/waiter_project.yml`
dentro de este directorio. Lo escribe exclusivamente el motor canónico del toolkit mediante
`IMPROVEMENT_LEDGER_DIR`, conservando los IDs y el recibo canónico publicado de la ronda
anterior (`2026-10-07-waiter-x0`, verificado en `7ba8900`). No se
modifica la política, la selección ni la validación del motor.

Las cuatro causas de código se acreditan en dos registros de hasta tres candidatos sobre el
mismo contenido combinado, con una sola QA. La corrección documental conserva su revisión
estática y de enlaces: no se le atribuyen pruebas de comportamientos ajenos.

Los artefactos de ejecución se guardan en `test-results/improvement/2026-10-08-waiter-w0/`
(ignorado por Git). Cada resultado final indicará el SHA probado, la aplicación servida y el
run de CI correspondiente. Autoría, capturas y collection-only no acreditan E2E en vivo.

## Obligaciones y observaciones pendientes

Cookie del comensal sin Secure, claves MCP en acceso configurado, advisories de dependencias
por corroborar, timeouts HTTP, fallos de correo sin señal, otros N+1 y pantallas sin inventario
siguen abiertos. El cupo de esta ronda no los convierte en riesgos aceptados ni frentes maduros.
La rama anterior `docs/07102026-legal-meta` tiene un documento y no tiene PR. Queda fuera
de esta ronda mientras el operador no amplíe su alcance; no se incorpora trabajo ajeno
a los cuatro PRs de mejora por el solo hecho de encontrar una rama remota.

## Correcciones de la propia validación

El Auditor pidió reubicar la prueba de la API de turnos bajo `sales/tests/views/` y
congelar su reloj. w2 conserva esas pruebas conductuales y corrige ambos hallazgos;
el conductor adapta el runner al destino correcto. No se rebajan reglas ni se añaden excepciones.

## Resultado de QA y entrega

Verifier **APPROVED** sobre el contenido combinado
`2ba7475df7ce9b64aba3ca0d777090d1ac70b2f7`, ejecutado en el
[CI 37773308888](https://github.com/ProjectAppLabs/waiter_project/actions/runs/37773308888).
Los tres jobs hicieron checkout del SHA exacto; el POS y el backend servidos en E2E
pertenecen a ese contenido y usan una base MySQL 8.4 aislada.

| Control | Resultado |
|---|---|
| Backend y turnos | 27 pruebas, sin errores, fallos ni skips; consultas 6/6/6 para 1/12/50 turnos. |
| Permisos de caja | 56 pruebas, sin errores, fallos ni skips; 281 casos ajenos al slice deseleccionados. |
| POS unitario | 11 suites, 83 pruebas en verde. |
| Navegador vivo | 17 pruebas en verde; incluye los dos cierres de sesión y Pedidos en los cinco tamaños. |
| Gate canónico estricto | 13 archivos, 62 definiciones, sin errores, warnings ni fallos de infraestructura. Los dos INFO de aserciones del recorrido responsive quedaron KEEP. |
| Tipos, build y lint | Verdes en el mismo CI. |

El motor aceptó ambos manifiestos y marcó las cuatro causas de código `verified`.
`qa-core.json`, `qa-pedidos.json` y `qa-verification.md` son copias del recibo validado;
los artefactos nativos completos están en el CI enlazado y en los resultados locales
ignorados de w0. La documentación de arquitectura pasó revisión de contenido y enlaces
locales: se conserva como `applied`, sin atribuirle pruebas conductuales.

| Sesión | PR | Entregable |
|---|---|---|
| w0 | [#16](https://github.com/ProjectAppLabs/waiter_project/pull/16) | Arquitectura vigente, mapas, configuración y registros. |
| w1 | [#17](https://github.com/ProjectAppLabs/waiter_project/pull/17) | Cierre offline e invalidación de lecturas tardías; SSE terminal sin reconexión. |
| w2 | [#18](https://github.com/ProjectAppLabs/waiter_project/pull/18) | Agregados de turnos, cifras intactas y consultas constantes. |
| w3 | [#19](https://github.com/ProjectAppLabs/waiter_project/pull/19) | Búsqueda y creación de Pedidos alcanzables, sin alterar su función. |

La publicación posterior del recibo sólo modifica este directorio de documentación;
no cambia aplicación, pruebas, dependencias ni configuración. El tren contrasta esa
igualdad antes de drenar los PRs. El draft de integración #20 no se mergea.
