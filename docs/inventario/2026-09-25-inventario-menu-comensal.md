# Inventario de pantallas y componentes del menú del comensal (2026-09-25)

Base del **Plan K** (plantillas HTML por componente, validación de datos y márgenes, galería de decoraciones).
Se levantó leyendo todo `diner/components/smart/` y `diner/lib/domain/route.ts`, y comparándolo con el inventario
del design system, [`experience_app/diseno/inventario.json`](../../experience/experience_app/diseno/inventario.json)
(15 componentes y 25 pantallas, hecho en J2–J3 para variantes, no para plantillas).

Convención de las tablas de componentes: **obligatorio** = una plantilla debe enlazarlo; *opcional* = solo se pinta si
existe; `ranura:` = acción que controla el código del menú, nunca la plantilla.

## 1. Hallazgos que cambian el mapa

1. **31 pantallas en el tipo `Screen`, pero solo 25 se despachan de verdad.** `parseRoute` convierte en `carta`
   cualquier segmento que no esté en `SCREENS`: `portada`, `bienvenida`, `asistente`, `preferencias`, `acerca` y `ayuda`
   nunca se muestran (sus componentes `SmartHome`, `SmartWelcome`, `SmartAssistant`, `SmartPreferences`, `SmartHelp`
   existen huérfanos). `pathFor(..., 'portada')` produce la URL de la sede, que abre `carta`.
2. **Enlaces rotos:** el chat enlaza a `ayuda` (`.sm-chat-help`, cuando `accion==='humano'`) y `SmartAssistantReminder`
   (que no se monta) a `asistente`; ambos abren la carta.
3. **Código muerto:** `SmartDemoPay` (checkout simulado, `.sm-checkout-*`), `SmartAssistantReminder`, `SmartPrepay` y
   `SmartRemaining` (solo nombres de pruebas). La pantalla `pago` es `SmartOnlinePay` (Wompi).
4. **La cabecera real de casi todas las pantallas es `Title` (`.sm-title`)**, no `SmartHeader`
   (`.sm-location-header`). `SmartHeader` solo sale en carta, favoritos, `ubicacion` (paso share) y `estado` pagado.
   El inventario actual pone `cabecera` en 24 pantallas: en 20 es incorrecto.
5. **El chat («Mi mesero») no existe en el inventario** y está en todas las pantallas menos `reserva`.
6. **Errores del inventario actual en `pantallas`:** `plato` lista `cabecera` y no `campo`; `pago` lista `hoja` sin
   tener diálogo; `historial` lista `plato` y no usa tarjetas de plato; `recibo` lista `pedido` (dock) en vez del recibo;
   `favoritos` no lista `categorias`; `reserva` no lista marca ni ticket; `hoja` solo cubre `.sm-wallet-dialog`
   cuando hay 8 diálogos distintos.
7. **Piezas transversales sin componente:** `.sm-title`, `.sm-empty`, `.sm-secondary`, `.sm-text-button`, `.sm-icon`,
   `.sm-error`, `.sm-note`, `.sm-footnote`, `.sm-stepper`, `.sm-segmented`, `.sm-profile-link`, `.sm-journey` +
   `.sm-orbit-hero`, `.sm-cart-float`.

---

## 2. Pantallas (31 en el tipo; 25 reales)

Marco común de todas: `div.smart-menu.sm-screen-<id>` > `div.sm-page`; `p.sm-error` arriba si hay error;
`div.sm-action-dock` abajo (chat siempre; carrito flotante en portada/carta/favoritos/historial/cuenta si hay líneas
propias; hueco del botón confirmar en pedido) salvo en `reserva`. Con `?borrador=`/`?vista_previa=` se añade
`p.sm-preview-banner`. La intro (`FirstVisitIntro` > `SmartAbout`) sustituye toda la experiencia la primera vez en carta.

