# Ronda de mejora Waiter r2 · 2026-10-08

Base: `main@367c4f78059466a20aeefe35d3d04bac2cb5af79`. El operador aprobó hasta seis causas acotadas, registros en tandas de hasta tres y una sola QA combinada. La ronda anterior (#16–#19) no se repite.

| Frente | Estado inicial | Causa y dueño |
|---|---|---|
| Seguridad | CON BRECHAS | Cookie del comensal sin Secure: I-S-c16a297c8802, w1. Claves MCP en registro de acceso: I-S-af7de5335058, orquestador (configuración global). |
| Mantenibilidad | CON BRECHAS en validación | Runner ligado a nombres de ramas anteriores: I-M-ccd28b260166, orquestador. |
| Observabilidad | CON BRECHAS | Fallo de invitación silenciado: I-O-258297f610e6, w1. |
| Rendimiento | CON BRECHAS | Consultas por cliente al exportar: I-P-73bff8fb3577, w2. |
| Responsividad | CON BRECHAS | Navegación fija de consolas: I-R-6ef846671bd6, w3. |
| QA | CON BRECHAS de alcance | Actualizar mapa/runner y ejecutar la unión, orquestador. |

## Responsabilidades

w1: sesiones e invitaciones y sus pruebas; w2: exportación de clientes y sus pruebas; w3: layouts de ambas consolas, componente propio y sus pruebas. El orquestador es dueño exclusivo de configuración global, helpers, mapas, registros y validación. Ningún archivo pertenece a dos sesiones. Cada implementador conserva commit, push y PR propios. No se absorben frentes delegados ni se incluyen ramas ajenas a esta ronda.

## Contexto y registros

Waiter no figura en projects.yml: el resolver devuelve proyecto desconocido, no wrong-host. Se usa la coordenada explícita aprobada main/worktrees r2. No se modifica el catálogo, el clon principal, las bases del servicio ni el toolkit.

El ledger nuevo conserva el recibo publicado de w0 y se escribe exclusivamente con el motor canónico y `IMPROVEMENT_LEDGER_DIR` apuntando a este directorio/ledger. La selección específica de seis causas fue acordada con el operador; se mantienen las demás como pendientes, incluso las que el orden general del motor pide diagnosticar. No se cambia su política ni se declara suficiente un frente por el cupo.

Instancia local propia MySQL 8.4.11, loopback 3319; sin perfil de producción registrado. Se medirán consultas, no capacidad ni tiempos atribuibles al servidor. Los artefactos propios viven en test-results/improvement/2026-10-08-waiter-r2 y el CI conserva los resultados remotos del SHA exacto.

## Pendientes fuera de esta ronda

Timeout HTTP, conciliación de pagos sin suficiente diagnóstico, importe estable en reenvíos offline, otros informes/exportaciones y otros módulos responsive continúan pendientes. El armazón de las consolas no certifica todos sus formularios y tablas. No se instala ni activa un emisor de ProjectApp.

La entrega requiere cuatro PR con archivos autorizados, una QA conjunta sobre SHA limpio y merge-queue. Un rojo vuelve al dueño; dos intentos fallidos o pérdida de delegación se reportan, sin absorción por el orquestador. No hay despliegue.
