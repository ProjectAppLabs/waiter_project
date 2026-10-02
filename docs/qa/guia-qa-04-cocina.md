# Guía QA Waiter — 4. Cocina (vista KDS)

**Aplica a:** la vista Cocina, que por defecto tiene el Encargado y que el dueño puede dar a meseros o cajeros. **Organización:** solo Burger House.
**Fecha de actualización:** 2 de octubre de 2026

## 1. Qué vamos a comprobar

Que la pantalla de cocina recibe las comandas del salón y del menú del comensal en tiempo real, las reparte por estación, muestra notas y tiempos, y que cocina marca «listo» pero no «entregado». También que avisa al salón y respeta los umbrales de demora del encargado.

## 2. Preparación

- Usuario: `laura.encargada` en `http://localhost:3000/kds` (pantalla fija, modo oscuro, sin barra).
- Haga falta un segundo navegador con la mesera para crear pedidos y entregar.
- Las categorías de la carta tienen una estación (Parrilla, Fríos, Barra…); «Sin estación» solo sale en «Todas».

## 3. Recorrido de validación

| Caso | Qué va a comprobar | Quién participa |
|---|---|---|
| K-01 | La comanda llega en tiempo real con mesa, nota y alérgenos | Cocina y mesero |
| K-02 | Estaciones, «Todas» y «Demorados» | Cocina |
| K-03 | Iniciar preparación, Listo por plato y Listo todo | Cocina |
| K-04 | Cocina no entrega; el salón sí | Cocina y mesero |
| K-05 | Umbrales de demora, colores y sonido | Cocina y encargado |
| K-06 | La pantalla no se cierra por inactividad | Cocina |

## 4. Paso a paso

### K-01 — La comanda llega en tiempo real con mesa, nota y alérgenos

1. Con `/kds` abierto, la mesera crea un pedido (M-03) con una nota «sin cebolla» y un plato con alérgenos.
2. Un comensal pide desde el menú (Co-04).

**Resultado esperado:** ambas comandas aparecen sin recargar (la pantalla consulta cada 5 segundos además del bus), con el número de pedido, la mesa o «Domicilio», el cronómetro y el estado «Recibida». La nota y los alérgenos se leen en la línea.

### K-02 — Estaciones, «Todas» y «Demorados»

1. Cambie entre las pestañas de estación; mire el conteo y el tiempo medio de cada una.
2. Abra «Todas» y «Demorados».

**Resultado esperado:** cada estación solo muestra los platos de sus categorías; «Todas» lo muestra todo; «Demorados» solo lo que superó el umbral. Los conteos coinciden.

### K-03 — Iniciar preparación, Listo por plato y Listo todo

1. En una comanda, pulse «Iniciar preparación». Intente marcar «Listo» en un plato antes de iniciar otra comanda.
2. Marque «Listo» en un plato y «Listo todo» en la comanda.

**Resultado esperado:** «Listo» solo está disponible después de iniciar; el plato listo pasa a la columna «Listos por entregar» con «listo hace…»; «Listo todo» cierra la comanda en cocina.

### K-04 — Cocina no entrega; el salón sí

1. En la columna «Listos por entregar», busque un botón de entregar: no debe existir.
2. La mesera marca «Entregar» en Mesas (M-05).

**Resultado esperado:** el plato sale de «Listos por entregar» cuando el salón lo entrega. Cocina nunca marca la entrega.

### K-05 — Umbrales de demora, colores y sonido

**Quién:** la encargada ajusta en Configuración → Pantalla o en Operación → «Configurar umbrales».

1. Lea la leyenda: menos de 12 minutos, de 12 a 18, más de 18.
2. Baje el umbral a 1 minuto y espere con una comanda abierta.
3. Pulse «Silenciar avisos» y vuelva a activarlos.

**Resultado esperado:** la comanda cambia de color y pasa a «Demorado» al cruzar el umbral nuevo; el sonido suena al llegar una comanda y se silencia con el botón; la leyenda refleja los umbrales configurados.

### K-06 — La pantalla no se cierra por inactividad

1. Deje `/kds` 20 minutos sin tocar.

**Resultado esperado:** sigue abierta y recibiendo comandas. Solo se cierra al terminar el turno de la persona que entró (A-10).

## 5. Registro de resultados

| Caso | Resultado | Observaciones | Evidencia |
|---|---|---|---|
| K-01 | | | |
| K-02 | | | |
| K-03 | | | |
| K-04 | | | |
| K-05 | | | |
| K-06 | | | |