| Pantalla | Real | Componente raíz | Bloques en orden (ids de la sección 3) | Diálogos |
|---|---|---|---|---|
| carta | sí | SmartBrowse | cabecera, saludo-titulo, buscador, banners *o* destacados, categorias, seccion+carta(rail) de tarjeta-plato, nota-fotos?, llamar-mesero?, dock | navegacion, chat |
| favoritos | sí | SmartBrowse favoritesOnly | cabecera, saludo-titulo, [sin cuenta: vacio] / buscador, categorias, seccion+cuadricula de tarjeta-plato, vacio, nota-fotos?, llamar-mesero?, dock | navegacion, chat |
| plato | sí | SmartDish | barra-volver(+corazon), ficha-heroe (foto, insignias, titulo, precio, rebaja, tiempo), descripcion, nota-imagen?, nutricion?, combo?, ingredientes?, etiquetas?, alergenos?, adicionales?, acompanamientos?, nota-cocina(campo), compra(stepper+boton) / agregado, dock(chat) | chat; en hoja `.sm-dish-sheet` desde el asistente |
| pedido | sí | SmartCart | titulo, [vacio] / lineas-pedido (linea con foto, stepper, eliminar, deslizar-borrar), agregar-mas, resumen (cupon, totales, aviso, confirmar-fijo, ver-pago), dock(chat+confirmar) | modalidad (comer/llevar, notas, alergias), chat |
| pago | sí | SmartOnlinePay | titulo, monto, sandbox?, error?, formulario-pago (medios, correo, nequi?, tarjeta?, consentimientos, pagar, actualizar, pagar-con-mesero) *o* resultado-pago (estado, QR?, 3DS?, referencia, consultar, reintentar, seguir-pedido), dock(chat) | chat |
| estado | sí | SmartStatus | [pagado: celebracion-pago] / titulo, tarjeta-estado, detalle-pedido (pista, id, recibo-lineas, linea-tiempo, totales), accion-principal, pedir-cuenta?, llamar-mesero?, dock | puntos-ganados (pagado), chat |
| la-cuenta | sí | SmartBill | titulo, resumen-cuenta (segmentado, personas?, total, aviso, estado-aviso, volver-avisar?, volver-menu) / vacio, dock | chat |
| reserva | sí | SmartReservationPay | marca-reserva, ticket-reserva?, reserva-resuelta *o* formulario/resultado de pago, ver-menu | ninguno (sin dock) |
| cuenta | sí | SmartAccount | titulo, [sin cuenta: vacio+secundario] / perfil (avatar, nombre, correo, celular?), estadisticas, filas-enlace ×5, interruptor-novedades, cerrar-sesion, dock | chat |
| cuenta/informacion | sí | SmartAccountEdit | titulo, formulario-cuenta (nombre, correo solo lectura, celular, alergenos, notas, casilla, estado, guardar) / vacio | chat |
| cuenta/registro | sí | SmartSignup | titulo, relato-registro (marca, beneficios, descuento?), formulario-registro (nombre, correo, celular, contraseña, casillas, politica, aviso, error, continuar, invitado) | chat |
| cuenta/codigo | sí | SmartCode | titulo, formulario-codigo (correo, aviso, casillas-codigo, error, verificar, opciones, renovar, estado) / vacio | chat |
| cuenta/lista | sí | SmartRegisteredAccount | recorrido (ilustracion stars, titulo, texto, pie: perfil, crear contraseña) / vacio; sin volver | chat |
| cuenta/canal | sí | SmartVerificationChannel | titulo, recorrido (titulo, aviso, lista-opciones correo/SMS, pie) / vacio | chat |
| cuenta/correo | sí | SmartEmailEntry | recorrido (titulo→bienvenida, campo correo, continuar) | chat |
| cuenta/entrar | sí | SmartPasswordForm | titulo, formulario-acceso (correo, contraseña, error, entrar, olvide, nota, crear) | chat |
| cuenta/clave | sí | SmartPasswordVerification | titulo, formulario-acceso (titulo, texto, correo destacado, error, enviar / estado) / vacio | chat |
| cuenta/recuperar | sí | SmartPasswordReset request | titulo, formulario-acceso (correo, estado, enviar) | chat |
| cuenta/restablecer | sí | SmartPasswordReset | titulo, formulario-acceso (contraseña ×2, estado, guardar) / recorrido de éxito (password.png) | chat |
| cuenta/tarjetas | sí | SmartWallet | titulo, aviso, tarjeta-bancaria + puntos-carrusel + detalle-cartera / cartera-vacia, error?, añadir | cartera (formulario), chat |
| historial | sí | SmartHistory | titulo, aviso-carrito?, aviso-pedido-activo?, [sin cuenta: vacio] / segmentado, cuadricula de tarjeta-historial (cabecera+chip, local, fecha, lineas, total, acciones) / vacio, dock | chat |
| recibo | sí | SmartReceipt | titulo, recibo-papel (avatar, local, fecha, id+mesa, chip, lineas con foto, descuento?, total), volver / vacio | chat |
| ubicacion | sí | SmartLocation | titulo (salvo share), volver-opciones; paso choose: tarjetas-opcion ×2; share: cabecera + compartir-ubicacion; scan: visor-qr + subir; manual: recorrido + campo + abrir; list: campo búsqueda + tarjeta-local; detail: recorrido (logo, nombre, dirección, cómo llegar, lema, pie); rescan: recorrido | navegacion (share), chat |
| recompensas | sí | SmartRewards | titulo, saldo-puntos (sin cuenta: fila-enlace), titulo-beneficios, banner-recompensa?, filas-enlace ×3 | recompensa (trophy), chat |
| opinion | sí | SmartFeedback | titulo, error?, paso 0: fondo + invitacion; 1: valoracion; 2: comentario (campo); 3: valoracion-platos (foto + 5 caritas); 4: recorrido de éxito | invitacion, chat |
| portada | **no** | SmartHome (huérfano) | cabecera, titulo-portada, [pedido-activo + 2 rails simplificados + ver-menu] / tarjeta-opcion «Ir al menú» | navegacion |
| bienvenida | no | SmartWelcome (huérfano) | recorrido | — |
| asistente | no | SmartAssistant (huérfano, solo pruebas) | recorrido, pasos con chips y rango, resultados con tarjeta-plato, hoja con la ficha | recomendacion |
| preferencias | no | SmartPreferences (huérfano) | lista/detalle de preferencias | — |
| acerca | no | SmartAbout | solo como intro de primera visita (4 diapositivas con puntos) | — |
| ayuda | no | SmartHelp (huérfano) | lista y artículo estáticos | — |

