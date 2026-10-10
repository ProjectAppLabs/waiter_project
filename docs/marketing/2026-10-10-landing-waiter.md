# Landing de Waiter: planeación, motion y sistema de diseño

**Para qué es este documento:** construir la landing de Waiter en Claude Design. Reúne la estructura (tomada de la de
projectapp.co/es-co y adaptada al producto), el texto de cada sección, el motion con GSAP, los elementos gráficos que
faltan y el sistema de diseño que ya existe en el código.

**Estado:** planeación (2026-10-10). Los precios no están definidos y se manejan desde la consola de ProjectApp (ver §8).

---

## 1. Qué vendemos y a quién

**Waiter** (de ProjectApp) es el sistema para restaurantes que atiende, cobra y lleva domicilios sin depender de más
meseros ni de apps con comisión. Lema del producto: **«Opera más mesas con menos carga operativa»**.

- **Público principal:** dueños y administradores de restaurantes en Colombia, con una o varias sedes (de 1 a 10). Son
  restaurantes de barrio, hamburgueserías, cafés y cadenas pequeñas.
- **Quién decide:** el dueño. Lo que le importa es vender más, que no se le pierda plata (comisiones, errores, inventario)
  y que su equipo no se sature.
- **Acción principal (CTA):** «Agenda una demo» por WhatsApp. **Secundaria:** «Mira cómo funciona» (baja a la demo
  animada).
- **Tono:** el de projectapp.co. Tutea, directo, frases cortas y concretas, con cifras reales. Nada de «revolucionario»
  ni «potenciado por IA» como muletilla. La IA se muestra funcionando, no se anuncia.

### Lo que no debemos prometer todavía

El sprint de integraciones aún no se ha hecho. Hasta que esté, estas cosas se marcan **«Próximamente»** o no se
mencionan:

- WhatsApp real (API de Meta);
- cobro real con Wompi o Bold;
- facturación electrónica DIAN;
- datáfono integrado.

---

## 2. Referencia: la estructura de projectapp.co/es-co

| # | Sección en projectapp.co | Qué hace | En la landing de Waiter |
|---|---|---|---|
| 1 | Navegación fija | Logo, servicios, contacto por WhatsApp, idioma, iniciar sesión | Igual: Producto, Módulos, Domicilios, Precios, Preguntas · «Iniciar sesión» (POS) · «Agenda una demo» |
| 2 | Hero con promesa y mosaico de imágenes | Promesa + 2 CTA + confianza (NDA, +50 empresas, asesor real) | Promesa + demo animada del producto (teléfono y tablet) + confianza |
| 3 | Franja de logos (marquee) | «Somos los artesanos del código» + tecnologías | «Funciona con lo que ya usas»: Bancolombia, Nequi, Wompi, WhatsApp, OpenStreetMap |
| 4 | Servicios en pestañas | Diseño web, apps, software a la medida | Módulos en 4 pestañas (§3, sección 5) |
| 5 | Dolores en 4 tarjetas numeradas | «¿Te suena familiar?» + dato del 73% | Los 4 dolores del restaurante + un dato |
| 6 | Método en 3 fases | Diagnóstico, construcción, lanzamiento | «Así funciona», contado con el scroll (4 pasos) |
| 7 | Banda marquee | Frase repetida | Igual, con frases de Waiter |
| 8 | Resultados de clientes | Casos (hoy vacío) | Casos con cifras (necesito datos reales, §5) |
| 9 | Bloque de marca | Declaración de posicionamiento | Declaración de Waiter con tipografía cinética |
| 10 | Formulario de cotización | «Cotiza en menos de 24 horas» | «Agenda tu demo»: formulario corto + WhatsApp |
| 11 | Dos tarjetas de beneficio | «Software que sí funciona», «30 días» | «Sin comisiones», «Listo en una semana» (a confirmar) |
| 12 | Preguntas frecuentes (acordeón) | Costo, tiempos, código, soporte | Preguntas de restaurante (§3, sección 13) |
| 13 | CTA directo a WhatsApp con video | «¿Prefieres hablar directamente?» | Igual, con un video del producto |
| 14 | Pie de página | Servicios, redes, contacto, legales, páginas de Waiter | Igual. Las páginas legales de Waiter ya existen en projectapp.co |
| — | Botón flotante de WhatsApp | | Igual |

---

## 3. Estructura de la landing, sección por sección

Para cada sección: **objetivo**, **texto propuesto** (ajústalo con libertad), **distribución** y **motion** (detalle en §4).

### 0 · Navegación

- **Logo:** «Waiter.» + «By ProjectApp.» (la marca de texto del POS, ver §6).
- **Enlaces:** Producto · Módulos · Domicilios · Precios · Preguntas.
- **Derecha:** «Iniciar sesión» (enlace al POS) y el botón «Agenda una demo».
- **Motion:** al bajar, la barra se compacta (de 92px a 64px de alto) y gana un fondo de superficie al 88%.

