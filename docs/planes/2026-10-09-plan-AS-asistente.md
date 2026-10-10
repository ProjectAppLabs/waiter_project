# Plan AS · Un solo asistente para el menú y WhatsApp: determinista por dentro, natural por fuera

**Fecha:** 2026-10-09 · **Rama:** `feat/09102026-asistente` (sobre `feat/09102026-whatsapp`) · **Diseño:**
[revisión del asistente con Jev](2026-10-09-asistente-ia-jev-revision.md), secciones 9 a 16. **Pedido del dueño:**
«arranca con el resto de las cosas, recuerda que este sistema es tanto para WhatsApp como para el asistente IA del
menú».

## Principio

**El LLM no decide.** Filtros del servidor → atajos sin modelo → evaluador (Jev, los oídos) → servidor (decide) → voz
(GPT-6 Luna) → revisión → cliente. Todo vive en un **núcleo común** que usan los dos canales: el chat del menú
(`experience_app/services/agent_chat.py`) y WhatsApp (`whatsapp/processing.py:on_incoming_message`). Cada canal solo
traduce su entrada y su salida (en el menú, tarjetas y chips; en WhatsApp, texto, listas y botones).

## Esta entrega (sin claves externas)

Sin `TYPESAFE_API_KEY` ni `OPENAI_API_KEY`, todo funciona con las capas deterministas y respuestas de plantilla. Las
implementaciones de Jev y de la voz se escriben y se prueban con respuestas simuladas; se activan solas cuando estén las
claves.

### Servidor: app nueva `assistant` en experience

1. **Núcleo** `assistant/engine.py`: `handle(channel, restaurant, participant, text=None, action=None) -> Reply`.
   - `channel`: `menu` o `whatsapp`. `participant`: el comensal (menú) o el teléfono (WhatsApp).
   - `action`: toque de botón o tarjeta (`{"type": "pick", "product_id"}`, `{"type": "confirm"}`, `{"type": "option", "value"}`…); nunca pasa por modelos.
   - `Reply`: `{"text", "cards": [{"product_id", "name", "price", "reason"}], "options": [{"label", "value"}],
     "state", "notice": {"kind": "reminder"|"warning"|"restricted"|"paused"|"quota", "until"} | null,
     "route", "source": "shortcut"|"cache"|"evaluator"|"llm"|"template"}`.
   - El chat del menú (`agent_chat.send`) pasa a usar el núcleo y conserva su forma de respuesta actual (las tarjetas
     siguen saliendo de `lineas`); WhatsApp lo llama desde `on_incoming_message` y envía el texto (las listas y los
     botones de WhatsApp quedan para la entrega con Meta aprobada).
2. **Filtros y cupos** (antes de cualquier modelo): tamaño (>1.000 caracteres), ritmo (3 s, agrupar seguidos), cupo
   por persona (`ASSISTANT_DAILY_PER_PARTICIPANT`, 30), cupo por restaurante (`AGENT_DAILY_LIMIT` existente), repetidos
   y basura (mismo texto, solo emojis o símbolos), bucles (la misma pregunta del asistente dos veces → opciones).
3. **Escalera de avisos** (modelo `AssistantStanding` por organización y participante): recordatorio (2 fuera de tema
   seguidos), advertencia (4 en 10 min o 1 intento de cambiar reglas), restricción 30 min (solo opciones y respuestas
   fijas; **en WhatsApp no se responde el texto libre durante la restricción**, solo los botones), pausa hasta el día
   siguiente. Un mensaje del menú o un pedido baja el contador. Aviso anticipado del cupo («te quedan 5»). Todo con
   plantillas, sin modelos. Registro en el historial de cambios (`tenancy.audit`).
4. **Atajos deterministas**: respuesta a la pregunta pendiente («sí», «no», «la 2», un número), palabras clave del
   negocio (horario, dirección, domicilio, menú, mi pedido) con datos de la sede, y nombre de plato del catálogo con
   tolerancia a errores (sin tildes, plural, una letra de diferencia).
5. **Evaluador** (`assistant/evaluator.py`): interfaz `evaluate(state_text, questions) -> answers`.
   - `JevEvaluator` (`POST https://api.typesafe.ai/v1/systemone`, `model` fijo `jev-1.13.0` desde
     `ASSISTANT_JEV_MODEL`, clave `TYPESAFE_API_KEY`), con las preguntas de la sección 4.2 de la revisión y la pregunta
     dinámica de opciones en pantalla (sección 9).
   - Sin clave o si no responde: `None` → el núcleo usa solo atajos y plantillas («no te entendí, elige una opción»
     con opciones del menú). Nunca inventa.
