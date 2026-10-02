# Guía QA Waiter — 6. Dueño (consola de la organización)

**Aplica a:** rol Dueño. **Organizaciones:** Burger House (`admin`) para toda la consola; Frisby (`maria.lopez`) para Restaurantes, Equipo, Catálogo e Inventario en el sistema propio.
**Fecha de actualización:** 2 de octubre de 2026

## 1. Qué vamos a comprobar

Que el dueño gobierna su organización desde la consola: sus restaurantes, su equipo y los permisos de cada rol, el catálogo compartido (platos, recetas, ingredientes, costos, categorías y precios por sede), las cifras de negocio de todas las sedes (resumen, ventas, cuadres con tolerancia, rentabilidad, retorno), la política de pagos, los datos de la empresa, los clientes, las promociones y el diseño del menú.

## 2. Preparación

- `admin` / `admin` en `http://localhost:3000/login` → `/organizacion` (Burger House, Odoo).
- `maria.lopez` / `Frisby-2026!` en `http://frisby-74312.localhost:3000/login` → `/organizacion` (Frisby, sistema propio).
- La consola es solo del dueño: cualquier otro rol que escriba `/organizacion` vuelve a `/login`.

## 3. Recorrido de validación

| Caso | Qué va a comprobar | Quién participa | Dónde |
|---|---|---|---|
| D-01 | Restaurantes: lista, nuevo restaurante y límite del plan | Dueño | Burger House y Frisby |
| D-02 | Equipo: invitar, editar, reenviar, restablecer y desactivar | Dueño | Burger House y Frisby |
| D-03 | Matriz «Qué puede hacer cada rol» | Dueño, mesero y cajero | Burger House |
| D-04 | Catálogo: nuevo ingrediente con proveedor y existencias | Dueño | Frisby (y Burger House) |
| D-05 | Catálogo: categoría, nuevo plato y receta con costo | Dueño | Frisby (y Burger House) |
| D-06 | Catálogo: costo del ingrediente y filtros Sin receta / Sin costo | Dueño | Frisby (y Burger House) |
| D-07 | Precios por restaurante y agotado por sede | Dueño | Frisby (y Burger House) |
| D-08 | Cuadres de caja: tolerancia, filtros, nota y aviso | Dueño | Burger House |
| D-09 | Resumen y Ventas por sede | Dueño | Burger House |
| D-10 | Rentabilidad y enlace a platos sin costo | Dueño | Burger House |
| D-11 | Clientes | Dueño | Burger House |
| D-12 | Promociones: cupones, puntos, acciones y banners | Dueño y comensal | Burger House |
| D-13 | Pagos: «Cobrar antes de enviar a cocina» por rol | Dueño y mesero | Burger House |
| D-14 | Empresa e impuestos, Facturación, Retorno | Dueño | Burger House |
| D-15 | Diseño del menú e integraciones IA | Dueño | Burger House |

## 4. Paso a paso

### D-01 — Restaurantes: lista, nuevo restaurante y límite del plan

1. En Restaurantes, revise las tarjetas: cada una dice «Caja abierta» o «Caja cerrada». En Burger House hay «Entrar al POS»; en Frisby ese botón está oculto a propósito (llega con T2).
2. En Frisby, pulse «Nuevo restaurante»: nombre y dirección (slug). Frisby ya tiene dos sedes y su plan permite dos.

**Resultado esperado:** en Frisby el tercer restaurante se rechaza con «Alcanzaste el límite de restaurantes de tu plan.». En Burger House el restaurante nuevo se crea copiando los ajustes de otro y aparece en la lista y en el selector de sede del encargado.

### D-02 — Equipo: invitar, editar, reenviar, restablecer y desactivar

1. En Equipo, revise la tabla agrupada por restaurante, el buscador y los filtros (Todos, Encargados, Cajeros, Meseros, Invitación pendiente). Ordene por una columna.
2. «Nueva persona»: nombre, usuario sugerido, correo, rol Mesero, un restaurante y turno (por ejemplo 08:00–16:00). Guarde.
3. Intente crear un mesero con dos restaurantes, y un encargado con ninguno.
4. En el menú de la persona nueva: «Reenviar invitación». Después de que active (A-06): «Restablecer contraseña».
5. «Editar»: cambie el correo y el turno. Intente cambiar el usuario.
6. «Desactivar» a esa persona. Intente desactivarse a sí mismo.