### 1 · Hero

- **Objetivo:** que en 5 segundos se entienda qué es y para quién.
- **Título:** «Tu restaurante atiende, cobra y lleva domicilios. **Sin sumar meseros.**»
- **Subtítulo:** «El cliente pide desde su mesa con un toque, la cocina recibe la comanda al instante y tú ves todo en un
  solo lugar. Sin comisiones de apps de domicilio.»
- **CTA:** «Agenda una demo» (principal, abre WhatsApp) y «Mira cómo funciona ↓» (secundario).
- **Confianza** (como el NDA de ProjectApp): «Te responde una persona real · Instalación acompañada · Tus datos son
  tuyos (Ley 1581)».
- **Distribución:** a la izquierda el texto; a la derecha una escena con un **teléfono** (el menú del comensal) delante
  de una **tablet** (el POS). En móvil, la escena va debajo del texto.
- **Motion (la firma de la página):** un ciclo de unos 8 s.
  1. Un dedo toca el NFC de la mesa.
  2. La carta aparece en el teléfono.
  3. Un plato «vuela» al carrito: es la animación de papelito que ya existe en el menú (`CartToss`).
  4. En la tablet entra la comanda.
  5. El número de ventas del día sube.

  El título entra palabra por palabra (SplitText); la parte en negrita llega al final con un subrayado dibujado a mano
  (DrawSVG).

### 2 · Franja «Funciona con lo que ya usas»

- **Logos:** Bancolombia, Nequi, Wompi, WhatsApp, OpenStreetMap, y tarjetas Visa y Mastercard. Usarlos requiere revisar
  el manual de marca de cada uno (§5).
- **Motion:** un marquee infinito y lento que se detiene al pasar el mouse. En `prefers-reduced-motion` queda estático.

### 3 · Dolores: «¿Te pasa esto un viernes a las 8 p. m.?»

Cuatro tarjetas numeradas, como en projectapp.co:

| # | Título | Texto |
|---|---|---|
| 01 | **Mesas esperando al mesero** | «Para pedir, para pagar, para la cuenta. Cada espera es una mesa que rota menos.» |
| 02 | **Comisiones que se comen el margen** | «Las apps de domicilio se quedan con hasta 30% de cada pedido.» (validar la cifra) |
| 03 | **Comandas que llegan mal a cocina** | «Papelitos, gritos y platos repetidos.» |
| 04 | **Inventario a ciegas** | «Te enteras de que se acabó la carne cuando el cliente ya pidió.» |

- **Dato de cierre** (como el 73% de ProjectApp): necesito una cifra real nuestra (§5); si no la hay, se quita.
- **Motion:** las tarjetas entran escalonadas desde abajo. El número de cada una cuenta de 00 a su valor.

### 4 · «Así funciona», contado con el scroll

- **Objetivo:** la demo del producto sin video, con la sección **fijada** (pin) mientras se baja.
- **Distribución:** un teléfono y una tablet fijos en el centro; a la izquierda, los pasos que van cambiando.

| Paso | Título | Texto | Lo que muestra la escena |
|---|---|---|---|
| 1 | **Toca y pide** | «NFC o QR en la mesa. Sin descargar nada.» | El teléfono pasa de la portada a la carta |
| 2 | **Tu mesero virtual recomienda** | «Pregunta el nombre, recomienda lo mejor de la casa y sugiere con qué acompañarlo. Habla como tu región: paisa, costeño, rolo…» | Burbujas de chat escribiéndose |
| 3 | **La cocina recibe al instante** | «La comanda llega a la pantalla de cocina, sin papel.» | Una tarjeta de comanda entra en la tablet y cambia de «En cocina» a «Listo» |
| 4 | **Paga y vuelve** | «Paga desde el celular y acumula puntos para la próxima.» | Monedas que suman puntos, con la ilustración del trofeo |

- **Motion:** ScrollTrigger con `scrub` y una línea de tiempo por paso. Las pantallas se cambian con Flip, para que el
  movimiento salga de la interfaz real y no de un efecto genérico.

### 5 · Módulos: «Arma tu Waiter»

- **Objetivo:** mostrar el catálogo real de la consola (`experience/tenancy/modules.py`), agrupado en 4 pestañas.
- **Distribución:** pestañas arriba. Debajo, tarjetas con un icono (Tabler), el nombre, una línea de beneficio y una
  micro-animación al pasar el mouse.

