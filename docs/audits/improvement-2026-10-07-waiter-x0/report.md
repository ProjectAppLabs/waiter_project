# Waiter · ronda transversal 2026-10-07-waiter-x0

Conductor x0; x1 seguridad, x2 observabilidad/rendimiento, x3 responsividad. Aplicación limitada a tres causas; una QA combinada. El operador autorizó después merge-queue al terminar todas las sesiones.

## Resultado y alcance

Los tres candidatos están aplicados y cuentan con QA aprobada del commit exacto `7ba8900998635d801780abe50934fefe66ad1592`: `I-O-5b23886c570b` (caja), `I-R-5c9d4cf4af07` (Pago) e `I-R-a08f89764dc5` (Historial). El motor canónico registra la evidencia tipada; publicación e integración se cierran después de este dictamen.

| Frente | Resultado de la ronda | Límite |
|---|---|---|
| Seguridad · x1 | Revisión de aislamiento de caja aceptada; tres riesgos registrados. | Identidad local tras logout, cookie del comensal sin Secure y clave MCP en acceso configurado siguen abiertos; diagnóstico parcial. |
| Mantenibilidad · x0 | Revisión de validación compartida, límites catálogo/inventario, devoluciones/facturación y transporte offline. | Sin refactor adicional con beneficio demostrado; no revisión completa del producto. |
| Observabilidad · x2/x0 | Replay de caja y recuperación offline corregidos y probados. | Otros cinco candidatos permanecen abiertos; no se instaló un emisor a ProjectApp. |
| Rendimiento · x2 | Seis mecanismos estáticos registrados. | Sin medición del host de servicio: needs-evidence, severidad mayor provisional. |
| Responsividad · x3 | Pago, su éxito e Historial medidos y probados en cinco tamaños. | Cuatro candidatos originales pendientes; consola, Dashboard, Pedidos y comensal fuera del alcance aplicado. |
| QA · x0 | Verifier APPROVED; todas las capas requeridas ejecutadas sobre el SHA final. | Evidencia primaria en CI aislado; las corridas locales fallidas se conservan como diagnóstico. |
| Entrega · x0 | PR #15 de sesión a main, CI verde. | Integración autorizada por merge-queue; no actualización del checkout de servicio. |

El catálogo inicial contiene 21 candidatos, con 18 fuera del cupo. Se conservan además dos observaciones de QA fuera de los candidatos: recorte de NAV en Dashboard compacto y desborde de 501 px en Pedidos tras Listo. No se declaran suficientes los frentes ni cubierta toda la aplicación.

## Contexto y aislamiento

Waiter usa Django/MySQL en experience y Next.js en pos/diner. El Estado del plan T prevalece sobre historia Odoo. Base inicial main `6273549`; sus cinco commits nuevos de documentación se incorporaron en `408b861`, sin alterar aplicación. Worktree `/home/dev_env/webapps/.wt/waiter_project/improvement-x0`, rama `fix/07102026-improvement-x0`; diff inicial vacío. El clon de servicio se conserva limpio, en su SHA original.

El proyecto no figura en projects.yml. La revisión automática rechazó su alta manual y exige el resolver del fleet; el catálogo no se modificó ni se eludió el guard. Se usó el fallback Git nativo y se verificaron repo, dueño, base y SHA por Git/GitHub, sin asignar un servidor o perfil inventado.

Node 24.20.0/npm 11.19.0 y dependencias declaradas; MySQL 8.4.11 local aislado en puerto 33847, sin sustituir MySQL 8.0 del host. Test runner y guard de seed_ronda crean nombres test_waiter_qa_* sobre loopback y desarrollo, con organización qa-x0, Local QA y pedidos sintéticos de 38.900. No se leyó una .env del servicio ni se migró una base viva. La fixture final local nueva quedó creada, pero no sustituye la evidencia de UI final de CI.

Los registros se publican desde un worktree aislado del toolkit, waiter-x0-records-08102026, basado en el master remoto verificado `7c3328b4`. El checkout compartido del toolkit conserva generación y cambios ajenos; no se hace pull/stash/reset. Commits de registros directamente a master, sin PR y sin propagación, por R26/L051.

