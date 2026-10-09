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