**Resultado esperado:** el usuario se sugiere desde el nombre (`sofia.mesera`, y `.2` si se repite) y no se cambia después; meseros y cajeros llevan exactamente un restaurante, los encargados uno o más, el dueño ninguno; el estado pasa de «Invitación pendiente» a «Activa»; cambiar el correo invalida la invitación anterior; desactivar conserva el historial y no se puede aplicar sobre uno mismo.

### D-03 — Matriz «Qué puede hacer cada rol»

1. Debajo de la tabla de Equipo, abra la matriz. Compruebe que solo las columnas Mesero y Cajero se editan y que Clientes y Facturación no aparecen.
2. Dé al Cajero la vista Ventas (para que pueda cerrar caja, C-08) y al Mesero la vista Cocina. Guarde.
3. Con la mesera y el cajero ya dentro del POS, espere un minuto o cambie de pestaña y vuelva.
4. Revierta.

**Resultado esperado:** los cambios llegan a los terminales abiertos sin volver a entrar; el Encargado siempre tiene todo; Cuadres, Rentabilidad y Configuración siguen siendo solo del encargado aunque se dé la vista Ventas.

### D-04 — Catálogo: nuevo ingrediente con proveedor y existencias

**Dónde:** Frisby (en Burger House el proveedor ya existe en Odoo).

1. Catálogo → Ingredientes → «Nuevo ingrediente»: nombre, categoría (Carnes y aves), stock inicial 12, unidad Kilogramo. «Guardar y continuar».
2. En el paso Proveedor, escriba un proveedor nuevo y «Agregar proveedor»; quede seleccionado. «Guardar y enviar».
3. Abra el POS de Frisby en `/inventario` → Ingredientes.

**Resultado esperado:** el ingrediente aparece en el catálogo y en Inventario con 12 kg, nivel Medio y su proveedor; en Burger House el asistente muestra los proveedores existentes y no permite guardar sin elegir uno.

### D-05 — Catálogo: categoría, nuevo plato y receta con costo

1. Catálogo → Categorías → «Editar categorías»: cree «Pollo frito» con estación «Freidora». Guarde.
2. Catálogo → Platos → «Nuevo plato»: nombre, categoría recién creada, precio 24.900. «Guardar y continuar». Agregue una línea de receta con el ingrediente de D-04 (0,35 kg). «Guardar y enviar».
3. En la fila del plato pulse «Receta»: revise «Alcanza para N platos» y el costo por plato. Edite la receta y guarde.
4. Pruebe una receta inválida: cantidad cero, el mismo ingrediente dos veces, o una unidad incompatible (litros para un ingrediente en kilos).

**Resultado esperado:** la categoría nueva aparece de inmediato en el asistente del plato sin recargar; el plato nace con el impuesto del régimen de la organización; la receta calcula el costo con los costos de los ingredientes y las porciones por sede con las existencias de cada restaurante; las recetas inválidas se rechazan con un mensaje claro y no borran la receta vigente.

### D-06 — Catálogo: costo del ingrediente y filtros Sin receta / Sin costo

1. Catálogo → Ingredientes: cambie el costo de un ingrediente en la fila y «Guardar». Intente un costo negativo.
2. Catálogo → Platos: use los filtros Todos, Sin receta, Sin costo y Con costo.

**Resultado esperado:** el costo nuevo se refleja en el costo de las recetas que lo usan y en Rentabilidad; el negativo se rechaza; «Sin receta» y «Sin costo» separan los platos sin receta de los que tienen receta pero algún ingrediente sin costo.

### D-07 — Precios por restaurante y agotado por sede

1. Catálogo → Precios por restaurante: a un plato póngale un precio distinto en una sede; luego bórrelo (vacío = precio de la organización).
2. Marque «Agotado aquí» en una sede y «Disponible» en la otra.
3. Compruebe en el POS de esa sede (Inventario → Menú) y, en Burger House, en la carta del comensal.

**Resultado esperado:** el precio por sede rige solo allí y al borrarlo vuelve el base; el agotado es por sede; el encargado puede cambiar el agotado de su sede pero no el precio.

### D-08 — Cuadres de caja: tolerancia, filtros, nota y aviso