---

## 3. Catálogo de componentes (contratos de datos y acciones)

Dos niveles: **componentes plantillables** (tienen datos y acciones propios; son los que el Plan K podrá rediseñar)
y **piezas** (átomos que las plantillas reutilizan y que hoy ya son variantes o tokens). Los ids nuevos siguen el
estilo del inventario actual; los 15 existentes se conservan y se corrigen sus selectores.
Convención: **obligatorio** = la plantilla debe enlazarlo; *opcional* = solo se pinta si existe; `ranura:` = acción que
controla el código.

### 3.1 Marco y piezas transversales (todas las pantallas)

| id | Nombre | Selectores | Datos | Acciones / ranuras | Estado actual |
|---|---|---|---|---|---|
| cabecera | Cabecera y saludo | `.sm-location-header`, `.sm-greeting-line` | **marca.nombre/carta.restaurante, sede.nombre**; *marca.logo, saludo (pickGreeting con marca.saludo y hora), account.nombre, mesa.numero* | `ranura: abrir-navegacion` | existe; variantes cabecera, saludo. Quitar `.sm-greeting` de sus selectores |
| saludo-titulo | Título de la carta | `.sm-greeting > h1` | texto fijo («Elige el mejor plato para ti» / «Tus favoritos») | — | nuevo (hoy dentro de cabecera) |
| navegacion | Cajón de navegación | `dialog.sm-navigation`, `.sm-navigation-inner`, `.sm-profile-link`, `.sm-avatar` | **enlaces fijos** (ubicacion, recompensas, carta, pedido, historial, favoritos), **sede.nombre**; *account.nombre/iniciales, mesa* | `ranura: cerrar`, enlaces a pantallas | nuevo |
| titulo | Título con volver | `.sm-title`, `.sm-icon` | **title**; *sub* | `ranura: volver` (pantalla `back`) | nuevo; sustituye a `cabecera` en 20 pantallas |
| dock | Barra de acciones | `.sm-action-dock`, `.sm-action-dock-pair`, `.sm-confirm-slot` | — | contiene chat-lanzador, carrito-flotante?, confirmar? | existe como `pedido` → renombrar |
| carrito-flotante | Carrito flotante | `.sm-cart-float`, `.sm-count` | **count (líneas mías), cart.mio** | `ranura: ir-pedido` | nuevo |
| chat-lanzador | Botón «Mi mesero» | `.sm-chat-launch` | texto fijo | `ranura: abrir-chat` | nuevo |
| chat | Diálogo del mesero virtual | `dialog.sm-chat-dialog`, `.sm-chat-header/-toolbar/-log/-welcome/-turn/-bubble/-user/-reply-text/-caret/-reply-content/-status/-compose/-unread/-notice/-suggestions/-error/-caption/-choices/-help` | **marca.nombre, turnos[] (mensaje, respuesta, opciones?, lineas?)**, disponible | `ranura: nueva-conversacion, enviar, elegir-opcion, cerrar` | nuevo |
| chat-producto | Producto sugerido en el chat | `.sm-chat-category/-carousel/-single/-product/-dish/-quantity/-note/-add/-added` | **dish.nombre, precio, agotado**; *foto, cantidad, nota* | `ranura: ir-ficha, cantidad, añadir` | nuevo |
| vacio | Estado vacío | `.sm-empty`, `.sm-empty-icon` | **title, texto**; *icono, acción* | `ranura: accion` | nuevo |
| mensajes | Error, nota, pie y estado | `.sm-error`, `.sm-note`, `.sm-footnote`, `p[role=status]`, `.sm-preview-banner` | **texto** | — | nuevo (pieza) |
| boton | Acción principal | `.sm-primary` | **texto**; *icono, importe* | `ranura: accion` | existe; variantes boton, formaBoton |
| boton-secundario | Secundario, de texto e icono | `.sm-secondary`, `.sm-text-button`, `.sm-icon` | **texto/aria-label** | `ranura: accion` | nuevo (pieza); hoy cubierto solo por formaBoton |
| campo | Campo de formulario | `.sm-field`, `.sm-search`, `.sm-password-field`, `.sm-checkbox`, `select` | **etiqueta, valor**; *placeholder, contador, ayuda* | `ranura: cambio, mostrar-clave` | existe; ampliar selectores |
| stepper | Contador de cantidad | `.sm-stepper`, `.sm-extra-counter`, `.sm-quantity-row` | **cantidad, min, max** | `ranura: menos, mas` | nuevo (pieza) |
| segmentado | Selector segmentado | `.sm-segmented` | **opciones[], elegida** | `ranura: elegir` | nuevo (pieza) |
| fila-enlace | Fila de enlace con icono | `.sm-profile-link` | **título**; *detalle, icono, avatar* | `ranura: ir` | nuevo (pieza) |
| hoja | Diálogo modal / hoja | `.sm-filter-dialog` y sus variantes (`.sm-wallet-dialog`, `.sm-fulfillment-dialog`, `.sm-reward-dialog`, `.sm-earned-dialog`, `.sm-feedback-invite`, `.sm-reminder`, `.sm-recommendation-dialog`) | **título, contenido** | `ranura: cerrar` | existe; ampliar selectores |
| imagen | Fotografía del plato | `.sm-food-photo`, `.sm-photo-empty` | **dish.nombre**; *dish.foto* | — | existe |
| precio | Precio | `.sm-food-price > strong`, `.sm-price`, `.sm-cart-line-info > strong`, `.sm-food-bottom > strong` | **precio** | — | existe |
| rebaja | Rebaja | `.sm-food-deal` (em, s) | *precioAntes > precio → porcentaje* | — | nuevo (hoy dentro de insignia) |
| insignia | Valoración, estado y tiempo | `.sm-rating-pill`, `.sm-dish-rating`, `.sm-status-chip`, `.sm-food-time`, `.sm-sold-out` | *valoracion.promedio/cantidad, estado del pedido, tiempoPreparacion, agotado* | — | existe; ampliar selectores |
| texto | Texto del menú | `.smart-menu` h1/h2/h3/p, `.sm-description`, `.sm-eyebrow` | — | — | existe |
| recorrido | Pantalla con ilustración | `.sm-journey`, `.sm-intro`, `.sm-orbit-hero`, `.sm-journey-footer`, `.sm-slide-dots` | **ilustración (`/smart-menu/*.png`), título, texto**; *pie con 1–2 acciones, puntos de diapositiva* | `ranura: principal, secundaria` | nuevo; usado en 9 pantallas y la intro |
| tarjeta-opcion | Tarjeta de opción | `.sm-home-options`, `.sm-home-card`, `.sm-home-arrow`, `.sm-fulfillment-option` | **título, texto/icono**; *imagen* | `ranura: elegir` | nuevo |

