# Contexto de la ronda · 2026-10-07 / 2026-10-08

Ronda `2026-10-07-waiter-x0`, rama `fix/07102026-improvement-x0`, base `main`.
Conductor x0: selección, mantenibilidad, Git, registros y una QA final.
x1 terminó la revisión de seguridad; x2 terminó observabilidad/rendimiento y la
revisión de caja; x3 entregó los layouts y su evidencia antes/después. Los
Engineers de QA entregaron tests por capa; un Verifier ejecuta el contenido
final limpio. El estado de ejecución se conserva en el reporte del toolkit.

Tres causas seleccionadas: `I-O-5b23886c570b` (caja), `I-R-5c9d4cf4af07`
(Pago) e `I-R-a08f89764dc5` (Historial). Aplicación y guiones terminados.
Otros 18 candidatos permanecen abiertos por el cupo; seguridad y rendimiento
no se declaran suficientes ni agotados.

Se preparó una base MySQL 8.4 aislada, sin tocar el servicio ni ejecutar
migraciones desde el worktree sobre una base viva. El registro del fleet no
reconoce el proyecto y su guard rechazó el alta manual; no se elude ese guard.

El cierre exige saldo/eventos/permisos/concurrencia sobre MySQL real, Pago e
Historial en los cinco tamaños, gate canónico y evidencia del SHA final, con
registros publicados y PR verde. El operador añadió explícitamente el cierre
por merge-queue al terminar todas las sesiones; no autoriza un despliegue ni
actualizar el clon del servicio.

La regresión acotada conserva los fallos anteriores. El operador autorizó el
ajuste adicional de medición: scroll instantáneo y rectángulo se obtienen en
una sola operación, manteniendo todas las aserciones y el límite de tiempo.
La preparación de sesión se ejecuta por UI una vez por worker; cada caso
restaura ese estado real en memoria y conserva un contexto independiente.
Las pruebas se limitan a los candidatos y su regresión inmediata; no se
certifica el POS completo ni el comensal.
