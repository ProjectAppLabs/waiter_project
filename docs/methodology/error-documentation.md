# Errores de la ronda

| Error | Observación | Estado |
|---|---|---|
| Doble movimiento por respuesta perdida | El cliente podía reenviar sin identidad estable; saldo y evento se creaban de nuevo. | Clave estable y unicidad por turno aplicadas; guion incluye dos conexiones concurrentes en MySQL, permisos, saldo y evento. |
| Pago fuera del ancho compacto | Diálogo de 798 px en viewport de 412 px; métodos y cierre quedaban fuera. | Layout de Pago y éxito aplicado; guion cobra 38.900, recibe 50.000 y comprueba cambio de 11.100 en cinco tamaños. |
| Historial fuera del ancho compacto y retrato | Ancho de documento 918 px; devolución inaccesible. | Layout aplicado; guion busca la cuenta real de 38.900 y abre la devolución, sin confirmarla. |
| Resolver sin proyecto | `waiter_project` no está en `projects.yml`; el alta manual fue rechazada por el guard del fleet. | Registro sin modificar; coordenada de esta sesión comprobada directamente con Git. |
| Tiempo agotado al medir controles | Las esperas separadas de estabilidad del scroll consumían el presupuesto antes de medir el éxito de Pago. | Ajuste autorizado del helper: scroll instantáneo y medida juntos, sin cambiar assertions ni timeout; rojos previos conservados. |
| Preparación repetida consumía el presupuesto | Login y puente de la consola se repetían dentro de cada caso de layout; el cobro alcanzaba el éxito con poco tiempo para Listo. | Sesión preparada por la misma UI una vez por worker, estado en memoria y contexto nuevo por caso; cada candidato conserva su entrada por navegación, sin ampliar timeout. |
| Comando Jest omitía Historial | Los paréntesis de su ruta se interpretaban como regex y dejaban una suite fuera. | El guion usa runTestsByPath para seleccionar los siete archivos exactos. |

Las mediciones y los resultados definitivos pertenecen al reporte de la ronda,
no son certificaciones globales. Los artefactos locales se conservan en
`test-results/improvement/2026-10-07-waiter-x0/` (ignorados por Git).