### 3.2 Carta y favoritos

| id | Nombre | Selectores | Datos | Acciones / ranuras | Estado actual |
|---|---|---|---|---|---|
| buscador | Buscador | `.sm-search` | **query** | `ranura: escribir, limpiar` | nuevo |
| banners | Banner del restaurante | `.sm-banner-rail`, `.sm-promo-banner`, `.sm-banner-{product,promotion,category,image,notice}`, `.sm-banner-{violet,amber,dark}`, `.sm-banner-copy/-label/-cta/-photo/-full` | **title, layout, theme**; *subtitle, button, image, producto (nombre, precio, foto), combo* | `ranura: ir-producto / filtrar-categoria` | existe; ampliar selectores |
| destacados | Plato destacado (sin banners) | `.sm-featured-rail`, `.sm-featured`, `.sm-featured-action` | **dish.nombre, precio, foto** | `ranura: ir-ficha` | nuevo |
| categorias | Navegación de categorías | `.sm-categories` | **categorias[].nombre, elegida** | `ranura: elegir` | existe; variante categorias |
| seccion | Encabezado de sección | `.sm-section-heading`, `.sm-menu-sections` | **título**; *contador* | — | nuevo |
| carta | Distribución de los platos | `.sm-food-rail`, `.sm-food-grid`, `.sm-food-list` | lista de tarjeta-plato | — | existe; distribución carta |
| tarjeta-plato (plato) | Tarjeta de plato | `.sm-food-card`, `.sm-food-link`, `.sm-food-bottom` | **nombre, precio, agotado, imagen**; *foto, valoracion, rebaja, tiempo* | `ranura: ir-ficha, favorito (corazon), añadir-rapido` | existe; variantes tarjeta, precio, imagen, formaImagen, insignia |
| corazon | Favorito | `.sm-heart` (`.is-active`) | **seleccionado, dish.nombre** | `ranura: favorito` (sin cuenta → registro) | nuevo (pieza) |
| anadir-rapido | Añadir rápido | `.sm-quick-add` | **agotado, añadido** | `ranura: añadir` | nuevo (pieza) |
| llamar-mesero | Llamar al mesero | `.sm-waiter` | **llamado** (solo con mesa) | `ranura: llamar` | nuevo |
| nota-fotos | Nota de imágenes de referencia | `.sm-footnote` | *carta.imagenesDeReferencia* | — | pieza de mensajes |