| Pestaña | Módulo (nombre en la consola) | Línea de beneficio |
|---|---|---|
| **Operación** | Núcleo | «POS, caja, catálogo y equipo. La base de todo.» |
| | Salón | «Mesas en vivo: libre, ocupada, en cocina, por cobrar.» |
| | Cocina | «Pantalla de cocina por estaciones, sin papel.» |
| | Inventario | «Recetas, existencias y alertas antes de que se acabe.» |
| | Varios locales | «Todas tus sedes en una consola.» |
| **Ventas digitales** | Menú del comensal | «Tu carta con tu marca, pedido y pago desde la mesa.» |
| | Domicilios (dentro del menú) | «Pedidos a domicilio propios, sin comisión.» |
| | Pagos en línea | «Bancolombia, QR, Nequi y tarjetas.» **Próximamente** cobro real |
| | Reservas | «Horarios, mesas y anticipo con enlace.» |
| **Inteligencia** | Asistente en el menú | «Un mesero virtual que recomienda y vende más.» |
| | Asistente de WhatsApp | «El mismo mesero toma pedidos por WhatsApp.» **Próximamente** |
| | Fidelización | «Puntos, cupones y premios que hacen volver.» |
| **Cumplimiento** | Facturación electrónica | «Factura DIAN desde el mismo pedido.» **Próximamente** |
| | Datáfono integrado | **Próximamente** (hoy no está disponible) |

- **CTA de la sección:** «Arma tu plan» lleva a Precios (sección 9).
- **Motion:** al cambiar de pestaña, las tarjetas se reordenan con Flip. El icono de cada tarjeta tiene su propia
  micro-animación (el camión avanza, la llama parpadea, el chef asiente). Duran 0,4 s y no se repiten en bucle.

### 6 · Destacado: «Domicilios propios, sin comisión»

- **Objetivo:** el diferenciador más fuerte frente a Rappi y similares.
- **Título:** «Tus domicilios, **tu margen**.»
- **Puntos:**
  - «El cliente comparte su ubicación y Waiter escoge la sede que le llega.»
  - «Tú decides cómo cobrar el envío: por distancia, tarifa fija, gratis o gratis desde un monto.»
  - «Tu mapa con tus colores, con los puntos de referencia del barrio.»
- **Distribución:** dividida. A un lado, un mapa con los colores de la marca (es nuestro estilo de MapLibre, la variante
  `marca`); al otro, el texto.
- **Motion:**
  1. El pin cae con rebote: es la misma animación del producto, la de las apps de transporte.
  2. Se dibujan los anillos del radio de cobertura de cada sede (DrawSVG).
  3. Un punto viaja de la sede a la casa por una ruta (MotionPath).
  4. Aparece el aviso «Te lo lleva Poblado · Envío $4.000».

### 7 · Destacado: «Un mesero que habla como tu ciudad»

- **Objetivo:** mostrar la IA sin decir «IA». Es el diferenciador más visual.
- **Distribución:** un chat en un teléfono y, arriba, unas fichas para cambiar de tono: Neutro · Paisa · Rolo · Costeño ·
  Caleño · Santandereano. Al tocar una ficha, la misma conversación se reescribe en ese tono, con frases reales de
  `assistant/tones.py`.
- **Motion:** el texto se escribe letra por letra, a la velocidad de un humano y con pausas irregulares. Las burbujas
  entran con un leve rebote.
- **Nota:** solo frases reales del producto, no inventadas.

### 8 · Banda marquee

- **Texto:** «✳ Más mesas, menos carga ✳ Sin comisiones de domicilio ✳ Tu marca en cada pedido ✳»
- **Motion:** la velocidad responde a la del scroll y se invierte al subir (`ScrollTrigger` con `getVelocity`).

### 9 · Precios: «Paga por lo que usas»

- **Objetivo:** los planes y precios de la consola de ProjectApp, **sin escribirlos a mano en la landing** (contrato en
  §8).
- **Distribución:**
  - 2 o 3 tarjetas de plan, con el nombre y el precio que manda la consola.
  - Debajo, la calculadora «Arma tu plan»: interruptores por módulo y el total mensual.
  - Una nota de cobro por uso, para los módulos con unidades: mensajes de IA, documentos DIAN, etc. Las unidades ya
    existen en `modules.py`.
- **Mientras no haya precios:** la sección muestra «Precios a la medida de tu restaurante. Agenda una demo y te
  cotizamos en 24 horas». Ese texto lo puede manejar la misma consola.
- **Motion:** el total cuenta al cambiar (número tabular, sin saltos de ancho). La tarjeta destacada tiene un borde que
  recorre su contorno, una sola vez.

### 10 · Resultados

- **Título:** «Restaurantes que ya atienden más con menos.»
- **Contenido:** 2 o 3 casos con logo, foto, cifra protagonista («+18% en ticket promedio»), cita y nombre. **Necesito
  datos reales (§5).**
- **Motion:** la cifra cuenta al entrar en pantalla. Las fotos tienen un parallax suave (máximo ±40px).

