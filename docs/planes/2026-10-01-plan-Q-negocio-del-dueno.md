# Plan Q · Lo del negocio, al dueño; lo de la operación, al encargado

**Qué.** El POS mezcla la operación del restaurante con información que solo le sirve a quien decide sobre el negocio.
Este plan separa las dos:
- **Al encargado** le queda lo de su sede: el turno, la caja y las ventas de las que responde.
- **A la consola del dueño** pasa lo del negocio: comparar sedes, contabilidad, facturación, clientes, ROI, pagos y
  rentabilidad.

Además se cierra un hueco de seguridad y se construyen tres herramientas nuevas para el dueño.

## La lógica

- **El encargado administra un turno y responde por su sede.**
  - Le importa:
    - que el salón funcione;
    - que la caja cuadre;
    - cuánto vende hoy, esta semana y este mes frente al periodo anterior;
    - qué se acaba y qué pedir;
    - quién está en turno;
    - cuánto cuesta lo que vende, para controlar desperdicio y mermas.
  - Ejecuta las decisiones del negocio, pero no las toma: precios, carta, promociones, contabilidad, cuentas de pago.
- **El dueño administra un negocio de varias sedes.** Le importa:
  - cuánto deja cada sede y cómo se comparan;
  - el margen;
  - qué platos sostener o quitar;
  - si las promociones funcionan;
  - cumplir con la DIAN;
  - si la licencia se paga sola;
  - si hay cuadres de caja raros.

Decisiones del dueño (2026-10-01):
- El encargado ve la tendencia de **su** sede (semana, mes y comparación con el periodo anterior). Nunca ve otras sedes
  ni la proyección.
- La contabilidad y la facturación de fondo son **solo del dueño** por ahora. Un rol de contador se puede agregar
  después sin rehacer esto.
- El encargado **sí ve costos y márgenes de su sede**.
- **Orden de trabajo:**
  1. mover lo que existe y cerrar el hueco;
  2. el resumen por sede;
  3. los cuadres de caja;
  4. la rentabilidad por plato.

## Inventario: qué es de quién

Leyenda: ✅ lo ve y lo usa · 👁 solo lo ve · ❌ no lo ve.

| Hoy en el POS | Encargado (POS de su sede) | Dueño (consola) |
|---|---|---|
| Dashboard: «Para atender ahora», mesas libres | ✅ | ✅ al entrar al POS de una sede |
| Dashboard: ventas de la semana y del mes, pedidos, ticket promedio | ✅ su sede | ✅ todas, comparadas (Q2) |
| Dashboard: «Cuándo se vende» (horas pico) | ✅ | ✅ |
| Dashboard: «Lo que más se pide» | ✅ | ✅ |
| Dashboard: «Lo que menos se pide» | ✅ su sede (control de mermas) | ✅ con margen (Q4) |
| Dashboard: «Venta esperada el mes que viene» | ❌ | ✅ |
| Ventas: caja, cierre, por turno, hoy y periodos | ✅ su sede | ✅ todas, con exportar (Q2) |
| Retorno de inversión (ahorro, costo de ProjectApp, valor neto) | ❌ | ✅ |
| Configuración → supuestos del ROI | ❌ | ✅ |
| Facturación: ventas por facturar, documentos contables, notas crédito, flujo DIAN | ❌ | ✅ |
| Factura electrónica al cobrar, si el cliente la pide | ✅ se queda en el cobro | — |
| Clientes: base completa, puntos, historial | ❌ | ✅ (los clientes son de la organización desde el plan O) |
| Buscar o crear un cliente al cobrar | ✅ se queda en el cobro | — |
| Inventario: existencias, ingredientes, solicitudes, agotados | ✅ | ✅ |
| Inventario: crear platos; precio, categoría, impuestos y visibilidad del plato | ❌ | ✅ (Catálogo) |
| Inventario: recetas | 👁 | ✅ |
| Inventario: costo del ingrediente | 👁 | ✅ |
| Costo y margen por plato (Q4) | ✅ su sede | ✅ todas |
| Configuración: datos del local, margen de acceso al turno, umbrales de alerta, pantalla | ✅ | ✅ |
| Configuración: métodos de pago y credenciales de la pasarela | 👁 | ✅ |
| Configuración: «cobrar antes de cocina» | 👁 | ✅ |
| Automatización: analítica del mesero IA, configurar la IA | ❌ | ✅ (junto a Integraciones IA) |
| Mesas, Pedidos, Reservas, Cocina, Historial | ✅ | al entrar al POS de una sede |
| Cuadres de caja con diferencia (Q3) | ✅ su sede | ✅ todas |
| Avisos de acceso fuera de turno | ✅ | ✅ |

