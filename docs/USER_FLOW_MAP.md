# Mapa de flujos E2E · Acceso, Pedidos, Pago e Historial del POS

La ronda `2026-10-07-waiter-x0` cubre Pago e Historial; `2026-10-08-waiter-w0` añade
salida offline y la entrada al asistente de Pedidos. La ronda `waiter-r3-20261008` amplía
el contrato de importes finales, las rondas, la emergencia y la conciliación de pagos;
su ejecución sólo se acredita en el recibo de QA del SHA exacto combinado. La ronda r4
añade Cocina, Inventario → Menú y Operación en vivo en tableta y celular, y el cobro con
tarjeta y con propina sugerida. El alta en staging añade la entrada del comensal por QR, su service
worker y el reparto por host de la app única. Este mapa no certifica el resto del POS ni del comensal.
El registro vive en `frontend/e2e/flow-definitions.json`.

## Convenciones y roles

Cada prueba calificable lleva `@flow:<id>` y `@outcome:<success|error|failure|display>`. Un display entra por la UI y afirma datos concretos. Historial se alcanza desde su pestaña principal. El contrato por tamaño prueba 835×1194 primero, luego 412×915, 1195×835, 1440×900 y 2560×1440. Se comprueba que las acciones se puedan terminar y los controles no queden recortados por ancestros; una captura o scrollWidth aislado no acredita la interacción.

La preparación usa un propietario sintético: login → Organización → Restaurantes → Local QA → Entrar al POS. `rondaFixture.ts` recorre ese puente una vez por worker y conserva el estado real en memoria. Cada caso restaura ese estado en un contexto nuevo, abre Dashboard y entra a Pago o Historial por la navegación del POS en desktop; luego cambia al tamaño objetivo. Ese puente no certifica la consola, Dashboard ni Pedidos en compacto. El aviso de éxito y sus importes sí pertenecen al contrato de Pago; el desborde global se mide antes de pulsar Listo.

Cobran cashier, admin y los roles con charge_orders; Historial requiere su vista habilitada y Devolver exige refund_orders y conexión. La impresión nativa no produce resultado posterior observable por la aplicación y conserva la exención expectedSpecs: 0.

## Pago

| Flujo | Interacción y resultados | Evidencia |
|---|---|---|
| pos-payment-checkout | Pedido, total y métodos reales; efectivo suficiente, tarjeta aprobada y QR; importe parcial, reparto y propina. Éxito con importe, método y cambio. Rechazo visible por efectivo insuficiente, QR no configurado o fallo del servidor. | `frontend/app/(waiter)/(pos)/pago/[orderId]/page.tsx:8`; `frontend/components/payment/PaymentModal.tsx:66`; `frontend/components/payment/PaymentPanels.tsx:37`; `frontend/lib/stores/orderStore.ts:85` |
| pos-payment-member-benefit | Buscar socio, ver código/nombre/puntos y aplicar beneficio. Código desconocido y saldo cambiado muestran su error sin terminar el cobro. | `frontend/components/payment/PaymentModal.tsx:137`; `frontend/lib/services/paymentKit.ts:24` |
| pos-payment-print-receipt | Exento: impresión nativa sin resultado propio observable. | `frontend/components/payment/PaymentSuccess.tsx:41` |

## Historial

| Flujo | Interacción y resultados | Evidencia |
|---|---|---|
| pos-history-review | Pestaña Historial, búsqueda/filtros, selección y cliente/líneas/subtotal/impuestos/total concretos. Si falla la lista, termina la carga y aparece vacío. | `frontend/lib/domain/navigation.ts:6`; `frontend/components/kit/TopBar.tsx:56`; `frontend/app/(waiter)/(pos)/historial/page.tsx:26`; `frontend/components/history/BillInfo.tsx:17` |
| pos-history-refund | Con permiso y conexión, seleccionar líneas/propina, repartir, dar motivo y confirmar. Importe/nota crédito y lista actualizada. Validaciones, permiso, caja cerrada o red fallida visibles. | `frontend/app/(waiter)/(pos)/historial/page.tsx:37`; `frontend/components/history/RefundModal.tsx:42`; `experience/sales/refunds.py:176` |
| pos-history-print-receipt | Exento: impresión nativa sin estado posterior observable. | `frontend/components/history/BillInfo.tsx:63` |

