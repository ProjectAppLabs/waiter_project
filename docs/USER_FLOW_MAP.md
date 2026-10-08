# Mapa de flujos E2E · Acceso, Pedidos, Pago e Historial del POS

La ronda `2026-10-07-waiter-x0` cubre Pago e Historial; `2026-10-08-waiter-w0` añade
salida offline y la entrada al asistente de Pedidos. La ronda `waiter-r3-20261008` amplía
el contrato de importes finales, las rondas, la emergencia y la conciliación de pagos;
su ejecución sólo se acredita en el recibo de QA del SHA exacto combinado. Este mapa no
certifica el resto del POS ni el comensal. El registro vive en `pos/e2e/flow-definitions.json`.

## Convenciones y roles

Cada prueba calificable lleva `@flow:<id>` y `@outcome:<success|error|failure|display>`. Un display entra por la UI y afirma datos concretos. Historial se alcanza desde su pestaña principal. El contrato por tamaño prueba 835×1194 primero, luego 412×915, 1195×835, 1440×900 y 2560×1440. Se comprueba que las acciones se puedan terminar y los controles no queden recortados por ancestros; una captura o scrollWidth aislado no acredita la interacción.

La preparación usa un propietario sintético: login → Organización → Restaurantes → Local QA → Entrar al POS. `rondaFixture.ts` recorre ese puente una vez por worker y conserva el estado real en memoria. Cada caso restaura ese estado en un contexto nuevo, abre Dashboard y entra a Pago o Historial por la navegación del POS en desktop; luego cambia al tamaño objetivo. Ese puente no certifica la consola, Dashboard ni Pedidos en compacto. El aviso de éxito y sus importes sí pertenecen al contrato de Pago; el desborde global se mide antes de pulsar Listo.

Cobran cashier, admin y los roles con charge_orders; Historial requiere su vista habilitada y Devolver exige refund_orders y conexión. La impresión nativa no produce resultado posterior observable por la aplicación y conserva la exención expectedSpecs: 0.

## Pago

| Flujo | Interacción y resultados | Evidencia |
|---|---|---|
| pos-payment-checkout | Pedido, total y métodos reales; efectivo suficiente, tarjeta aprobada y QR; importe parcial, reparto y propina. Éxito con importe, método y cambio. Rechazo visible por efectivo insuficiente, QR no configurado o fallo del servidor. | `pos/app/(pos)/pago/[orderId]/page.tsx:8`; `pos/components/payment/PaymentModal.tsx:66`; `pos/components/payment/PaymentPanels.tsx:37`; `pos/lib/stores/orderStore.ts:85` |
| pos-payment-member-benefit | Buscar socio, ver código/nombre/puntos y aplicar beneficio. Código desconocido y saldo cambiado muestran su error sin terminar el cobro. | `pos/components/payment/PaymentModal.tsx:137`; `pos/lib/services/paymentKit.ts:24` |
| pos-payment-print-receipt | Exento: impresión nativa sin resultado propio observable. | `pos/components/payment/PaymentSuccess.tsx:41` |

## Historial

| Flujo | Interacción y resultados | Evidencia |
|---|---|---|
| pos-history-review | Pestaña Historial, búsqueda/filtros, selección y cliente/líneas/subtotal/impuestos/total concretos. Si falla la lista, termina la carga y aparece vacío. | `pos/lib/domain/navigation.ts:6`; `pos/components/kit/TopBar.tsx:56`; `pos/app/(pos)/historial/page.tsx:26`; `pos/components/history/BillInfo.tsx:17` |
| pos-history-refund | Con permiso y conexión, seleccionar líneas/propina, repartir, dar motivo y confirmar. Importe/nota crédito y lista actualizada. Validaciones, permiso, caja cerrada o red fallida visibles. | `pos/app/(pos)/historial/page.tsx:37`; `pos/components/history/RefundModal.tsx:42`; `experience/sales/refunds.py:176` |
| pos-history-print-receipt | Exento: impresión nativa sin estado posterior observable. | `pos/components/history/BillInfo.tsx:63` |