## Caja · I-O-5b23886c570b

Una respuesta perdida después del POST aceptado podía provocar doble contabilización. El cliente genera la identidad antes del primer envío y la conserva al encolar. El servidor usa ExactCharField nullable con unicidad por turno/clave y bloqueo del turno: contenido normalizado idéntico devuelve el movimiento original y el saldo esperado actual sin nuevo evento; contenido distinto devuelve 409. Replay confirmado permite recuperar respuesta tras cierre; una clave nueva en turno cerrado se rechaza. Autenticación, permiso sales y sede preceden al lookup.

Las llamadas antiguas sin clave conservan compatibilidad. Entradas históricas de cola sin identidad demostrable quedan retenidas para revisión, durante hydrate o ya cargadas, y no se reenvían; no bloquean movimientos independientes. El 401 conserva entrada/clave hasta reanudar sesión.

Migración aditiva 0009_cashmove_request_key, sin backfill. Orden de despliegue: esquema/backend antes del cliente. Esta ronda no ejecuta un despliegue.

Guion validado: replay/saldo/evento únicos; conflicto por tipo/importe/motivo; replay tras cierre; clave nueva cerrada; 401/403/404 y tenant antes de dedupe; NULL y comparación exacta de mayúsculas; dos carreras MySQL; pérdida de respuesta, recarga, relogin y cuarentena del legado. Capas backend y frontend-unit.

## Pago e Historial

Matriz: 835×1194 primero, 412×915, 1195×835, 1440×900 y 2560×1440. Pago tenía mínimo intrínseco 798 px en 412; después mide 380 px con métodos, cierre 44×44, importe a 16 px y confirmación alcanzables. Historial desbordaba hasta 918 px en compacto/retrato; buscador, lista, cuenta y Devolver recuperan acceso. AST de aplicación sin className coincide antes/después.

El aviso de éxito tenía ancho 480 px y dejaba importes/Listo fuera de 412; dos className en PaymentSuccess lo llevan a 364 px y preservan 480 en retrato. Inventario comprobó total 38.900, recibido 50.000, cambio 11.100 y salida a Pedidos. Inventario local anterior/posterior y capturas: test-results/improvement/2026-10-07-waiter-x0/responsive/. Son reproducción de causa, separados de la certificación del SHA final.

Los specs entran por navegación POS y después cambian tamaño dentro del candidato. El chequeo global de Pago ocurre mientras su éxito sigue visible, antes de Listo. Historial busca una cuenta única, la selecciona y abre Devolver, selecciona el total y comprueba que falta motivo; no confirma la devolución. Se verifican controles/ancestros, no sólo scrollWidth.

## QA final y procedencia

