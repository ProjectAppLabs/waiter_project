# Evidencia publicada de la ronda transversal

Estas son copias de los registros propios de Waiter generados por el motor canónico del toolkit. El código auditado es `7ba8900998635d801780abe50934fefe66ad1592`; CI 37714754593 ejecutó y aprobó las capas requeridas. La publicación de estas copias es posterior y sólo añade documentación: no modifica aplicación, pruebas, reglas ni configuración.

El 2026-10-08 el push final de registros fue rechazado con HTTP403 porque el repositorio vps-ops-toolkit se encuentra archivado en ProjectAppSunset. Las APIs de sus nombres anteriores remiten al mismo repositorio archivado. No se desarchivó, no se modificaron sus remotes compartidos ni el catálogo projects.yml. Los commits locales de registros permanecen conservados: f6ea3781 (memoria) y ffaa708c (evidencia/retro).

El PR de Waiter publica sólo los registros pertenecientes a esta ronda para conservar una entrega revisable. Estos archivos son snapshots documentales; no sustituyen el writer canónico ni la autoridad del registro global del toolkit. El CI del PR comprueba también el commit que incorpora las copias. La igualdad de las fuentes de aplicación y tests con el SHA auditado se verifica en la entrega.

- improvement-ledger.yml: decisiones y asociación de los tres candidatos con su QA; otros 18 pendientes.
- qa-memory.yml: forma del proyecto y trampas verificadas, sin métricas de cobertura.
- report.md: alcance, decisiones, resultados, fallos conservados y fuentes.
- engine-verification.md: recibo del verify canónico y el manifiesto de ejecución.
- retro.md: únicamente el hallazgo de sistema de esta ronda, sin copiar el historial de otros proyectos.

Los artefactos nativos pertenecen al CI del PR y a la carpeta local ignorada test-results/improvement/2026-10-07-waiter-x0/. La verificación primaria de UI es CI aislado, no la regresión local fallida. Los snapshots apuntan al código auditado antes de su publicación documental y antes del squash de integración.