### 11 · Seguridad y datos (confianza)

- **Título:** «Tus datos y los de tus clientes, protegidos.»
- **Puntos, todos reales en el producto:**
  - autorización de datos de los clientes según la Ley 1581, con retiro cuando quieran;
  - credenciales de pago cifradas que nadie puede volver a ver;
  - código de un solo uso al correo para tocar los pagos;
  - cada restaurante aislado de los demás.
- **Motion:** discreto. Un candado que se cierra con DrawSVG, y nada más.

### 12 · Formulario «Agenda tu demo»

- **Campos:** nombre, restaurante, ciudad, número de sedes (1 · 2–3 · 4+), celular y una casilla «Acepto el tratamiento
  de datos» con enlace a la política (el mismo patrón del menú).
- **CTA:** «Agendar demo» y, al lado, «Prefiero WhatsApp».
- **Motion:** el botón muestra el envío y luego un check dibujado. Sin confeti.

### 13 · Preguntas frecuentes (acordeón)

1. ¿Necesito cambiar mi caja o mis equipos? (funciona en el navegador: tablet, computador o celular)
2. ¿Mis clientes tienen que descargar una app? (no: NFC o QR)
3. ¿Cuánto cuesta? (enlace a Precios o a la demo)
4. ¿En cuánto tiempo quedo funcionando? (definir: ¿una semana?)
5. ¿Qué pasa con mis domicilios de Rappi? (puedes seguir con ellos y sumar los tuyos sin comisión)
6. ¿El mesero virtual reemplaza a mi equipo? (no: les quita lo repetitivo)
7. ¿Mis datos y los de mis clientes son míos? (sí; Ley 1581)
8. ¿Funciona si tengo varias sedes? (sí, Varios locales)

### 14 · CTA final y pie

- **CTA:** «¿Hablamos?», con un video de fondo del producto en uso (necesito el video, §5) y el botón de WhatsApp.
- **Pie:** igual que projectapp.co.
  - Columnas Producto, Módulos y Empresa.
  - Legales de Waiter: Política de privacidad, Condiciones del servicio, Eliminación de datos (ya existen).
  - Redes, NIT y dirección en Medellín.
  - «Waiter es un producto de ProjectApp».

---

## 4. Motion graphics con GSAP: que no parezca hecho por IA

### 4.1 Principios

1. **El movimiento sale del producto, no de una plantilla.** Cada animación cuenta algo real del producto:
   - el papelito que cae al carrito;
   - el pin que cae con rebote;
   - la comanda que entra a cocina;
   - el radio de cobertura de cada sede;
   - el chat que se escribe.

   Son las animaciones que el producto ya tiene. La landing las amplifica.
2. **Física creíble.** Objetos con peso: entran rápido y frenan (`power3.out` o `expo.out`). Lo que cae rebota una vez
   (`back.out(1.6)`). Nada flota en bucle sin motivo.
3. **Imperfección humana.** El texto se escribe con pausas irregulares y el subrayado se dibuja a mano (un trazo SVG
   con variación). En las ilustraciones, la línea tiene grosor variable.
4. **Una cosa a la vez.** En cada momento hay un solo protagonista animado; lo demás queda quieto.
5. **Lo que suele delatar a la IA (prohibido):**
   - manchas de gradiente morado y azul flotando;
   - glassmorphism en todo;
   - brillos ✨ y partículas;
   - texto con degradado arcoíris;
   - tarjetas que se inclinan en 3D al pasar el mouse;
   - contadores de «10.000+ clientes» inventados;
   - fotos genéricas de stock con personas sonriendo a una tablet.

   El aura (fondo de manchas) del POS sí se puede usar, pero una sola vez, en el CTA final, y con los colores reales de
   los estados.

### 4.2 Herramientas

- **GSAP 3.13 o superior** (fijar la versión exacta). Desde 2025 todos sus plugins son gratuitos. Los que usamos:

  | Plugin | Para qué |
  |---|---|
  | ScrollTrigger | Pin, scrub y animaciones al entrar en pantalla |
  | SplitText | Títulos por palabra o por línea |
  | DrawSVG | Subrayados, radios del mapa, candado, check |
  | MorphSVG | Iconos que cambian, como En cocina → Listo |
  | Flip | Cambios de pantalla y reordenar tarjetas |
  | MotionPath | La ruta del domicilio |
  | ScrollSmoother | Opcional; solo si no estorba en móvil |

- **Integración:**
  - `gsap.matchMedia()` separa escritorio, móvil y `prefers-reduced-motion`.
  - `gsap.context()` (o `useGSAP` en React) limpia las animaciones al desmontar.

### 4.3 Tokens de movimiento