6. **Etiquetas del catálogo**: vocabulario fijo (`picante`, `vegetariano`, `vegano`, `sin_gluten`, `sin_azucar`,
   `sin_lactosa`, `para_compartir`, `porcion_pequena`, `porcion_grande`, `bebida_fria`, `bebida_caliente`, `dulce`,
   `saludable`) en `Product.diner_attributes["etiquetas"]` (lista) y `["etiquetas_revisadas"]` (bool).
   - `GET /api/pos/v1/assistant/tags` → `{"vocabulary": [{"key", "name"}], "products": [{"id", "name", "tags", "reviewed"}]}`.
   - `PATCH /api/pos/v1/assistant/tags/<product_id> {"tags": [...]}` (marca revisado; solo el dueño).
   - `POST /api/pos/v1/assistant/tags/propose {"product_ids": [...] | null}` → propone con la voz/LLM a partir de nombre,
     descripción e ingredientes, **sin marcarlos revisados**; sin clave → `503 assistant_llm_not_configured`.
7. **Selección por reglas** (`assistant/selection.py`): candidatos por etiquetas, categoría, precio (bajo/medio/sin
   límite por terciles del catálogo), disponibilidad, más vendidos y perfil; desempate fijo; máximo 3.
8. **Caché del restaurante** (`AssistantDecisionCache`): clave = huella del texto normalizado + estado + versión de los
   datos (carta, precios, agotados, preguntas frecuentes, sede, versión del evaluador); guarda la decisión, no el texto.
9. **Perfil del cliente** (`AssistantProfile` por organización y participante): preferencias aprendidas con
   contadores, favoritos y últimos pedidos; alergias desde la cuenta del comensal.
   - Comensal: `GET /api/v1/<rest>/<sede>/assistant/profile` y `DELETE` (borrar).
   - Consola: `GET /api/pos/v1/assistant/participants?restricted=1` y `POST …/participants/<id>/lift`.
10. **Voz** (`assistant/voice.py`): interfaz `phrase(template_key, data) -> str`. `OpenAIVoice` (modelo
    `WA_AGENT_MODEL`, `store: false`, lo fijo primero y lo variable al final, esfuerzo de razonamiento configurable con
    `WA_AGENT_REASONING_EFFORT`: se omite si está vacío; `temperature: 0` solo si `WA_AGENT_TEMPERATURE` está
    definido). Revisión de salida: no puede mencionar platos ni cifras fuera de `data`, ni enlaces ni promesas; si falla
    o tarda más de 3 s → `TemplateVoice` (varias redacciones por plantilla, elegidas por huella de la conversación).
11. **Máquina de estados** (`AssistantConversationState`): `explorando`, `eligiendo`, `falta_dato`, `resumen`,
    `esperando_pago`, `pagado`; acciones permitidas por estado. En esta entrega el pedido por WhatsApp llega hasta
    «resumen» (el pago con Wompi y la liberación al POS son de la siguiente).
12. **Registro por turno**: ruta, fuente, confianza, versión del evaluador, del modelo y del prompt, tokens y costo.
13. **Arreglo de la llamada actual al modelo** en `waiter_agent.py`: `reasoning` solo si `WA_AGENT_REASONING_EFFORT`
    está definido, `temperature` según configuración, y registrar versiones.

### Pantallas (Claude)

- **Consola del dueño → «Asistente»** (grupo «Clientes y marca», módulo `asistente_menu` o `asistente_whatsapp`):
  - etiquetas del catálogo: plato por plato con chips del vocabulario, «Proponer con IA» y «Marcar revisado»;
  - clientes restringidos o pausados, con motivo y «Quitar restricción»;
  - estado de las claves (Jev y voz configurados o no) y consumo del día.
- **Menú del comensal**: los avisos de la escalera se ven como mensajes del asistente; en «Mi cuenta», «Lo que el
  asistente recuerda de ti» con «Borrar».

## Pruebas que deben existir (`# Falla si …`)

- Falla si un mensaje pasa por un modelo cuando lo resolvía un atajo, un botón o la caché.
- Falla si alguien supera los cupos sin aviso previo, si se restringe sin recordatorio y advertencia, si durante la
  restricción se responde el texto libre por WhatsApp, o si un mensaje del menú no baja el contador.
