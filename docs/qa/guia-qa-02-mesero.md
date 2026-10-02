# Guía QA Waiter — 2. Mesero

**Aplica a:** rol Mesero. **Organizaciones:** Burger House (`http://localhost:3000`) con los datos de demostración; en Frisby (sistema propio) valen todos los casos salvo M-06 (menú del comensal, T5), con un mesero que cree la dueña y un plano con mesas.
**Fecha de actualización:** 2 de octubre de 2026

## 1. Qué vamos a comprobar

Que el mesero atiende el salón de principio a fin: ve el plano, crea pedidos en mesa, manda rondas a cocina, entrega lo que cocina marca listo, atiende las llamadas de las mesas y cambia una mesa de lugar. Y que **no** puede hacer lo que no le toca: cobrar, cerrar caja, editar pisos o inventario, salvo que el dueño se lo permita.

## 2. Preparación

- Usuario: `sofia.mesera`, restaurante Poblado.
- La caja de Poblado debe estar abierta (lo hace la encargada en E-01 o el cajero en C-01). Sin caja abierta la mesera solo ve `/caja`.
- Para M-05 hace falta alguien en Cocina (`/kds`) con `laura.encargada`.
- Política por defecto del mesero: vista Mesas; acciones crear pedidos y servir. No cobra.

## 3. Recorrido de validación

| Caso | Qué va a comprobar | Quién participa |
|---|---|---|
| M-01 | Sin caja abierta no hay salón | Mesero |
| M-02 | El plano del salón y los estados de mesa | Mesero |
| M-03 | Crear un pedido en mesa y enviarlo a cocina | Mesero |
| M-04 | Nueva ronda sobre un pedido abierto | Mesero |
| M-05 | Entregar lo que cocina marcó listo | Mesero y Cocina |
| M-06 | Llamadas de las mesas desde el menú del comensal | Mesero y comensal |
| M-07 | Cambiar un pedido de mesa | Mesero |
| M-08 | Lo que el mesero no puede hacer | Mesero |
| M-09 | El dueño amplía los permisos del mesero | Dueño y mesero |

## 4. Paso a paso

### M-01 — Sin caja abierta no hay salón

1. Con la caja de Poblado cerrada, entre como `sofia.mesera`.
2. Intente escribir `/salon` en la dirección.

**Resultado esperado:** llega a `/caja`, ve el restaurante del dispositivo y el formulario de apertura (notas y efectivo inicial). No aparece «Entrar a administración sin abrir caja» (eso es solo del encargado). Escribir `/salon` lo devuelve a `/caja`.

### M-02 — El plano del salón y los estados de mesa

1. Con la caja abierta, entre y vaya a Mesas.
2. Cambie de piso; pruebe la pantalla partida con dos pisos; lea la leyenda de estados.
3. Toque una mesa libre y una ocupada.

**Resultado esperado:** el plano muestra las mesas con su estado (libre, ocupada, con platos listos, por cobrar). Al tocar una mesa libre se ofrece crear el pedido; en una ocupada se abre el detalle con sus líneas. El panel de servicio lista «listos para entregar», «sin enviar a cocina» y «llamadas».

### M-03 — Crear un pedido en mesa y enviarlo a cocina

1. En Mesas, toque una mesa libre → «Crear pedido».
2. Recorra el asistente: tipo **En mesa**, número de personas, silla de bebé, cliente (puede saltarse), mesa (ya viene elegida), menú.
3. Agregue dos platos; a uno póngale un adicional y una nota para cocina («sin cebolla»).
4. Revise el resumen y pulse «Crear pedido y enviar a cocina».

**Resultado esperado:** la mesa pasa a ocupada; el pedido aparece en Pedidos como «En progreso» y en Cocina con la nota visible. Los precios del resumen coinciden con la carta. Si el dueño activó «cobrar antes de cocina» para meseros, el asistente obliga a cobrar primero (ver M-09).

