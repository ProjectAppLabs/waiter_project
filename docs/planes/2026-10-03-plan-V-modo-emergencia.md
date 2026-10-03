# Plan V · Modo de emergencia: sin internet, la operación pasa a la caja

**Fecha:** 2026-10-03 · **Rama:** `feat/03102026-modo-emergencia` (sobre la del [plan U](2026-10-03-plan-U-pos-faltantes.md))
· **Pedido del dueño:** si se pierde el internet, toda la operación se centraliza en la caja, con acciones fijas que
se conservan en el equipo hasta recobrar la conexión, aunque el equipo se apague.

## Por qué en la caja

El servidor está en la nube: sin internet los equipos del restaurante no se ven entre sí. Si la mesera toma un pedido
en su tableta y el cajero otro en la caja, ninguno ve el del otro hasta que vuelva la red, y dos colas pueden agregar
platos a la misma mesa. Con un solo equipo que opera, hay una sola verdad.

## Cuándo

- **Sin conexión:** desde la primera petición que no llega. Aparece un aviso con **cuenta regresiva de 3 minutos**:
  «Sin conexión · en 2:41 la operación pasa a la caja». Si la red vuelve antes (un corte breve), no pasa nada más.
- **Modo emergencia:** a los 3 minutos sin red, o antes si la encargada lo activa a mano desde el aviso.
- **Fin:** cuando vuelve la red y la cola terminó de enviarse.
- La hora del corte se guarda en el equipo: si se recarga o se apaga, la cuenta sigue donde iba.

## Quién opera

- **Caja** (cajero, encargado o dueño): opera todo lo de la lista. El cajero puede tomar pedidos aunque la política
  del dueño no se lo permita; esos pedidos quedan marcados como de emergencia.
- **Meseros:** su tableta muestra «Modo emergencia: los pedidos se toman en la caja» y no toma pedidos ni cobra. Lo que
  ya tenían en cola se envía al volver la red.

## Acciones de emergencia (fijas)

| Acción | Cómo |
|---|---|
| Crear pedido en mesa o para llevar | Asistente de pedidos; número provisional `E-01`, `E-02`… del equipo |
| Agregar ronda | A un pedido de emergencia o a uno que ya existía |
| Quitar un plato antes de enviarlo | En el carrito, antes de enviar |
| Enviar a cocina | Comanda impresa con el sello «SIN CONEXIÓN» y el número provisional |
| Imprimir la precuenta | Desde «Pedidos de emergencia» |
| Cobrar en efectivo o datáfono | Con recibo impreso |
| Entradas y salidas de efectivo | Con motivo, como siempre |
| Arqueo provisional | Hoja impresa con lo vendido y el efectivo esperado del turno |

**Fuera del modo emergencia** (necesitan el servidor): devoluciones, canje de puntos, QR y pagos en línea, factura
electrónica, cierre de caja, inventario, reservas, configuración, cancelar platos ya enviados.

## Pedidos de emergencia

Pantalla «Pedidos de emergencia» en la caja, desde el aviso: cada pedido creado sin conexión con su número provisional,
mesa o cliente, platos, total calculado en el equipo y estado (sin cobrar, cobrado, enviado al servidor con su número
definitivo). Desde ahí se agrega una ronda, se imprime la precuenta y se cobra.

## Que nada se pierda

- **Cola en el equipo:** cada operación se guarda al instante en el navegador; sobrevive a recargar, cerrar o apagar.
  El POS pide al navegador **almacenamiento persistente** (`navigator.storage.persist`) para que no lo borre si se llena
  el disco.
- **Abrir sin red tras reiniciar:** el service worker guarda la app; los datos de trabajo (carta, mesas, métodos, caja,
  sesión) salen de lo guardado. Se prueba con una compilación de producción.
- **Sesión vencida:** si al volver la red la sesión ya venció (dura 16 horas), la cola se **pausa** y el aviso pide
  iniciar sesión; al entrar, sigue enviando. Nada pasa a «rechazado» por eso.
- **Hora real:** el pedido y el cobro llevan la hora en que ocurrieron, y el servidor la usa; así una venta de anoche no
  aparece hoy. Si el reloj del equipo está mal, el servidor la **ajusta** al turno (nunca antes de la apertura de la
  caja ni después de ahora) en vez de rechazarla: una venta no se pierde por el reloj.
- **Número provisional:** `E-nn` por equipo y día, en la comanda, el recibo y la nota del pedido. Al sincronizar recibe
  su número definitivo y la lista muestra los dos.
- **Cierre del día sin red:** no se puede cerrar la caja en el servidor. La caja imprime un **arqueo provisional** y el
  cierre formal se hace al volver la red.

## Pruebas que deben existir (`# Falla si …` / `// Falla si …`)

- Cuenta regresiva de 3 minutos que sigue tras recargar; activación manual de la encargada; fin al sincronizar.
- Mesero bloqueado en emergencia; cajero que toma pedidos sin el permiso de la política.
- Número provisional por día; pedido de emergencia cobrado después desde su lista; ronda a un pedido de emergencia.
- Sesión vencida que pausa sin rechazar y sigue al iniciar sesión.
- El servidor usa la hora real dentro del turno y ajusta la futura o la anterior a la apertura.
- Arqueo provisional con ventas y movimientos de efectivo sin conexión.
- e2e: corte de red con cuenta regresiva, emergencia, pedido en mesa cobrado después y sincronización.

## Estado

- **Hecho** (2026-10-03), rama `feat/03102026-modo-emergencia`.
  - Servidor: el pedido (`created_at`) y el cobro (`paid_at`) aceptan la hora real, ajustada al turno.
  - POS: cuenta regresiva de 3 minutos que sobrevive a recargar, activación manual de la encargada, bloqueo de las
    tabletas de meseros, la caja toma pedidos aunque su política no se lo dé, pedidos de emergencia `E-nn` en Pedidos y
    en «Pedidos de emergencia» (precuenta, cobrar y agregar ronda sin navegar, arqueo provisional), entradas y salidas
    de efectivo en la cola, cola que se pausa con la sesión vencida, almacenamiento persistente.
  - Service worker: guarda páginas, archivos y los trozos de precarga de Next 16; sin red sirve la misma pantalla aunque
    la dirección lleve otros parámetros. Con red, el POS precarga las pantallas de la caja y las lecturas del asistente.
- **Verificado con la compilación de producción** (`e2e/emergencia.spec.ts`, `PLAYWRIGHT_PROD=1`): sin red la app abre
  al recargar, aparece la cuenta regresiva, la encargada pasa a la caja, la caja crea un pedido para llevar, lo cobra
  después desde «Pedidos de emergencia», el arqueo lo suma, y al volver la red llega al servidor **pagado una sola vez**,
  con la nota «Emergencia E-01» y la hora en que se creó sin red.
- **Encontrado al probar en producción:** la carta y los platos del asistente no estaban entre las lecturas guardadas;
  Next 16 precarga por trozos y una sola clave los pisaba; cambiar `?sinMesa=1` sin red no tenía copia. Corregido.
- **Límite conocido:** en desarrollo (`next dev`) no hay service worker; una pantalla no visitada no abre sin red.