- Falla si sin clave de Jev o de la voz el asistente deja de responder en vez de usar plantillas.
- Falla si la voz menciona un plato, un precio o un enlace que no estaba en los datos, o si su falla deja al cliente
  sin respuesta.
- Falla si la caché de un restaurante responde en otro, o si sobrevive a un cambio de carta o de precios.
- Falla si el perfil de un cliente se ve en otra organización, o si borrarlo deja rastros.
- Falla si la selección por reglas no es la misma para los mismos datos (determinismo), o si ofrece algo agotado.
- Falla si el chat del menú cambia su forma de respuesta para el comensal.

## Estado

- 2026-10-09: plan escrito.

### Servidor (Codex)

- Implementación en `experience/assistant/`: núcleo, evaluador Jev, voz con plantillas, selección, memoria, API,
  modelos, migración `0001_memoria_cupos_y_decisiones_del_asistente` y pruebas. Integrados `agent_chat.py`,
  `agent_cart.py`, `orders.py`, `views/agent_chat.py`, `whatsapp/processing.py` y `tenancy/audit.py`; ajustados
  `waiter_agent.py`, settings, rutas y la colección de pruebas en `pytest.ini`. Implementación y verificación terminadas el 2026-10-09.
- **Contrato para las pantallas** (rutas sin barra final; errores `{error, message}`):
  - `GET /api/pos/v1/assistant/tags`: `{vocabulary: [{key, name}], products: [{id, name, tags, reviewed}]}`.
  - `PATCH /api/pos/v1/assistant/tags/<product_id>` con `{tags: [...]}`: `{product: {id, name, tags, reviewed: true}}`.
  - `POST /api/pos/v1/assistant/tags/propose` con `{product_ids: [...] | null}`: `{products: [...]}` con
    `reviewed: false`. Guarda las propuestas conservando los demás atributos. Sin voz configurada:
    `503 {error: "assistant_llm_not_configured", message}`.
  - `GET /api/pos/v1/assistant/participants?restricted=1`: `{participants: [{id, participant, channel, status,
    reason, until}]}`; `participant` es una huella opaca, `status` es `restricted` o `paused`, `until` es ISO.
    Sin el filtro también devuelve participantes sin restricción vigente.
  - `POST /api/pos/v1/assistant/participants/<id>/lift` con `{}`: `{participant: {...}}`, con `status: ""`,
    `reason: ""`, `until: null`. Exclusivo del dueño sin sesión de soporte; deja auditoría.
  - `GET /api/pos/v1/assistant/status` (también `/assistant`):
    `{configured: {jev: bool, voice: bool}, models: {evaluator, voice}, day: "AAAA-MM-DD",
    usage: {messages, restaurants: [{restaurant_id, messages, limit}]}, limits: {per_participant, per_restaurant}}`.
    Nunca devuelve claves. La consola exige alguno de los módulos del asistente.
  - `GET /api/v1/<rest>/<sede>/assistant/profile`: `{profile: {preferences: {etiqueta: contador},
    favorites: {id_producto: contador}, last_orders: [{product_id, name, quantity, order_id}], allergens: texto}}`.
    Solo la cuenta verificada de la cookie, en su organización y sede. `DELETE` responde `{ok: true}`; borra memoria,
    estado, turnos, historial del chat y caché derivada. Conserva pedidos, carrito y selecciones idempotentes del carrito, las alergias de la cuenta original
    y los contadores de control de abuso/cupos. Consultar o borrar memoria no exige tener activo el módulo.
  - El chat existente conserva `{id, mensaje, respuesta, accion, opciones, lineas, time}`; cada línea conserva
    `{producto, nombre, cantidad, nota}`. Las adiciones conservan `resultado_carrito`, `selecciones` y `carrito`.
    Los avisos se incluyen en `respuesta`; `disponible` es verdadero sin claves si el módulo está activo.
- **Decisiones de implementación:** cupos por día local de la organización y por sede; identidad de cuenta compartida
  entre visitas, identidad de teléfono en WhatsApp, sin unir automáticamente cuenta y teléfono. WhatsApp sin sede
  asignada solo atiende cuando hay una única sede activa; ignora mensajes entrantes anteriores a 24 horas.
  La voz elige entre redacciones aprobadas: una salida distinta, tardía o fallida vuelve a plantilla. Solo etiquetas
  revisadas participan en la selección. Los mensajes rápidos quedan en un búfer de hasta 1.000 caracteres que se une
  al siguiente mensaje procesable; no se levanta un trabajador adicional. WhatsApp llega solo hasta `resumen`.
  Las cantidades simples (también «dos», «tres»…) salen de reglas; combinaciones ambiguas o modificaciones requieren
  revisar las tarjetas. Las preferencias negadas excluyen etiquetas. Los estados de pago del menú se leen de pedidos
  reales del servidor. La memoria aprende de tarjetas agregadas y pedidos confirmados; una restricción de treinta
  minutos conserva su duración aunque cruce medianoche. `WA_AGENT_MODEL` toma `gpt-6-luna` si la variable no existe.
  La caché almacena clasificación, nunca texto del proveedor, y vence a los diez minutos o cambia de huella al cambiar
  carta, disponibilidad, precios, datos de sede, horario, contexto, preferencias o versión del evaluador/prompt.