### 3.3 Ficha del plato

| id | Nombre | Selectores | Datos | Acciones / ranuras | Estado actual |
|---|---|---|---|---|---|
| barra-volver | Barra superior de la ficha | `.sm-dish-back` | — | `ranura: volver, favorito` | nuevo |
| ficha | Distribución de la ficha | `.sm-dish-layout`, `.sm-dish-hero`, `.sm-dish-info`, `.sm-dish-sheet` | — | — | existe; distribución ficha |
| ficha-heroe | Cabecera de la ficha | `.sm-dish-hero`, `.sm-dish-photo`, `.sm-dish-orbits`, `.sm-dish-heading` | **nombre, precio, imagen**; *valoracion, rebaja, tiempo* | — | nuevo (subparte de ficha) |
| nutricion | Información nutricional | `.sm-nutrition` | *nutricion.{calorias,peso,proteina,carbohidratos,grasa,fibra}* | — | nuevo |
| ingredientes | Combo e ingredientes | `.sm-ingredients` (+ `IngredientIllustration` con `/smart-menu/emoji/*`) | *combo[], ingredientes[]* | — | nuevo |
| etiquetas | Etiquetas y alérgenos | `.sm-tags`, `.sm-note` | *etiquetas[], alergenos[]* | — | nuevo |
| adicionales | Adicionales | `.sm-dish-toppings`, `.sm-topping` | *extras[] → nombre, precio, agotado, cantidad* | `ranura: marcar, cantidad` | nuevo |
| acompanamientos | Acompañamientos / también te puede gustar | `.sm-dish-sides`, `.sm-side`, `.sm-side-info` | *acompanamientos[] o 3 sugeridos → nombre, precio, foto, valoracion, descripcion, agotado, cantidad* | `ranura: cantidad` | nuevo |
| nota-cocina | Indicación para cocina | `.sm-dish-request` (+ campo) | **nota, contador 200** | `ranura: escribir` | nuevo |
| compra | Bloque de compra (fijo abajo) | `.sm-dish-purchase`, `.sm-quantity-row`, `.sm-added` | **cantidad, total, agotado, enviando, añadido** | `ranura: cantidad, agregar, ver-pedido, seguir` | nuevo |