| Token | Valor | Uso |
|---|---|---|
| `dur-micro` | 0.18 s | Pasar el mouse, presionar un botón |
| `dur-base` | 0.4 s | Tarjetas, cambio de pestaña |
| `dur-escena` | 0.8–1.2 s | Entrada de un título o una escena |
| `ease-entrada` | `power3.out` | Casi todo lo que entra |
| `ease-peso` | `expo.out` | Pantallas y objetos grandes |
| `ease-rebote` | `back.out(1.6)` | Pin, papelito, check |
| `stagger` | 0.06 s (palabras), 0.08 s (tarjetas) | Escalonados |
| distancia de entrada | 24–40px | Nunca más; nada viene «desde lejos» |

### 4.4 Rendimiento y accesibilidad

- Solo se animan `transform` y `opacity`, y los SVG con DrawSVG o MorphSVG. Nunca `top`, `width` ni `filter` en bucle.
- Para muchos elementos se usa `ScrollTrigger.batch()`. Los videos se cargan solo al acercarse y sin autoplay con sonido.
- Con `prefers-reduced-motion: reduce`:
  - todo aparece sin desplazamiento (solo opacidad);
  - el marquee se queda quieto;
  - el pin de la sección 4 se vuelve una lista de 4 pasos.
- El contenido es legible y navegable sin JavaScript: el texto no depende de la animación para existir.
- **Metas:** LCP menor de 2,5 s en 4G, CLS menor de 0,05 y animaciones a 60 fps en un Android de gama media.

---

## 5. Lo que necesito que me des

Ordenado por prioridad. **Prioridad A:** sin esto no se puede publicar. **B:** la hace mucho mejor. **C:** se puede
después.

### A · Imprescindible

| # | Elemento | Formato | Detalle |
|---|---|---|---|
| A1 | **Logo de Waiter** (horizontal y monograma) | SVG + PNG 1024px, versión clara y oscura | Hoy solo existe la marca de texto «Waiter.» del POS; no hay archivo. Si no hay logo, uso la marca de texto en Open Sans semibold con tracking −0.02em. |
| A2 | **Logo de ProjectApp** | SVG | Para el «By ProjectApp» y el pie. |
| A3 | **Decisión de colores de la landing** | — | ¿Usamos el azul del POS (#447DFC) como color de marca de Waiter? (recomendado, ver §6) |
| A4 | **Número de WhatsApp comercial y correo** | Texto | Para los CTA, el formulario y el botón flotante. |
| A5 | **Dominio y URL de la landing** | Texto | Por ejemplo waiter.projectapp.co o projectapp.co/es-co/waiter. |
| A6 | **Grabaciones de pantalla del producto** (6) | MP4/WebM, 60 fps, sin sonido, 1080p o más, 8–15 s cada una, sin datos reales de clientes | 1) Menú: portada → carta → agregar plato (con la animación del carrito). 2) Chat del asistente recomendando. 3) Mapa de domicilio: pin y dirección. 4) Salón del POS con mesas cambiando de estado. 5) Cocina recibiendo una comanda. 6) Consola del dueño: ventas del día. Las puedo grabar yo con la demo de Burger House si me autorizas. |
| A7 | **Capturas fijas** de las mismas pantallas | PNG 2x, teléfono 390×844 y tablet 1180×820 | Para los mockups y la imagen para redes. Las puedo generar yo. |
| A8 | **Textos legales** | Enlaces | Política de privacidad, Condiciones y Eliminación de datos (ya están en projectapp.co; confirmar las URL). |
| A9 | **Datos de la empresa** | Texto | Razón social, NIT y dirección para el pie. |

### B · Mejora mucho

| # | Elemento | Formato | Detalle |
|---|---|---|---|
| B1 | **Fotografía real de restaurante** (8–12) | JPG de 2400px o más, horizontal y vertical | Mesas con el NFC o QR, un cliente pidiendo con el celular (de espaldas o con autorización), la cocina con la pantalla, un domiciliario entregando, platos. **Fotos reales, no de stock.** |
| B2 | **Casos de clientes** (2–3) | Texto + logo SVG + foto | Restaurante, ciudad, persona, cargo, cita corta, **una cifra medida** (ticket promedio, mesas por mesero, pedidos de domicilio sin comisión) y la autorización escrita. |
| B3 | **El dato propio** para la sección de dolores | Una cifra con su fuente | Por ejemplo «X% de los pedidos de nuestros clientes llegan sin pasar por un mesero». |
| B4 | **Fotos de los NFC o del QR físico** | JPG/PNG sin fondo | El objeto real que va en la mesa. |
| B5 | **Video del CTA final** | MP4 de 20–30 s en bucle, sin sonido, 1080p, menos de 6 MB | El producto en uso en un restaurante real. |
| B6 | **Manuales de marca de los aliados** | PDF o enlace | Bancolombia, Nequi, Wompi, WhatsApp y las tarjetas, para usar sus logos con permiso. |
| B7 | **Tiempos de implementación** | Texto | ¿En cuánto queda funcionando un restaurante? Lo pide la FAQ. |

