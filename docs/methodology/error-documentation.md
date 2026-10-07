# Errores de la ronda

| Error | Observación | Estado |
|---|---|---|
| Doble movimiento por respuesta perdida | El cliente podía reenviar sin identidad estable; saldo y evento se creaban de nuevo. | Corrección aplicada; pendiente de prueba concurrente en MySQL. |
| Pago fuera del ancho compacto | Diálogo de 798 px en viewport de 412 px; métodos y cierre quedaban fuera. | Layout aplicado; pendiente de cobro completo en QA. |
| Historial fuera del ancho compacto y retrato | Ancho de documento 918 px; devolución inaccesible. | Layout aplicado; pendiente de QA con valores reales. |
| Resolver sin proyecto | `waiter_project` no está en `projects.yml`; el alta manual fue rechazada por el guard del fleet. | Registro sin modificar; coordenada de esta sesión comprobada directamente con Git. |

Las mediciones y los resultados definitivos pertenecen al reporte de la ronda,
no son certificaciones globales. Los artefactos locales se conservan en
`test-results/improvement/2026-10-07-waiter-x0/` (ignorados por Git).