### M-04 — Nueva ronda sobre un pedido abierto

1. Abra el detalle de la mesa del caso anterior → «Nueva ronda» (o «+ Nuevo pedido» desde Pedidos).
2. Busque un plato por nombre, agréguelo y envíe.

**Resultado esperado:** las líneas nuevas llegan a cocina como un curso aparte; el detalle de la mesa muestra las dos rondas con su estado cada una.

### M-05 — Entregar lo que cocina marcó listo

**Quién:** la mesera en Mesas; la encargada en `/kds`.

1. En Cocina, «Iniciar preparación» y luego «Listo» en uno de los platos del pedido de M-03.
2. En Mesas, la mesera abre el detalle de la mesa y pulsa «Entregar» en ese plato. Luego cocina marca «Listo todo» y la mesera usa «Entregar todo lo listo».
3. Observe la tablet del salón cuando cocina marca listo.

**Resultado esperado:** el estado se maneja a dos manos: cocina marca listo, el mesero marca entregado; cocina no puede marcar entregado. Al marcar listo, el salón recibe el aviso (campana y sonido si está activo) y el panel «Listos para entregar» lo lista. El detalle de mesa se actualiza solo (se relee cada 10 segundos).

### M-06 — Llamadas de las mesas desde el menú del comensal

**Quién:** la mesera en Mesas; un comensal en `http://localhost:3001/burger-house/poblado/t/<token de una mesa>`.

1. Desde el menú del comensal, pulse «Llamar al mesero» y luego «Pedir la cuenta».
2. En el panel de servicio del salón, atienda cada llamada: «Marcar atendida» y, para la cuenta, «Revisar y enviar».

**Resultado esperado:** ambas llamadas aparecen en el panel con la mesa correcta; al atenderlas desaparecen y el comensal deja de ver la llamada pendiente.

### M-07 — Cambiar un pedido de mesa

1. En el detalle de una mesa ocupada pulse «Cambiar mesa» y elija una libre.

**Resultado esperado:** la mesa original queda libre, la nueva ocupada, y el pedido conserva sus líneas y su estado en cocina.

### M-08 — Lo que el mesero no puede hacer

1. En Pedidos (si tiene la vista) o en el detalle de un pedido, busque «Ir a pagar».
2. Escriba en la dirección `/pago/<id del pedido>`, `/ventas`, `/inventario`, `/configuracion`, `/kds`.
3. En Mesas, busque los ajustes y el editor de pisos.
4. Intente abrir `/organizacion`.

**Resultado esperado:** no hay «Ir a pagar»; cualquiera de esas rutas lo devuelve a su inicio sin pantalla de error; no hay editor de pisos ni botón de cerrar caja; la consola lo manda a `/login`.

### M-09 — El dueño amplía los permisos del mesero

**Quién:** `admin` en Consola → Equipo → «Qué puede hacer cada rol»; luego la mesera.

1. El dueño marca al Mesero las vistas Pedidos y Cocina y la acción Cobrar. Guarda.
2. La mesera, sin cerrar sesión, cambia de pestaña y vuelve (o espera un minuto).
3. La mesera abre Pedidos, Cocina y «Ir a pagar» en un pedido.
4. El dueño vuelve la matriz a su estado anterior.

**Resultado esperado:** las pestañas nuevas aparecen sin volver a entrar (la política se recarga al recuperar el foco o cada 60 segundos). Con «Cobrar» la mesera puede abrir `/pago/<id>`. Al revertir, las pestañas desaparecen igual de solas. Las columnas del Encargado no se pueden editar.

## 5. Registro de resultados

| Caso | Resultado | Observaciones | Evidencia |
|---|---|---|---|
| M-01 | | | |
| M-02 | | | |
| M-03 | | | |
| M-04 | | | |
| M-05 | | | |
| M-06 | | | |
| M-07 | | | |
| M-08 | | | |
| M-09 | | | |