### C · Puede ir después

| # | Elemento | Formato | Detalle |
|---|---|---|---|
| C1 | Foto del equipo o de los fundadores | JPG | Para la sección «Quiénes somos», si se quiere. |
| C2 | Imagen para redes (OG) | 1200×630 | La puedo componer con el logo y una captura. |
| C3 | Medición | IDs | GA4, Meta Pixel y eventos: clic en WhatsApp, envío del formulario, cambio de módulos en la calculadora. |
| C4 | Versión en inglés | — | El sitio de ProjectApp tiene ES/EN. |

### Lo que puedo hacer yo (no hace falta que lo traigas)

- **Ilustraciones de escena hechas con código** (SVG): mesa con NFC, tablet, cocina, ruta de domicilio y candado, con
  trazo propio, no de stock.
- **Mockups** de teléfono y tablet en CSS (sin imágenes de marcos).
- **El mapa de la sección 6**, con nuestro estilo propio de MapLibre (variante `marca`).
- **Las conversaciones del asistente** en los 6 tonos, sacadas de `assistant/tones.py`.
- **Capturas y grabaciones de la demo de Burger House**, si autorizas usarla.
- **Las ilustraciones existentes del menú** (`diner/public/smart-menu/`): payment, wallet, points, trophy, preparing,
  ready, served, qr, location, assistant y 42 emojis de comida. Sirven como apoyo, sin abusar.

---

## 6. Sistema de diseño (lo que ya tenemos)

Waiter tiene **dos sistemas**, y la landing debe sentirse de la misma familia:

- **El kit del POS:** la marca de Waiter como producto.
- **El del menú del comensal:** cambia con la marca de cada restaurante.

**Recomendación:** la landing usa el **kit del POS** como base. Muestra el del comensal dentro de los teléfonos, con la
marca de Burger House, para enseñar que cada restaurante tiene la suya.

### 6.1 Kit del POS (la marca Waiter)

**Fuentes de verdad en el código:**
- `pos/app/globals.css`: variables `--kit-*` y `@theme` de Tailwind v4.
- `pos/lib/design/tokens.ts`: lo mismo en TypeScript, verificado por una prueba.
- Documento: `docs/diseno/2026-09-19-sistema-de-diseno-pos.md`.

**Color (claro / oscuro)**

| Token | Claro | Oscuro | Uso en la landing |
|---|---|---|---|
| primary | **#447DFC** | #447DFC | Color de marca: CTA, enlaces, acentos |
| primary-soft | #EEF4FF | #1E2A44 | Fondos de destacados |
| brand-300 / 600 / 700 | #93B4FD / #2F66E6 / #1F4FC2 | | Botón al pasar el mouse y al presionar |
| canvas | #F8FAFC | #131316 | Fondo de página |
| surface | #FFFFFF | #1A1A1E | Tarjetas |
| muted | #F1F5F9 | #26272B | Bloques secundarios |
| border | #E2E8F0 | #51525C | Bordes |
| ink | #0F172A | #F7F7F7 | Texto |
| soft | #475569 | #A0A0AB | Texto secundario |
| dim | #94A3B8 | #70707B | Texto terciario («By ProjectApp») |

**Colores de estado** (en la landing se usan para dar vida a las escenas del producto):

| Estado | Base | Suave | Tinta |
|---|---|---|---|
| progress (en curso, pendiente) | #F59E0B | #FFFBEB | #B45309 |
| success (listo, libre) | #22C55E | #F0FDF4 | #15803D |
| danger (ocupada) | #EF4444 | #FEF3F2 | #B91C1C |
| info (en cocina) | #6172F3 | #EEF4FF | #3538CD |
| delivery (domicilios) | #0D9488 | #F0FDFA | #0F766E |

**Tipografía**
- Familias:
  - Interfaz y titulares: **Open Sans** (400/500/600).
  - Cifras y código: **IBM Plex Mono** (400/500).
- Tracking: marca −0.035em, títulos −0.02em.
- Escala del producto: acceso 40px/1.1, marca 28px, título 24px, sección 16px, cuerpo 16px, etiqueta 15px, apoyo 13px.
  Las cifras usan números tabulares.
- **Escala propuesta para la landing**, una extensión que hay que decidir:

  | Uso | Tamaño |
  |---|---|
  | Display | `clamp(44px, 7vw, 88px)` / 1.02, semibold, −0.035em |
  | H2 | `clamp(32px, 4.5vw, 56px)` / 1.08 |
  | H3 | 24px |
  | Cuerpo grande | 20px / 1.5 |
  | Cuerpo | 16–17px |

  Si Open Sans se queda corta en display, una alternativa con más carácter es **Instrument Serif** solo para palabras
  destacadas. Ya está en la lista de fuentes del menú.