1. Negocio → Cuadres de caja: revise todas las sedes (restaurante, turno, quién cerró, fecha, esperado, contado, diferencia, nota). Filtre por sede y periodo, active «solo con diferencia», busque y exporte CSV.
2. Lea la nota del cierre de Poblado con $ 12.000 de faltante.
3. Cambie la tolerancia a $ 5.000 y «Guardar tolerancia». Pida a la encargada un cierre con $ 3.000 de diferencia y luego otro con $ 8.000 (E-07).

**Resultado esperado:** el cierre con nota muestra el texto que escribió el encargado; con tolerancia de $ 5.000 el cierre de $ 3.000 no genera aviso y el de $ 8.000 sí: campana y «Para atender ahora» dicen «Caja de Poblado cerró con $ 8.000 de diferencia (Laura Encargada)».

### D-09 — Resumen y Ventas por sede

1. Negocio → Resumen: ventas, pedidos, ticket, comensales y propinas por sede, frente al periodo anterior; total; «Exportar CSV».
2. Negocio → Ventas: cambie de restaurante con el selector; revise la tarjeta de caja.

**Resultado esperado:** los totales del resumen coinciden con la suma de Ventas de cada sede para el mismo periodo; el CSV trae las mismas cifras.

### D-10 — Rentabilidad y enlace a platos sin costo

1. Negocio → Rentabilidad: por organización y por restaurante. Revise precio, costo, margen, food cost, unidades, utilidad y clase.
2. Pulse el enlace «N platos sin costo».

**Resultado esperado:** los platos sin receta o sin costo salen «Sin costo», no con margen del 100 %; el enlace abre Catálogo con el filtro «Sin receta» activo.

### D-11 — Clientes

1. Clientes → «Nuevo»: cree un cliente con nombre, teléfono y correo. Abra su detalle.
2. Después de C-06 o Co-08, revise su saldo de puntos e historial.

**Resultado esperado:** el cliente se puede elegir en el cobro del POS por su código de socio; los puntos usados o ganados se reflejan en su detalle.

### D-12 — Promociones: cupones, puntos, acciones y banners

1. Promociones: cree un cupón con porcentaje y vigencia, limitado a Poblado; configure los puntos por compra; una acción con premio; un banner.
2. Como comensal (Co-07), use el cupón en Poblado y luego en Laureles.

**Resultado esperado:** el cupón aplica solo en Poblado; el banner aparece en la carta de la sede; los puntos se acreditan al pagar. La sección debe abrir sin el error «La operación pertenece a otro restaurante».

### D-13 — Pagos: «Cobrar antes de enviar a cocina» por rol

1. Contabilidad → Pagos: active «Cobrar antes de enviar a cocina» para el Mesero. Guarde.
2. Como mesera, cree un pedido (M-03).
3. Desactive y repita.

**Resultado esperado:** con la política activa el asistente de la mesera obliga a cobrar antes de mandar a cocina (y como no puede cobrar, debe pedir al cajero); el comensal del menú siempre paga primero sin importar la política; la pasarela solo la ve y edita el dueño.

### D-14 — Empresa e impuestos, Facturación, Retorno

1. Empresa e impuestos: edite datos legales; revise el régimen y la lista de impuestos.
2. Facturación: ventas por facturar, documentos y detalle contable por restaurante.
3. Retorno de inversión: cambie los «Supuestos del cálculo» y vea el resultado por restaurante.

**Resultado esperado:** los datos legales guardan y se muestran al recargar; Facturación lista por sede (la factura electrónica real está fuera de alcance); el ROI recalcula con los supuestos nuevos.

### D-15 — Diseño del menú e integraciones IA

1. Diseño del menú: cambie la plantilla y una decoración; abra la carta del comensal.
2. Integraciones IA: cree una clave MCP y revise el texto del mesero IA.

**Resultado esperado:** la carta refleja la plantilla; la clave se crea y se puede revocar. El contenido del asistente no se valida en esta guía.

## 5. Registro de resultados

| Caso | Resultado | Observaciones | Evidencia |
|---|---|---|---|
| D-01 | | | |
| D-02 | | | |
| D-03 | | | |
| D-04 | | | |
| D-05 | | | |
| D-06 | | | |
| D-07 | | | |
| D-08 | | | |
| D-09 | | | |
| D-10 | | | |
| D-11 | | | |
| D-12 | | | |
| D-13 | | | |
| D-14 | | | |
| D-15 | | | |