Fuente primaria: [CI 37714754593](https://github.com/ProjectAppLabs/waiter_project/actions/runs/37714754593), tres jobs success, checkout explícito `7ba8900998635d801780abe50934fefe66ad1592` en cada uno. E2E sirve el build del mismo checkout y su backend/DB de pruebas; no acredita el servidor del servicio ni un SHA anterior.

| Control | Evidencia nativa | Resultado |
|---|---|---|
| Caja/concurrencia MySQL 8.4 | backend-ronda/backend.xml | 23 passed; sin errores/fallos/skips. |
| Permisos de caja | backend-ronda/backend-permissions.xml | 56 passed, 281 deselected; sin errores/fallos/skips. |
| POS unitario | pos-ronda/junit.xml | 7 suites, 38 passed; rutas literales con runTestsByPath. |
| Pago e Historial vivos | navegador-ronda/test-results/improvement/2026-10-07-waiter-x0/playwright.json | 10 expected, 0 unexpected/skipped/flaky; 1 worker, retries 0. |
| Gate canónico de la unión | pos-ronda/gate.json | 6 archivos/20 definiciones; 0 errors/warnings/infra, 1 INFO de aserciones del mismo cobro. |
| Helpers | pos-ronda/helpers-eslint.json | 4 archivos; 0 errores/advertencias. |
| Tipos y build | run.log + jobs del mismo CI | success. |

Artefactos descargados bajo test-results/improvement/2026-10-07-waiter-x0/ci-final-v2/; incluye run-meta.json/run.log. Manifest regular: verification-final.json; reporte local regular: qa-verification-final.md. Los candidatos se asocian a tests que ejecutaron comportamiento; el gate estático no compra cobertura. El Auditor dejó KEEP; no se creó baseline ni se alteraron reglas/severidad/core. La INFO de aserciones corresponde al cobro completo y su estado persistido.

El monorepo usa roots Python físicos explícitos y alias temporales al POS real, sin copiar tests. El core coincide byte a byte con el canónico. El engine genérico aún no descubre/enruta toda esa estructura: su verify E2E adicional se declara parcial. El gate completo nativo de CI y el manifest tipado de todas las capas acreditan la unión antes de liberar el marcador por el motor canónico.

El mapa de seis flujos es acotado: cobra efectivo success y consulta/devolución display; los dos de impresión están exentos. Otros métodos, roles y resultados siguen como gaps explícitos. No certifica el POS entero ni el comensal.

## Fallos conservados y reparación autorizada

El backend local completo de 441 casos se interrumpió con SIGINT por abarcar 49 rutas ajenas; queda incompleto. El Architect acotó a casos nuevos y seis regresiones de efectivo/turnos, más la matriz shifts en comando separado. En 408b861 se midieron 23 y 56 verdes; no se reutilizan como prueba del SHA final. El CI final reejecutó la unión necesaria.

Jest omitía Historial al interpretar los paréntesis de su ruta como regex: seis suites/31 no eran las siete requeridas. Se cambió a runTestsByPath y el CI final acredita 38.

La primera autoría omitía el puente de propietario: login abre Organización y se debe entrar por Restaurantes → Local QA → Entrar al POS. El Architect lo corrigió por UI. Los rojos compactos que medían Dashboard/Pedidos se delimitaron a sus vistas, conservando los controles completos de los candidatos y esas observaciones abiertas.

La corrida f1 dejó seis verdes/cuatro rojos. El Healer alcanzó el límite de tres intentos en Pago wide; regresión Historial5/Pago4. El operador autorizó continuar el 2026-10-08. La medición desplazamiento+rectángulo atómica conserva dimensiones, fuente, viewport y recortes. Un lanzamiento omitió el runtime solicitado y queda documentado; el lanzamiento correcto agotó el presupuesto al pulsar Listo. La preparación por UI una vez por worker permitió el focal wide en 37,6 s; la regresión local posterior Historial5/Pago0 degradó incluso el setup. Todos sus JSON/logs/traces permanecen en healer-artifacts/. No se declara esa corrida verde ni se aumenta timeout.

La sesión real se captura en memoria tras el puente UI y se cierra inmediatamente su contexto temporal; cada caso recibe contexto y página nuevos, entra desde Dashboard mediante navegación y crea un pedido único. Los imports de test usan esa fixture; assertions, cinco tamaños, un worker, 60 s y cero retries permanecen. ESLint confundía callback use con hook React: se renombró provide y se añadió lint explícito de los cuatro helpers al CI, sin desactivar el detector.

Primeras matrices CI verdes ed7e0c6 y 26fa9a8 permitieron retirar draft-unvalidated. La entrega final corresponde sólo a 7ba8900. Hubo caída runserver, un reset de proxy y una prueba coincidente con reinicio: permanecen como errores de entorno. Los launchers son propios del worktree (Gunicorn/Next build), sin editar servicios del host. El cierre primario usa CI aislado, no certifica el presupuesto del host local.

## Publicación e integración autorizada

PR [#15](https://github.com/ProjectAppLabs/waiter_project/pull/15), sesión x0 · 01a11839-3d96-7560-87e9-3374ade349d6, base main. El censo preliminar encontró 22 ramas remotas ya en base y sólo esta unidad pendiente. Se verifica el censo, SHA y CI otra vez antes de integrar; con una unidad conjunta y verde no se inventa un tren adicional.

La publicación de registros y el resultado exacto de merge-queue se añadirán al terminar. El checkout del servicio no se actualiza. Los restantes 18 candidatos y las dos observaciones de QA siguen abiertos para una próxima pasada.