### 3.4 Pedido, cuenta de mesa y pago

| id | Nombre | Selectores | Datos | Acciones / ranuras | Estado actual |
|---|---|---|---|---|---|
| carrito | Distribución de las líneas | `.sm-cart-lines` | lista de linea-pedido | — | existe; distribución carrito |
| linea-pedido | Línea del pedido | `.sm-cart-line`, `.sm-cart-line-info`, `.sm-line-controls`, `.sm-swipe-delete` | **nombre, subtotal, cantidad, mio, comensal**; *foto, nota* | `ranura: cantidad, eliminar, deslizar-borrar` (solo si mio) | existe como `carrito`; separar |
| resumen | Resumen y totales | `.sm-summary`, `.sm-total` | **cart.total, cart.mio, total con descuento**; *descuento.porcentaje/monto* | — | nuevo |
| cupon | Cupón | `.sm-coupon`, `.sm-coupon-input`, `.sm-coupon-check` | *codigo aplicado, error* | `ranura: aplicar, quitar` | nuevo |
| confirmar | Botón de confirmar (fijo/portal al dock) | `.sm-cart-submit` | **texto, enviando** | `ranura: abrir-modalidad` | nuevo |
| modalidad | Diálogo comer aquí / para llevar | `.sm-fulfillment-dialog`, `.sm-order-details` | **takeaway, notas, alergenos (precarga account.alergenos)** | `ranura: elegir, continuar-pago, cerrar` | nuevo |
| resumen-cuenta | La cuenta (reparto) | `.sm-summary.sm-narrow` + segmentado | **bill.total, bill.mio, partes, bill.ok** | `ranura: modo, personas, volver-avisar, volver-menu` | nuevo |
| pago-monto | Encabezado del monto | `.sm-online-pay`, `.sm-pay-heading`, `.sm-pay-sandbox` | **amount_in_cents**; *environment test, other_payment_pending* | — | nuevo |
| pago-medios | Rejilla de medios de pago | `.sm-pay-method-grid`, `.sm-pay-method-icon`, `.sm-pay-icon-*` | **medios disponibles (BANCOLOMBIA_TRANSFER, BANCOLOMBIA_QR, NEQUI, CARD), elegido** | `ranura: elegir` | nuevo |
| pago-formulario | Campos del pago | `.sm-pay-form`, `.sm-pay-card-fields`, `.sm-pay-card-row`, `.sm-pay-consent` | **correo, consentimientos (urls)**; *celular (NEQUI), tarjeta (titular, número, mes, año, CVV, cuotas)* | `ranura: pagar, actualizar, consultar, pagar-con-mesero` | nuevo |
| pago-resultado | Resultado del pago | `.sm-pay-result`, `.sm-pay-qr`, `.sm-pay-challenge` | **status, reference**; *qr_image, redirect_url, challenge_html, card_brand, needs_review, reconciled, order_id* | `ranura: consultar, reintentar, terminar-prueba, seguir-pedido, volver-menu` | nuevo |

### 3.5 Estado del pedido, historial y recibo