**Hueco de seguridad.** Hoy el encargado edita desde Inventario la ficha comercial del plato: precio, impuestos y
visibilidad. Ese cambio aplica **a toda la organización**. Se corrige en el servidor, no solo en la pantalla.

## Fases

- **Q1 · Mover lo que existe y cerrar el hueco.**
  - **Consola, secciones nuevas:**
    - **Ventas:** la vista de periodos con selector de sede o «Todas».
    - **Facturación:** la de hoy, con su configuración.
    - **Clientes**.
    - **Retorno de inversión:** el bento con sus supuestos.
    - **Pagos:** métodos y pasarela por sede.
    - **Integraciones IA** absorbe la analítica y la configuración del mesero IA.
  - **POS, Administración del encargado:**
    - Ventas de su sede: caja, turnos y periodos.
    - Configuración: local, umbrales y pantalla; pagos y «cobrar antes de cocina» quedan de solo lectura.
    - Desaparecen Facturación, Clientes y Automatización.
    - El Dashboard pierde la proyección.
  - **Inventario:** la ficha comercial y el alta de platos solo para el dueño. El encargado ve la receta y el costo
    sin editarlos.
  - **Odoo:** los métodos de facturación contable, ROI, credenciales de pago, ficha comercial de producto y alta de
    platos exigen el grupo dueño. Una prueba por cada uno: «Falla si un encargado puede…».
  - Los enlaces viejos del POS (`/facturacion`, `/clientes`, `/automatizacion`):
    - llevan al dueño a su sección de la consola;
    - devuelven al encargado a su inicio.
- **Q2 · Resumen comparativo por sede** (consola → Resumen, la primera sección).
  - **Por sede, lado a lado:** ventas, pedidos, ticket promedio, comensales y propinas.
  - **Periodos:** hoy, semana, mes, mes anterior y rango.
  - Comparación con el periodo anterior y total de la organización.
  - Exportar a CSV.
- **Q3 · Cuadres de caja.**
  - **Qué lista:** los cierres de caja (`pos.session` cerradas) con:
    - sede y quién cerró (con el plan P es la persona, no la tablet);
    - efectivo esperado y contado, y la diferencia (`cash_register_difference`);
    - la nota del cierre.
  - **Filtros:** sede, periodo y «solo con diferencia».
  - **Umbral de tolerancia** configurable por el dueño (por ejemplo, $ 2.000). Lo que lo supera sale en «Para atender»
    del dueño y del encargado de esa sede.
  - El encargado ve los de su sede.
- **Q4 · Rentabilidad por plato.**
  - **Costo del plato:** la suma de su receta (costo de cada ingrediente × cantidad; ya lo calcula `projectapp_pantry`).
  - **Precio:** el de la lista de precios de cada sede (plan O).
  - **Margen y food cost**, porcentaje del costo sobre el precio. Platos sin receta o sin costo se marcan
    «Sin costo», no como 100 % de margen.
  - **Matriz de ingeniería de menú** (popularidad × margen):
    - estrella: se vende mucho y deja mucho;
    - caballo de batalla: se vende mucho y deja poco;
    - rompecabezas: deja mucho y se vende poco;
    - perro: se vende poco y deja poco.
  - **Quién lo ve:** el dueño, todas las sedes; el encargado, su sede.
- **Q5 · Verificación.**
  - Odoo en Docker:
    - un encargado no puede facturar contablemente, ver el ROI, cambiar credenciales ni tocar la ficha comercial;
    - el dueño sí.
  - POS: `tsc` y `jest`.
  - **Chromium:**
    - el encargado no ve lo del dueño, ni siquiera por URL;
    - el dueño encuentra todo en la consola;
    - el resumen cuadra con Ventas de cada sede;
    - un cuadre con diferencia aparece en las alertas;
    - el margen de un plato coincide con su receta.

## Límites asumidos

- **El costo es de la organización:** `standard_price` está en una sola empresa. Si una sede compra más caro, su costo
  no se distingue. Costos por sede (valoración por almacén) quedan fuera.
- **El margen es bruto:** precio menos ingredientes. No descuenta mano de obra, arriendo ni comisiones de pago.
- **Exportar es CSV.** Un informe contable para la DIAN es otra cosa y depende de la integración de facturación
  electrónica (sprint de integraciones, al final).

## Reparto

| Parte | Quién |
|---|---|
| Odoo: permisos del grupo dueño (Q1), resumen por sede (Q2), cuadres (Q3) y rentabilidad (Q4), con pruebas | Codex |
| POS y consola: mover vistas, ocultar y redirigir, Resumen, Cuadres, Rentabilidad | Claude |
| Verificación en Docker y Chromium | Claude |