**Forma, espacio y tamaños**
- Radios: 8 (sm), 12 (botones y campos), 16 (tarjetas), 24 (modales y bloques grandes).
- Áreas táctiles: mínimo 48px en el POS y 44px en el menú. En la landing, los botones miden 48–56px.
- Sombras: casi no se usan (solo `shadow-sm` y `shadow-lg` de Tailwind). La landing debe ser plana, con bordes y
  superficies, sin sombras pesadas.

**Fondo «aurora»** (`pos/components/kit/Aurora.tsx`)
- Base azul noche: `linear-gradient(150deg, #152A78, #0D1840 55%, #0B1430)`.
- Cinco manchas difuminadas (blur 44px, `mix-blend-mode: screen`):

  | Mancha | Color | Origen |
  |---|---|---|
  | azul | #447DFC | marca |
  | índigo | #6172F3 | en cocina |
  | ámbar | #F59E0B | en curso |
  | menta | #2DD4A7 | listo |
  | rosa | #F4628C | acceso |

- Las manchas derivan en 22–36 s. Respeta `prefers-reduced-motion`.
- **En la landing:** solo en el CTA final (sección 14). Ver §4.1, punto 5.

**Iconos:** Tabler Icons (`@tabler/icons-react`), con nombres semánticos en `pos/components/kit/Icon.tsx`: dashboard,
tables, kitchen, cash, chef, qr, delivery, receipt, card, wallet, sparkles, flame, star, printer, fingerprint, etc.
Trazo de 1.5–2px. La landing usa los mismos.

**Marca de texto** (`pos/components/kit/BrandMark.tsx`): «Waiter.» semibold, tracking −0.02em (19 o 28px), y debajo
«By ProjectApp.» en color dim (10 o 12px).

### 6.2 Sistema del menú del comensal (lo que se ve dentro del teléfono)

**Dónde está:** contrato versionado en `experience/experience_app/diseno/esquema.json`, con `inventario.json`,
`utilidades.json`, `decoraciones.json`, `componentes.json` y `README.md` en la misma carpeta. Las variantes están en
`diner/lib/domain/designVariants.ts`. Hay 31 plantillas en `experience/experience_app/plantillas/catalogo/`.

**Variables de tema** (`--t-*`): fondo, superficie, tinta, tinta-suave, tinta-terciaria, borde, acento, acento-tinta,
acento-suave, y las fuentes display, cuerpo y mono.

**Fundamentos** (`--ds-*`):
- densidad (0.75–1.5) y texto (1–1.5; cuerpo base de 14px × factor);
- `forma.*` (0–2, multiplica el radio);
- textura: retícula, cuaderno, puntos o diagonal;
- espacios de 2 a 64.

**Variantes** (16 ejes; cada restaurante escoge el aspecto de su menú):

| Eje | Valores |
|---|---|
| botón | relleno, contorno, suave |
| forma del botón | tema, píldora, recta |
| tarjeta | plana, sombra, borde |
| categorías | chips, pestañas, subrayado |
| precio | destacado, normal, píldora |
| imagen | actual, cuadrada, 4:3 |
| forma de la imagen | actual, tema, circular |
| marco de la imagen | ninguno, borde, sombra |
| cabecera | izquierda, centrada |
| saludo | visible, oculto |
| insignia | rellena, contorno |
| banners | actual, tema |
| mapa | marca, claro, oscuro, gris |
| distribución de la carta | actual, cuadrícula, lista, foto grande |
| distribución de la ficha | actual, héroe, dividida |
| distribución del carrito | tarjetas, compacta |

**Plantilla por defecto S1 «Smart Menu»:** fondo #F8F8FA, superficie #FFFFFF, tinta #32324D, tinta suave #666687,
acento #6755A0, acento suave #EEEBF5, borde #EAEAEF. Fuentes: DM Sans 500 (display) y Mulish (cuerpo).

**Burger House** (la demo; ideal para los teléfonos de la landing): granate #7A2E2A con texto #FFFFFF y suave #F2EAEA,
fuente Fraunces, radio 14, lema «Cocina de barrio», saludo «¿Qué te provoca hoy?». En la carta aparece el amarillo de
los botones (el que se ve en las capturas).

> **Idea para la sección 1 o la 5:** mostrar en el teléfono el mismo plato con 3 plantillas distintas (Burger House, S1,
> B1), con Flip, para enseñar «tu menú con tu marca» sin decirlo.

### 6.3 Reglas de accesibilidad que ya cumplimos (y la landing también)