## Estado inicial

Los casos legados ejercen parte del pago y la devolución, pero carecen de los tags del registro nuevo y no reciben crédito automático: `frontend/e2e/pedido.spec.ts:27` y `frontend/e2e/devolucion.spec.ts:20`. La QA de esta ronda valida los cambios seleccionados; cualquier resultado pendiente de los demás comportamientos se conserva como deuda explícita, sin declarar cobertura completa del POS.

## Acceso offline y Pedidos · ronda 2026-10-08

| Flujo | Interacción y resultados | Evidencia |
|---|---|---|
| pos-login-logout | Sesión válida durante caída de Django; cerrar desde Ajustes, confirmar y recargar sin servidor. Dashboard vuelve a login incluso si el cierre remoto falla. Los contextos propios de estos casos no consumen la sesión de las otras pruebas. | `frontend/lib/stores/authStore.ts`; `frontend/lib/offline/cache.ts`; `frontend/lib/services/core/http.ts`; `frontend/e2e/acceso/ronda.spec.ts` |
| pos-orders-review | Entrar a Pedidos por la UI, buscar número y cliente de una cuenta de 38.900, filtrar Sin enviar y limpiar; verificar cuenta, importe y conteos reales. | `frontend/app/(waiter)/(pos)/pedidos/page.tsx`; `frontend/lib/hooks/useKitOrders.ts`; `frontend/e2e/pedidos/ronda.spec.ts` |
| pos-order-create | Pulsar Crear pedido, elegir servicio, seleccionar platos y opciones, comprobar precio final e impuestos en el resumen y confirmar. El guion w0 sólo abría el asistente; la ejecución de r3 sólo se acredita en el recibo del SHA exacto. | `frontend/app/(waiter)/(pos)/pedidos/page.tsx`; `frontend/app/(waiter)/(pos)/pedidos/nuevo/page.tsx`; `frontend/e2e/pedidos/ronda.spec.ts` |

Pedidos usa 835×1194 primero, después 412×915, 1195×835, 1440×900 y 2560×1440. El
guion comprueba rectángulos, recortes de ancestros, controles y desborde documental junto
con la interacción. El guion quedó ejecutado sobre el contenido combinado de w0: 17 pruebas de navegador en verde en el CI 37773308888. El recibo y el SHA exacto se conservan en docs/audits/improvement-2026-10-08-waiter-w0/qa-verification.md; no se atribuye esa ejecución a cambios posteriores.

## Índice de cobertura de la ronda

| Flujo y resultado | Prueba calificable | Límite del guion |
|---|---|---|
| pos-payment-checkout · success | `frontend/e2e/pago/ronda.spec.ts` | Efectivo: pedido de 38.900, recibido 50.000, cambio 11.100 y salida por Listo; cinco tamaños. No acredita tarjeta/QR, reparto, puntos ni resultados negativos. |
| pos-history-review · display | `frontend/e2e/historial/ronda.spec.ts` | Búsqueda y selección de una cuenta real de 38.900; cinco tamaños. No acredita el fallo de lectura ni otros roles. |
| pos-history-refund · display | `frontend/e2e/historial/ronda.spec.ts` | Abrir Devolver, seleccionar el total y comprobar que falta el motivo; cinco tamaños. No se confirma una devolución. |

Las demás clases de resultado continúan sin prueba calificable en esta ronda; los dos flujos de impresión mantienen su exención. La presencia de un archivo o de tags no compra cobertura: el resultado de ejecución y el SHA comprobado se consultan en el reporte `2026-10-07-waiter_project-improvement-pass-project-2026-10-07-waiter-x0.md` del toolkit.