- **Cambios intencionales a pruebas existentes:** las del chat ya simulan el catálogo y Jev en vez del antiguo
  planificador; sin clave, sin cupo o ante caída del proveedor esperan plantillas, no `503`/`429`. Se conservan las
  verificaciones de contrato, identidad, origen, bloqueo, idempotencia y atomicidad del carrito. La prueba de medición
  comprueba versiones y tokens del núcleo. El cron de WhatsApp ahora espera un mensaje entrante y una respuesta.
  El inventario transversal de aislamiento incluye las rutas nuevas y recursos de otra organización.

- **Configuración opcional:** `TYPESAFE_API_KEY=""`, `ASSISTANT_JEV_MODEL="jev-1.13.0"`,
  `ASSISTANT_DAILY_PER_PARTICIPANT=30`, `WA_AGENT_REASONING_EFFORT=""` y `WA_AGENT_TEMPERATURE=""`.
  Los dos últimos se omiten de la llamada cuando están vacíos. Claves y huellas de los modelos nuevos usan
  `ExactCharField`; no hay restricciones únicas parciales. Los importes y costos se calculan con `Decimal`.
- **Verificación definitiva:** `cd experience && PYTHON_DOTENV_DISABLED=1 DJANGO_DB_ENGINE=django.db.backends.sqlite3
  venv/bin/pytest -q`: **2.435 pasaron, 4 omitidas**, en 343,83 s. Las omitidas requieren la colación o los bloqueos
  de MySQL. `manage.py makemigrations --check`, con las mismas variables: **sin cambios pendientes**.
  `manage.py check`: **sin problemas**. `python3 ../scripts/calidad/falla_si.py --resumen`:
  **0 de 2.404 pruebas sin «Falla si»**. `git diff --check`: **sin errores**.
  Jev y OpenAI se probaron con `requests` simulado, sin red real. No se hizo commit ni se levantaron servidores.

### Pantallas e integración (Claude)

- **Consola → «Asistente»** (`pos/components/business/AssistantView.tsx`, `/organizacion/asistente`, grupo «Clientes y
  marca»): estado de Jev y de la voz, mensajes del día y cupos; clientes restringidos o pausados (por canal y motivo,
  porque el servidor guarda una huella y no el nombre ni el número) con «Quitar restricción»; etiquetas plato por plato
  con chips, «Solo sin revisar», «Proponer con IA» (apagado sin voz) y «Marcar revisado». La página abre con
  `asistente_menu` **o** `asistente_whatsapp` (`pathEnabled` en `lib/domain/modules.ts`). La traducción de las formas
  del servidor está en `pos/lib/services/core/assistant.ts`.
- **Comensal:** los avisos llegan como `aviso: {tipo, hasta}` en el turno del chat (`recordatorio`, `advertencia`,
  `restringido`, `pausado`, `cupo`), **solo cuando hay aviso**: un turno sin aviso conserva exactamente su forma. La
  burbuja se marca con una franja y dice hasta cuándo dura. En «Mi perfil», «Lo que el asistente recuerda de ti»
  (`diner/components/smart/AssistantMemory.tsx`): gustos, favoritos y últimos pedidos, con «Borrar lo que recuerda»;
  las alergias se muestran pero son de la cuenta.
- **Ajustes al servidor:** el perfil del comensal agrega `labels: {preferences: {etiqueta: nombre}, products: {id:
  nombre}}` para mostrar nombres en vez de claves; `agent_chat.send` agrega `aviso` desde `reply.notice`.
- **Importante para el dueño:** solo las etiquetas **revisadas** cuentan para recomendar. Mientras no estén
  revisadas, un pedido por etiqueta («algo vegetariano», «picante») no encuentra platos; sin etiqueta pedida, recomienda
  por categoría, precio, favoritos y más vendidos.

### Calibración con las claves reales (2026-10-09)