- Contraste de texto de al menos **4.5:1**; gráficos (pin, iconos) de al menos **3:1**.
- Texto de al menos **14px**; áreas táctiles de al menos **44×44px** (48px en el POS).
- Un verificador en Chromium mide el contraste, los tamaños y los controles (`diner/scripts/design-system/`). Se puede
  correr sobre la landing.
- Todo con `prefers-reduced-motion` y navegación por teclado.

---

## 7. Componentes que necesita la landing

| Componente | Base existente | Nota |
|---|---|---|
| Botón (principal, secundario, fantasma) | `pos/components/ui/Button.tsx` | 48–56px de alto, radio 12 |
| Barra de navegación compactable | — | Nueva |
| Tarjeta (de dolor, de módulo, de caso) | `components/kit/Card.tsx` | Plana, con borde, radio 16 |
| Pestañas | `ui/Segmented.tsx` | Para los módulos |
| Acordeón | — | Nuevo, accesible (`<details>` mejorado) |
| Marquee | — | Nuevo, con GSAP |
| Marco de teléfono y de tablet | — | Nuevos, en CSS |
| Burbuja de chat | `diner/components/smart/SmartChat.tsx` | Reutilizar sus estilos |
| Tarjeta de mapa | `LocationPicker.tsx` (estilo) | Una imagen estática o un mapa liviano |
| Tarjeta de precio y calculadora | — | Nuevas; consumen la API de §8 |
| Cifra animada | — | Números tabulares |
| Formulario con consentimiento | El patrón «Acepto el tratamiento de datos» | Igual al del menú |
| Botón flotante de WhatsApp | — | Nuevo |

---

## 8. Precios desde la consola de ProjectApp (contrato de datos)

Hoy la consola guarda el precio **por organización y por módulo** (contratos de cada cliente: `OrganizationModule.price`,
`unit_prices`). **No hay un catálogo público** que la landing pueda leer. Propuesta (por construir; no está hecha):

- **En la consola:** una pantalla «Catálogo público» para definir:
  - los planes visibles (nombre, precio mensual, módulos incluidos y si va destacado);
  - el precio de cada módulo adicional;
  - el precio de cada unidad de uso: mensaje de IA, documento DIAN, pedido del asistente;
  - el texto de «Precios a la medida» para mientras no se publiquen.
- **API pública, solo de lectura y con caché:** `GET /api/public/v1/catalogo`

```json
{
  "moneda": "COP",
  "publicado": true,
  "mensaje_sin_precios": "Precios a la medida de tu restaurante. Agenda una demo.",
  "planes": [{ "clave": "completo", "nombre": "Completo", "precio_mensual": 0, "destacado": true,
               "modulos": ["nucleo", "salon", "cocina", "menu_comensal"] }],
  "modulos": [{ "clave": "reservas", "nombre": "Reservas", "grupo": "ventas", "precio_mensual": 0,
                "proximamente": false, "unidades": [] }],
  "unidades": [{ "clave": "mensaje_ia", "nombre": "Mensaje respondido", "precio": 0 }]
}
```

- **En la landing:** si `publicado` es false, la sección 9 muestra `mensaje_sin_precios` y el CTA. Los nombres de los
  módulos salen de esta API, así que coinciden siempre con la consola.

---

## 9. Técnica (si después se pasa a código)

- **Dónde vive:** una app aparte (por ejemplo, `landing/`, en Next.js como el POS y el menú, o Astro como projectapp.co).
  Es estática salvo los precios y el formulario.
- **SEO:**
  - metadatos en español de Colombia;
  - `schema.org` `SoftwareApplication` con las ofertas de la API, y `FAQPage` para las preguntas;
  - imagen OG;
  - `sitemap.xml`;
  - URL limpias por sección (`#modulos`, `#precios`).
- **Formulario:** se envía al CRM de ProjectApp (definir si es la consola o un correo). Antispam con honeypot, y
  consentimiento obligatorio.
- **Presupuesto de peso:** JS de la página (incluido GSAP) por debajo de 180 KB comprimido. Videos de menos de 6 MB cada
  uno, cargados solo al acercarse. Imágenes AVIF/WebP con `srcset`.
- **Verificación:** el verificador de Chromium del proyecto (contraste, tamaños, 44px) más Lighthouse en móvil.

---

## 10. Decisiones pendientes (para ti)

1. ¿El azul #447DFC es el color de marca de Waiter en la landing? (recomendado)
2. ¿Hay logo de Waiter o usamos la marca de texto?
3. ¿Dominio y URL?
4. ¿Autorizas usar la demo de Burger House en capturas y videos?
5. ¿Qué módulos salen como «Próximamente» (§1)?
6. ¿Planes y precios: los publicamos o arrancamos con «a la medida»? (§8)
7. ¿Tiempo de implementación que prometemos?
8. ¿Hay clientes con cifras y autorización para los casos?