## Navegación de consolas · ronda r2

| Flujo | Comportamiento y evidencia |
|---|---|
| organization-console-navigation | Dueño: abrir/cerrar menú móvil con foco, Restaurantes → Local QA → POS. `frontend/components/console/ConsoleNavigation.tsx:22`; `frontend/app/(waiter)/organizacion/layout.tsx:47`; `frontend/e2e/consolas/ronda.spec.ts:77`. |
| platform-console-navigation | ProjectApp: abrir/cerrar menú y navegar a Métricas, ver Waiter QA x0 y el periodo. `frontend/app/(waiter)/plataforma/layout.tsx:28`; `frontend/e2e/consolas/ronda.spec.ts:112`. |

El spec declara success/display en los cinco tamaños canónicos, con datos concretos, foco, cierres y espacio útil. El estado de ejecución y el SHA combinado se consultan en docs/audits/improvement-2026-10-08-waiter-r2/README.md; la autoría y los tags no acreditan ejecución. Los resultados error/failure de permisos, módulos, sesión, doble factor y lectura de datos no tienen E2E calificable en esta ronda; los negativos afectados del layout se contrastan en unitarias. El armazón no certifica todos los formularios o tablas de las consolas.


## Importes finales y conciliación de pagos · ronda r3

Esta ampliación describe los contratos de la ronda. Los resultados sólo se
acreditan en el [recibo de QA del SHA exacto](https://github.com/ProjectAppSunset/vps-ops-toolkit/blob/master/docs/audits/2026-10-08-waiter_project-improvement-pass-project-r3.md);
la existencia del mapa no declara un resultado verde. QA contrasta las descripciones y los roles con el contenido combinado antes de
validar el SHA final. Los tags conservan los IDs anteriores para creación y cobro;
los nuevos IDs distinguen acciones reales y se agregan a los specs ya asignados,
sin duplicar pruebas ni abrir otra cadena de validación.

| Flujo | Interacción y resultado concreto | Código y spec asignado |
|---|---|---|
| pos-order-create | Pedidos → Crear pedido → seleccionar Plato gravado QA r3 → resumen → confirmar. La carta, el resumen y el pedido del servidor conservan 11.900. | `frontend/components/orders/OrderWizard.tsx:62`; `frontend/lib/services/orderCreate.ts:44`; `frontend/e2e/pedidos/ronda.spec.ts` |
| pos-order-add-round | Abrir Agregar platos en un pedido existente, seleccionar el mismo plato, comprobar 11.900 y enviar la ronda. El pedido refleja el importe guardado. | `frontend/components/orders/AddRoundScreen.tsx:56`; `frontend/components/orders/AddRoundScreen.tsx:65`; `frontend/e2e/pedidos/ronda.spec.ts` |
| pos-emergency-order | Precargar la carta, perder conexión y crear/cobrar mediante la UI de emergencia: total 11.900, recibido 20.000, cambio 8.100. Reconectar y contrastar el pedido del servidor. | `frontend/lib/offline/emergency.ts:24`; `frontend/components/orders/OrderWizard.tsx:171`; `frontend/app/(waiter)/(pos)/emergencia/page.tsx:26`; `frontend/e2e/pedidos/ronda.spec.ts` |
| pos-payment-checkout | Pago de 38.900 aceptado cuya respuesta se pierde; después cambia el saldo por una propina de 5.000. Reintento y recarga conservan importe y clave originales, sin un segundo pago. El rechazo de una lectura de cuerpo o su timeout conserva la incertidumbre. | `frontend/lib/services/core/http.ts`; `frontend/lib/offline/outbox.ts`; `frontend/e2e/pago/ronda.spec.ts` |
| pos-payment-reconcile | Revisar el pago ambiguo desde el aviso, consultar datos frescos y mostrar la evidencia. Confirmar/reanudar exige prueba concluyente; sin ella la entrada se conserva y no se reenvía. Un fallo de consulta no confirma ni descarta. Si queda saldo, no se cierra como pagado. | `frontend/components/offline/OfflineBar.tsx`; `frontend/lib/offline/outbox.ts`; `frontend/lib/services/core/sales.ts`; `experience/sales/reading.py`; `frontend/e2e/pago/ronda.spec.ts` |

Las pruebas de creación, ronda y emergencia se asignan a `pedidos/ronda.spec.ts`
con `@outcome:success` y `@outcome:display`. La recuperación del cobro conserva
`@flow:pos-payment-checkout`; la revisión usa `@flow:pos-payment-reconcile` y sólo
los outcomes efectivamente ejercitados por cada caso. Las clases error/failure
registradas expresan caminos de la UI, no cobertura acreditada. Un caso que corta
la red y luego recupera un pago puede declarar failure/success si comprueba ambos
resultados; la simple presencia del tag no acredita la recuperación.

Las unitarias y el contrato backend también verifican: impuestos incluidos 19 %
y 8 % con base 10.000, combinación de impuestos con total 12.852 y sobreprecio de
2.000 por dos unidades con total 27.800. Estos casos no reciben crédito E2E por
estar cubiertos en otra capa. El snapshot se guarda antes del POST: si falla el
almacenamiento no se envía, y una entrada antigua ambigua no se migra inventando
un importe. Una consulta de conciliación nunca usa una respuesta offline vieja.

La QA combinada requiere el mismo SHA limpio servido por backend y POS, MySQL
8.4 en una base scratch exclusiva, tipos, Jest con la unión exacta de archivos y
gate strict sobre todos los tests tocados. Playwright valida las regresiones
existentes de UI en 835×1194 primero, luego 412×915, 1195×835, 1440×900 y
2560×1440. Los dos guiones financieros nuevos de creación/ronda y emergencia
se ejecutan en 1440×900; los tres casos nuevos de conciliación usan el tamaño
predeterminado de Playwright, 1280×720. La matriz de cinco tamaños no se atribuye
a estos cinco casos nuevos, que no modifican layouts. Los recibos de rondas anteriores permanecen como historia y no
certifican esta ampliación. No se acredita cobertura completa de permisos,
tarjeta/QR ni de todas las clases de resultado por estos guiones.

## Cocina, inventario, operación en vivo y cobro · ronda r4

Tres pantallas del POS quedan usables en tableta y celular, y el cobro con tarjeta y
con propina termina contra el servidor. Cada caso prepara sus datos por la API de la
cuenta aislada y después entra, lee y actúa por la UI; el registro de los flujos está
en `frontend/e2e/flow-definitions.json`.

| Flujo | Interacción y resultado concreto | Código y spec asignado |
|---|---|---|
| pos-kitchen-tickets | Dashboard → Cocina por la navegación principal. Una comanda para llevar con nota única muestra su cronómetro y «Iniciar preparación»; al iniciarla, el botón pasa a «Listo todo». Cronómetro y botón alcanzables, sin desborde horizontal del documento. Si el servidor rechaza la lectura o la acción, el error queda en una alerta. | `frontend/app/(waiter)/(pos)/kds/page.tsx:74`; `frontend/app/(waiter)/(pos)/kds/page.tsx:69`; `frontend/components/kds/TicketCard.tsx:38`; `frontend/components/kds/TicketCard.tsx:91`; `frontend/e2e/cocina/ronda.spec.ts:32` |
| pos-inventory-dishes | Dashboard → Inventario por la navegación principal. En la «Lista del menú», el nombre de un plato propio no queda tapado por «Agotar aquí» ni la insignia «Disponible» por el lápiz de edición; agotarlo en este restaurante deja a la vista «Volver a ofrecer». Sin desborde horizontal. Si agotarlo falla, un aviso muestra el error. | `frontend/app/(waiter)/(pos)/inventario/page.tsx:155`; `frontend/app/(waiter)/(pos)/inventario/page.tsx:79`; `frontend/components/pantry/FilterPanel.tsx:21`; `frontend/components/pantry/DishCard.tsx:41`; `frontend/e2e/inventario/ronda.spec.ts:28` |
| pos-operations-shift | Operación en vivo se abre por su dirección, `/operacion`, porque la interfaz no tiene enlace (guía de QA, E-10). En la pestaña Pagos, la fila de un pedido pendiente conserva «Mesa / mesero» (… · Operador QA), el total 38.900 y el estado «Pendiente». Sin desborde horizontal. | `frontend/app/(waiter)/(pos)/operacion/page.tsx:81`; `frontend/app/(waiter)/(pos)/operacion/page.tsx:84`; `frontend/components/ops/ShiftTable.tsx:21`; `frontend/e2e/pedidos/operacion.spec.ts:15` |
| pos-payment-checkout | Pedidos → Cobrar en una cuenta de 38.900 → pestaña Tarjeta → «Confirmar pago» → «Aprobado». Aparece «¡Pago exitoso!» y el servidor tiene el pedido pagado: total 38.900 y pagado 38.900. Antes, el pago con datáfono o QR llevaba el efectivo recibido y el servidor lo rechazaba con «El efectivo entregado debe cubrir el pago.». | `frontend/lib/stores/orderStore.ts:101`; `frontend/e2e/pago/ronda.spec.ts:212` |
| pos-payment-checkout | Pedidos → Cobrar en una cuenta de 38.900 → «Más opciones» → propina «10 % · $ 3.890»; el total pasa a 42.790; efectivo 50.000 → «Pagar ahora». Aparece «¡Pago exitoso!» y el servidor tiene el pedido pagado con propina 3.890, total 42.790 y pagado 42.790. Antes, la propina no se registraba y el pago respondía «El pago supera el saldo del pedido.». | `frontend/lib/stores/orderStore.ts:99`; `frontend/components/payment/PaymentModal.tsx:84`; `frontend/e2e/pago/ronda.spec.ts:226` |

Tamaños: Cocina y Operación se comprueban en 835×1194 y 412×915, los dos anchos donde
se recortaban; Inventario, en los cinco (835×1194, 412×915, 1195×835, 1440×900 y
2560×1440), tableta vertical primero, porque su tarjeta cambia en todos. Cada caso
lleva `@flow`, `@viewport` y un solo outcome: success en Cocina e Inventario,
display en Operación. La clase failure registrada en Cocina e Inventario expresa el
camino de la UI, no cobertura acreditada: ningún caso de esta ronda la ejerce. Los dos
casos de cobro usan el tamaño predeterminado de Playwright, 1280×720, sin la matriz de
cinco: corrigen el contrato con el servidor y no cambian layout.

| Flujo y resultado | Prueba calificable | Límite del guion |
|---|---|---|
| pos-kitchen-tickets · success | `frontend/e2e/cocina/ronda.spec.ts` | Iniciar una comanda en 835×1194 y 412×915. No acredita pulsar «Listo todo», el pase a «Listos por entregar» ni los otros tres anchos. |
| pos-inventory-dishes · success | `frontend/e2e/inventario/ronda.spec.ts` | Agotar un plato propio en los cinco anchos. No acredita volver a ofrecerlo, ingredientes ni solicitudes de compra. |
| pos-operations-shift · display | `frontend/e2e/pedidos/operacion.spec.ts` | La fila de un pedido pendiente en Pagos, en 835×1194 y 412×915. No acredita alertas, los demás filtros ni los otros anchos. |
| pos-payment-checkout · success | `frontend/e2e/pago/ronda.spec.ts` | Desde r4, tarjeta aprobada por 38.900 y efectivo con la propina sugerida del 10 % (42.790), en 1280×720. No acredita QR, propina personalizada, reparto, puntos ni resultados negativos. |

La ejecución de estos once casos (nueve de pantallas y dos de cobro) sólo se acredita
en el recibo de QA del SHA combinado de r4; la evidencia local de los frentes no lo
sustituye.

## Comensal y hosts · alta en staging (app única)

El POS, el comensal y la landing son una sola app de Next en `frontend/`. `proxy.ts` decide el sitio por el host y
`next.config.ts` reescribe al prefijo interno (`/diner` o `/landing`) sin cambiar la dirección del navegador. Los casos
corren contra el build de producción de la ronda (`next start` en 127.0.0.1:3117): el comensal en `menu.localhost`, que
Chromium resuelve solo, y el dominio central y un host ajeno mapeados al mismo servidor con `--host-resolver-rules`. La
mesa del comensal es la 932 de la fixture (`scripts/calidad/seed_ronda.py`); la 931 queda para los pedidos del POS.

| Flujo | Interacción y resultado concreto | Código y spec asignado |
|---|---|---|
| diner-table-entry | El enlace de la mesa con la forma que arma el backend, `<host del menú>/<organización>/<sede>/t/<token>`, sin y con barra final: 200 sin redirección y la dirección intacta; la carta pide el contexto de esa mesa (200), «Omitir introducción» muestra «Waiter QA x0 · Local QA · Mesa 932» y tocar «Plato gravado QA r3» abre su ficha en `/t/<token>/plato/<id>` del mismo host. | `experience/experience_app/services/online_payments.py:134`; `frontend/proxy.ts:39`; `frontend/next.config.ts:40`; `frontend/e2e/hosts/ronda.spec.ts:50` |
| diner-installed-app | En el host del menú, el service worker queda registrado en `/sw.js` con scope `/` y un solo registro; al volver a la carta lo controla el mismo, sin otro nuevo. `/sw.js` es byte a byte `public/diner/sw.js` y `/manifest.webmanifest` es «Carta del restaurante». | `frontend/app/(diner)/providers.tsx:11`; `frontend/proxy.ts:39`; `frontend/e2e/hosts/ronda.spec.ts:74` |
| app-host-routing | El dominio central muestra la landing en `/terms`; «política de privacidad» navega a `/privacy` dentro de ella y `/login` es el inicio de sesión del POS. Un host ajeno, aun mandando `x-waiter-sitio: diner`, llega al POS («Waiter · POS») y su `/sw.js`; `/privacy`, el enlace de mesa y `/diner/…` responden 404. | `frontend/proxy.ts:42`; `frontend/proxy.ts:55`; `frontend/e2e/hosts/ronda.spec.ts:100`; `frontend/e2e/hosts/ronda.spec.ts:116` |

| Flujo y resultado | Prueba calificable | Límite del guion |
|---|---|---|
| diner-table-entry · success | `frontend/e2e/hosts/ronda.spec.ts` | Mesa con token nuevo (32 hexadecimales) en un teléfono Pixel 7. No acredita los tokens migrados de Odoo (seis alfanuméricos), que sólo cubre la prueba unitaria del proxy, ni pedir o pagar. |
| diner-installed-app · success | `frontend/e2e/hosts/ronda.spec.ts` | Un registro hecho en la misma corrida; no un teléfono con el service worker de la app vieja del comensal, que tenía la misma ruta y el mismo scope. |
| app-host-routing · success | `frontend/e2e/hosts/ronda.spec.ts` | `/terms`, `/privacy` y `/login` del dominio central; no `/` ni `/data-deletion`, que cubre la prueba unitaria del proxy. |
| app-host-routing · failure | `frontend/e2e/hosts/ronda.spec.ts` | Un host ajeno (`intruso.example`). No acredita la configuración de nginx, que es la que no deja pasar esos hosts. |

Las reglas de decisión, una por una (QR con y sin barra, archivos del menú, rutas compartidas, landing, hosts del POS,
prefijos internos, kit y el encabezado que manda el cliente), están en `frontend/__tests__/proxy.test.ts`.
