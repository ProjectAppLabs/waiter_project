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
`IMPROVEMENT_LEDGER_DIR`, conservando los IDs y la historia del catálogo inicial. No se
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
El resumen definitivo de pruebas, PRs e integración se añade al cerrar la ronda.

## Correcciones de la propia validación

El Auditor pidió reubicar la prueba de la API de turnos bajo `sales/tests/views/` y
congelar su reloj. w2 conserva esas pruebas conductuales y corrige ambos hallazgos;
el conductor adapta el runner al destino correcto. No se rebajan reglas ni se añaden excepciones.