| id | Nombre | Selectores | Datos | Acciones / ranuras | Estado actual |
|---|---|---|---|---|---|
| tarjeta-estado | Tarjeta de estado | `.sm-status`, `.sm-status-card`, `.sm-status-art` (`preparing/ready/served.png`) | **order.estado (7 valores)** | — | nuevo |
| detalle-pedido | Detalle desplegable | `.sm-status-details`, `.sm-timeline` | **order.id, impuestos, total**; *lineas[]* | — | nuevo |
| recibo-lineas | Líneas de recibo | `.sm-receipt-lines`, `.sm-receipt-total` | **lineas[] (nombre, cantidad, precio), total**; *foto, descuento* | — | nuevo (compartido por estado y recibo) |
| celebracion-pago | Celebración de pago | `.sm-paid-celebration` (recorrido) | **marca**; *recompensas.ganados* | `ranura: ver-puntos, ir-carta, ir-recompensas` | nuevo |
| tarjeta-historial | Tarjeta de pedido pasado | `.sm-history-grid`, `.sm-history-card`, `.sm-history-top`, `.sm-history-actions` | **id, estado (chip), local, fecha, total**; *mesa, lineas[]* | `ranura: valorar, detalle, estado, volver-a-pedir` | nuevo |
| recibo-papel | Recibo | `.sm-paper-receipt` | **local, fecha, id, estado, lineas, total**; *mesa, descuento* | `ranura: volver` | nuevo |

### 3.6 Cuenta del comensal

| id | Nombre | Selectores | Datos | Acciones / ranuras | Estado actual |
|---|---|---|---|---|---|
| perfil | Cabecera del perfil | `.sm-profile`, `.sm-profile-head`, `.sm-avatar-large`, `.sm-profile-stats` | **nombre, iniciales, correo, nº pedidos, nº favoritos**; *celular* | — | nuevo |
| interruptor | Interruptor de novedades | `.sm-profile-notification` | **novedades** | `ranura: cambiar` | nuevo |
| formulario-acceso | Formulario de cuenta | `.sm-auth-form`, `.sm-narrow`, `.sm-account-edit` | según pantalla (correo, contraseña, nombre, celular, alergenos) | `ranura: enviar` + enlaces | nuevo |
| relato-registro | Relato lateral del registro | `.sm-auth-layout`, `.sm-auth-story`, `.sm-auth-mark`, `.sm-auth-benefits` | **beneficios fijos**; *descuento.porcentaje si activo* | — | nuevo |
| casillas-codigo | Casillas del código | `.sm-code-boxes`, `.sm-code-form`, `.sm-code-input` | **6 dígitos, correo** | `ranura: verificar, opciones, renovar` | nuevo |
| lista-opciones | Lista de opciones (canal) | `.sm-help-list` | **opciones (correo, SMS), elegida, detalle** | `ranura: elegir` | nuevo |
| tarjeta-bancaria | Tarjeta de prueba y carrusel | `.sm-bank-card`, `.sm-bank-chip`, `.sm-slide-dots`, `.sm-wallet-details`, `.sm-wallet-empty` | **brand, last4, holder, expiry** (demo en localStorage) | `ranura: elegir, predeterminada, eliminar, añadir` | nuevo |

### 3.7 Ubicación, recompensas y opinión

| id | Nombre | Selectores | Datos | Acciones / ranuras | Estado actual |
|---|---|---|---|---|---|
| compartir-ubicacion | Compartir ubicación | `.sm-share-location`, `.sm-share-location-copy`, `.sm-location-nav` | **latitud/longitud de la sede** | `ranura: continuar (geolocalizar), manual` | nuevo |
| visor-qr | Visor y subida de QR | `.sm-qr-viewfinder`, `.sm-scan-upload` | — | `ranura: subir-foto, manual` | nuevo |
| tarjeta-local | Tarjeta del local | `.sm-venue-card` | **marca.nombre, direccion/sede**; *distancia* | `ranura: elegir` | nuevo |
| saldo-puntos | Saldo de puntos | `.sm-points-balance`, `.sm-member-code` | **puntos, programa, valorPunto, minimoCanje, codigo**; sin cuenta → fila-enlace | `ranura: reintentar` | nuevo |
| banner-recompensa | Banner de recompensa | `.sm-rewards`, `.sm-reward-banner` | **descuento.porcentaje (si activo)** | `ranura: ver-beneficio (hoja)` | nuevo |
| valoracion | Valoración general | `.sm-rating-hero`, `.sm-rating-control`, `.sm-rating-range`, `.sm-rating-scale` (`rating-1..5.png`) | **rating 1–5, etiqueta** | `ranura: elegir, continuar` | nuevo |
| valoracion-platos | Valoración por plato | `.sm-dish-ratings`, `.sm-feedback-comment`, `.sm-feedback-backdrop`, `.sm-feedback-invite` | **items[] (nombre, foto?), dishes{}**; *comment* | `ranura: puntuar, comentar, enviar` | nuevo |