## Estado inicial

Los casos legados ejercen parte del pago y la devolución, pero carecen de los tags del registro nuevo y no reciben crédito automático: `pos/e2e/pedido.spec.ts:27` y `pos/e2e/devolucion.spec.ts:20`. La QA de esta ronda valida los cambios seleccionados; cualquier resultado pendiente de los demás comportamientos se conserva como deuda explícita, sin declarar cobertura completa del POS.

## Acceso offline y Pedidos · ronda 2026-10-08

| Flujo | Interacción y resultados | Evidencia |
|---|---|---|
| pos-login-logout | Sesión válida durante caída de Django; cerrar desde Ajustes, confirmar y recargar sin servidor. Dashboard vuelve a login incluso si el cierre remoto falla. Los contextos propios de estos casos no consumen la sesión de las otras pruebas. | `pos/lib/stores/authStore.ts`; `pos/lib/offline/cache.ts`; `pos/lib/services/core/http.ts`; `pos/e2e/acceso/ronda.spec.ts` |
| pos-orders-review | Entrar a Pedidos por la UI, buscar número y cliente de una cuenta de 38.900, filtrar Sin enviar y limpiar; verificar cuenta, importe y conteos reales. | `pos/app/(pos)/pedidos/page.tsx`; `pos/lib/hooks/useKitOrders.ts`; `pos/e2e/pedidos/ronda.spec.ts` |
| pos-order-create | Pulsar Crear pedido, elegir servicio, seleccionar platos y opciones, comprobar precio final e impuestos en el resumen y confirmar. El guion w0 sólo abría el asistente; la ejecución de r3 sólo se acredita en el recibo del SHA exacto. | `pos/app/(pos)/pedidos/page.tsx`; `pos/app/(pos)/pedidos/nuevo/page.tsx`; `pos/e2e/pedidos/ronda.spec.ts` |

Pedidos usa 835×1194 primero, después 412×915, 1195×835, 1440×900 y 2560×1440. El
guion comprueba rectángulos, recortes de ancestros, controles y desborde documental junto
con la interacción. El guion quedó ejecutado sobre el contenido combinado de w0: 17 pruebas de navegador en verde en el CI 37773308888. El recibo y el SHA exacto se conservan en docs/audits/improvement-2026-10-08-waiter-w0/qa-verification.md; no se atribuye esa ejecución a cambios posteriores.

## Índice de cobertura de la ronda

| Flujo y resultado | Prueba calificable | Límite del guion |
|---|---|---|
| pos-payment-checkout · success | `pos/e2e/pago/ronda.spec.ts` | Efectivo: pedido de 38.900, recibido 50.000, cambio 11.100 y salida por Listo; cinco tamaños. No acredita tarjeta/QR, reparto, puntos ni resultados negativos. |
| pos-history-review · display | `pos/e2e/historial/ronda.spec.ts` | Búsqueda y selección de una cuenta real de 38.900; cinco tamaños. No acredita el fallo de lectura ni otros roles. |
| pos-history-refund · display | `pos/e2e/historial/ronda.spec.ts` | Abrir Devolver, seleccionar el total y comprobar que falta el motivo; cinco tamaños. No se confirma una devolución. |

Las demás clases de resultado continúan sin prueba calificable en esta ronda; los dos flujos de impresión mantienen su exención. La presencia de un archivo o de tags no compra cobertura: el resultado de ejecución y el SHA comprobado se consultan en el reporte `2026-10-07-waiter_project-improvement-pass-project-2026-10-07-waiter-x0.md` del toolkit.

## Navegación de consolas · ronda r2