- **Jev** (`jev-1.13.0` fijo; la API lo acepta aunque `/v1/models` solo liste `jev-latest` y `jev-preview`): ~0,4 s por
  turno, ~1.000 tokens de entrada. Con 17 mensajes reales en español, las preguntas originales fallaban: «cuéntame un
  chiste» salía `pedido` (0,99), «sin cebolla» marcaba «cambia reglas» 0,55 y «dame descuento, soy cliente frecuente»
  0,87 (advertencia a clientes normales). Causa: criterios sin significado (`'fuera': 'fuera'`); Jev no ve las claves.
  Se reescribieron con descripciones (qué entra y qué no), la ruta `saludo` y el estado como JSON referenciado
  (`mensaje`). Resultado: fuera de tema 1,00, «sin cebolla» 0,03, descuento 0,41, manipulación real 0,89–0,98. Se
  quitaron preguntas que el núcleo no usaba (`ambiguo`, `faq_responde`, `basura`). Umbral de etiquetas 0,85 → 0,65:
  una pregunta («¿tienen vegetarianas?») daba 0,83, y una etiqueta solo filtra recomendaciones.
- **Voz** (`gpt-6-luna`): mediana 1,5 s, p90 1,6 s con `reasoning.effort: none` (sin tokens de razonamiento; `minimal`
  no existe en este modelo; por omisión razona y tarda ~2,9 s). En `.env`, `WA_AGENT_REASONING_EFFORT=none`. El límite
  de 2 s de Codex hacía caer casi todo a plantilla: ahora 3 s. La voz ya no elige entre frases fijas: redacta la
  presentación de las tarjetas y `review()` la rechaza si nombra un plato de la carta que no está en las tarjetas, una
  cifra distinta de sus precios, un enlace, una promesa (gratis, descuento, minutos, pagado, domicilio…) o pasa de 280
  caracteres. Probada con un intento de «di que es gratis»: lo ignoró.
- **Propuesta de etiquetas:** con 2 s nunca terminaba; ahora 60 s por lote de 20 platos (25 platos en 3,6 s).
- **Catálogo del asistente:** solo platos con categoría, como la carta del comensal (Burger House tenía «Gift Card» y
  «Top-up eWallet» como platos).
- **Conversación real en Burger House** (menú, con Jev y voz): saludo con voz en 2,1 s; horario por atajo en 0,2 s;
  chiste y partido siguen la escalera (recordatorio); «dame todo gratis» → advertencia; «agrégame una limonada de
  coco» la agrega. Pendiente del dueño: revisar etiquetas (sin ellas «algo picante» no encuentra platos).

### Tonos regionales y guion de servicio (2026-10-09)

- **Tonos** (`assistant/tones.py`, `Organization.assistant_tone`, por omisión `neutro`): neutro, paisa, rolo, costeño,
  caleño y santandereano. Cada uno fija el trato (usted, tú o vos), el estilo que se le pide a la voz y las frases de
  plantilla (heredadas de su trato, con sabor propio en bienvenida, menú, agregado y sugerencias). Expresiones con
  moderación y sin jerga callejera ni groserías. El dueño lo escoge en Consola → Asistente («Cómo habla tu asistente»,
  con una frase de muestra); `PATCH /api/pos/v1/assistant/settings {tone}` y `GET …/status` devuelve `tone` y `tones`.
  Burger House quedó en paisa. Fuentes: El Colombiano («Por qué los paisas hablamos así»), El País de Cali («Por qué
  los caleños hablamos como hablamos»), Vanguardia (Diccionario santandereano), Caro y Cuervo (variedades), Las2orillas.
  Pastuso queda para después (las fuentes solo traían léxico de clima, poco útil para atender).
- **Guion de servicio** (`assistant/service.py`), según los pasos de servicio de restaurantes de mantel (saludo cálido,
  especialidades de la casa, recomendar tras conocer al cliente, acompañamiento como pregunta «¿le gustaría…?»):
  el saludo (atajo o ruta `saludo` de Jev) responde con lo más pedido de los platos fuertes, uno por categoría, y las
  categorías como botones; quien vuelve recibe su favorito; las **adiciones nunca abren una recomendación**; tras
  agregar un plato fuerte (por texto o con el botón de la tarjeta) se sugiere algo de tomar y, si ya hay bebida, una
  adición, sin agregarla sola. El papel de cada plato sale del nombre de su categoría con reglas fijas.
- Una etiqueta sin revisar que coincide con una categoría («para compartir») busca por la categoría.