### 3.8 Reserva

| id | Nombre | Selectores | Datos | Acciones / ranuras | Estado actual |
|---|---|---|---|---|---|
| marca-reserva | Marca de la reserva | `.sm-reservation-brand` | **marca.nombre, sede.nombre**; *logo* | — | nuevo |
| ticket-reserva | Ticket de la reserva | `.sm-reservation-ticket`, `.sm-reservation-hello`, `.sm-reservation-code` | **date, time_label, people, mesa(s), code**; *customer* | — | nuevo |
| reserva-resuelta | Reserva pagada / inactiva / sin costo | `.sm-reservation-done`, `.sm-reservation-mark` | **deposit_state, state** | `ranura: ver-menu` | nuevo |

### 3.9 Portada, intro y huérfanos (decidir en el Plan K)

| id | Nombre | Selectores | Situación |
|---|---|---|---|
| titulo-portada / pedido-activo | Portada | `.sm-home-title`, `.sm-home-active` | `SmartHome` no se despacha: reactivar la portada o retirar el código |
| intro | Introducción de primera visita | `SmartAbout` (recorrido con 4 diapositivas, `onboarding-*.png`) | se muestra (cookie por restaurante); plantillable como recorrido |
| asistente / preferencias / ayuda | Recorridos huérfanos | `.sm-step-*`, `.sm-answer-chips`, `.sm-strength`, `.sm-recommendations`, `.sm-preference-*`, `.sm-help-*` | huérfanos y con enlaces rotos desde el chat y el recordatorio |
| checkout-demo | `SmartDemoPay` | `.sm-checkout-*`, `.sm-payment-methods` | código muerto: retirar |

**Totales:** 25 pantallas reales + 6 declaradas sin despacho; 15 componentes actuales → **≈70 componentes y piezas**
(≈45 plantillables con datos propios y ≈25 piezas reutilizables). Ilustraciones estáticas en `diner/public/smart-menu/`
(23 PNG + `emoji/`), candidatas a la futura galería de decoraciones.

---

## 4. Lo que el inventario deja sobre la mesa para el Plan K

1. **Granularidad:** plantillas por componente plantillable (≈45); las piezas (botón, campo, foto, precio, insignia,
   stepper, segmentado, fila-enlace, hoja, recorrido) entran como utilidades que la plantilla compone, no como plantillas.
2. **Limpieza previa (K0, opcional pero recomendable):** retirar `SmartDemoPay`, `SmartAssistantReminder` y los
   recorridos huérfanos, o reactivarlos; arreglar el enlace del chat a `ayuda`; decidir si `portada` vuelve.
3. **Inventario v3 (`inventario.json`):** corregir `pantallas` (título en vez de cabecera, chat en el dock, plato sin
   cabecera y con campo, historial/recibo/reserva reales), ampliar selectores de hoja, campo, insignia, precio y
   banners, y añadir los componentes nuevos con `datos` (obligatorios/opcionales) y `ranuras`. Las pruebas de paridad
   existentes (`diner/lib/domain/__tests__/designVariants.test.ts`, `components/design-system/__tests__/samples.test.tsx`)
   y la página viva de J5 tendrán que crecer con él.
4. **Orden sugerido de plantillas** por impacto visual: tarjeta-plato, banners, cabecera, ficha-heroe, linea-pedido,
   tarjeta-historial, recibo-papel, tarjeta-estado, recorrido (intro y pantallas ilustradas).

---