| Flujo | Comportamiento y evidencia |
|---|---|
| organization-console-navigation | Dueño: abrir/cerrar menú móvil con foco, Restaurantes → Local QA → POS. `pos/components/console/ConsoleNavigation.tsx:22`; `pos/app/organizacion/layout.tsx:47`; `pos/e2e/consolas/ronda.spec.ts:77`. |
| platform-console-navigation | ProjectApp: abrir/cerrar menú y navegar a Métricas, ver Waiter QA x0 y el periodo. `pos/app/plataforma/layout.tsx:28`; `pos/e2e/consolas/ronda.spec.ts:112`. |

El spec declara success/display en los cinco tamaños canónicos, con datos concretos, foco, cierres y espacio útil. El estado de ejecución y el SHA combinado se consultan en docs/audits/improvement-2026-10-08-waiter-r2/README.md; la autoría y los tags no acreditan ejecución. Los resultados error/failure de permisos, módulos, sesión, doble factor y lectura de datos no tienen E2E calificable en esta ronda; los negativos afectados del layout se contrastan en unitarias. El armazón no certifica todos los formularios o tablas de las consolas.


## Importes finales y conciliación de pagos · ronda r3

Esta ampliación describe los contratos de la ronda. Los resultados sólo se
acreditan en el [recibo de QA del SHA exacto](https://github.com/carlos18bp/vps-ops-toolkit/blob/master/docs/audits/2026-10-08-waiter_project-improvement-pass-project-r3.md);
la existencia del mapa no declara un resultado verde. QA contrasta las descripciones y los roles con el contenido combinado antes de
validar el SHA final. Los tags conservan los IDs anteriores para creación y cobro;
los nuevos IDs distinguen acciones reales y se agregan a los specs ya asignados,
sin duplicar pruebas ni abrir otra cadena de validación.

| Flujo | Interacción y resultado concreto | Código y spec asignado |
|---|---|---|
| pos-order-create | Pedidos → Crear pedido → seleccionar Plato gravado QA r3 → resumen → confirmar. La carta, el resumen y el pedido del servidor conservan 11.900. | `pos/components/orders/OrderWizard.tsx:62`; `pos/lib/services/orderCreate.ts:44`; `pos/e2e/pedidos/ronda.spec.ts` |
| pos-order-add-round | Abrir Agregar platos en un pedido existente, seleccionar el mismo plato, comprobar 11.900 y enviar la ronda. El pedido refleja el importe guardado. | `pos/components/orders/AddRoundScreen.tsx:56`; `pos/components/orders/AddRoundScreen.tsx:65`; `pos/e2e/pedidos/ronda.spec.ts` |
| pos-emergency-order | Precargar la carta, perder conexión y crear/cobrar mediante la UI de emergencia: total 11.900, recibido 20.000, cambio 8.100. Reconectar y contrastar el pedido del servidor. | `pos/lib/offline/emergency.ts:24`; `pos/components/orders/OrderWizard.tsx:171`; `pos/app/(pos)/emergencia/page.tsx:26`; `pos/e2e/pedidos/ronda.spec.ts` |
| pos-payment-checkout | Pago de 38.900 aceptado cuya respuesta se pierde; después cambia el saldo por una propina de 5.000. Reintento y recarga conservan importe y clave originales, sin un segundo pago. El rechazo de una lectura de cuerpo o su timeout conserva la incertidumbre. | `pos/lib/services/core/http.ts`; `pos/lib/offline/outbox.ts`; `pos/e2e/pago/ronda.spec.ts` |
| pos-payment-reconcile | Revisar el pago ambiguo desde el aviso, consultar datos frescos y mostrar la evidencia. Confirmar/reanudar exige prueba concluyente; sin ella la entrada se conserva y no se reenvía. Un fallo de consulta no confirma ni descarta. Si queda saldo, no se cierra como pagado. | `pos/components/offline/OfflineBar.tsx`; `pos/lib/offline/outbox.ts`; `pos/lib/services/core/sales.ts`; `experience/sales/reading.py`; `pos/e2e/pago/ronda.spec.ts` |

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
