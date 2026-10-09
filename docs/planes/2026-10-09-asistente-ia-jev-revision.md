# Asistente de IA de Waiter con Jev: revisión de la integración y cómo hacerlo más determinista

**Fecha:** 2026-10-09 · **Revisa:** la sección 6 y la 7.3 del documento 230 del gestor documental («Waiter —
Integraciones pendientes y asistente de IA de atención») y el código actual del asistente
(`experience/experience_app/services/waiter_agent.py`, `agent_chat.py`, `prompts/waiter_v1.txt`).
**Fuentes de Jev consultadas el 2026-10-09:** [modelos](https://docs.typesafe.ai/models),
[inicio rápido](https://docs.typesafe.ai/introduction/quickstart), [confianza](https://docs.typesafe.ai/confidence),
[patrones](https://docs.typesafe.ai/patterns) y [primitivas](https://docs.typesafe.ai/primitives).

---

## 1. Veredicto

La arquitectura del documento 230 es **correcta en lo esencial**, y vale la pena mantenerla:
- Jev clasifica y valida; un LLM interpreta el lenguaje natural; el **servidor decide y calcula**.
- Banco de preguntas frecuentes aprobado por el dueño.
- Confirmación por versión del carrito; pago verificado antes de mandar a cocina.

Hay que corregir algunos datos sobre Jev, ajustar dos supuestos técnicos y, sobre todo, agregar una **capa
determinista** delante del modelo. Hoy el asistente depende casi por completo del LLM, y eso lo hace impredecible en
los casos más comunes.

---

## 2. Verificación de lo que dice el documento 230 sobre Jev

| Afirmación del documento | Qué dice la documentación de TypeSafe | Estado |
|---|---|---|
| Jev 1.13, id `jev-1.13.0`, de TypeSafe AI | «Jev 1.13», id `jev-1.13.0` | ✅ Correcto |
| No escribe texto: devuelve decisiones tipadas con probabilidades | Tres tipos de pregunta: **choice** (elegir una opción), **score** (puntaje sobre una rúbrica) y **noul** (probabilidad de que un enunciado sea verdadero). Choice y score traen `confidence`; noul trae un número de 0 a 1 | ✅ Correcto, con precisión: «sí o no» es **noul** y **no trae** `confidence` |
| Recibe solo texto | «Text only… No image, audio, or video input» | ✅ Correcto |
| Mejor en inglés: probar en español colombiano | «English is the primary training language… [otros idiomas] not equally well» | ✅ Correcto, y es el riesgo principal |
| Precio (documento 231): USD 0,042 por millón de tokens de entrada, salida gratis | «$0.042» por millón; «Output tokens are free» | ✅ Correcto |
| Responde en 70 a 500 ms | La página de modelos **no lo publica** | ⚠️ Sin verificar: se mide en la prueba técnica (sección 7) |
| Se pueden hacer varias preguntas separadas sobre el mismo mensaje | «All three question types can be mixed in a single API call»; cada una se evalúa «in parallel and in isolation»; agregar preguntas «barely changes the response time» | ✅ Correcto, y es la base del diseño (sección 4) |
| Umbrales de confianza calibrados con ejemplos reales | Recomiendan tres franjas (alta: actuar; media: confirmar; baja: no actuar) y umbrales que «scale with risk» | ✅ Correcto. TypeSafe **no dice** que la confianza esté calibrada: hay que calibrarla nosotros |
| No es de código abierto | Modelo propietario, solo por API | ✅ Correcto |
| Privacidad | «Jev is not trained on customer requests or responses»; **retención cero solo para clientes empresariales** | ⚠️ Agregar al documento: sin plan empresarial, los mensajes podrían quedar retenidos por TypeSafe; hay que preguntarlo (sección 7.2 del 230) |
| — | **Determinismo:** la documentación no habla de temperatura ni garantiza la misma salida para la misma entrada | ⚠️ Falta en el documento: no se puede asumir; ver sección 5 |

**Cómo se llama a Jev** (para el código):

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <TYPESAFE_API_KEY>

{
  "model": "jev-1.13.0",
  "state": "<el mensaje y el contexto mínimo>",
  "questions": {
    "ruta":       {"type": "choice", "instructions": "…", "criteria": {"pedido": "…", "negocio": "…", "fuera": "…"}},
    "ambiguo":    {"type": "noul",   "instructions": "El mensaje se refiere a un producto que no se puede identificar"},
    "frustracion":{"type": "score",  "instructions": "…", "criteria": ["Tranquilo", "Molesto", "Muy molesto"]}
  }
}
```

La respuesta trae, por pregunta, el valor (`choice`, `score` o `noul`), las `probabilities` y la `confidence`.
**Se fija la versión** (`jev-1.13.0`) y no `jev-latest`, como usa el ejemplo oficial. Así, un cambio de modelo del
proveedor no cambia el comportamiento sin pasar por nuestras pruebas.

---

## 3. Lo que hay que corregir o agregar al diseño

1. **El parámetro `reasoning` de la llamada a OpenAI.**
   - El código manda `reasoning: {effort: 'none'}`, que solo aceptan los modelos con razonamiento.
   - El documento 230 propone **GPT-4.1 mini**, que no razona, y es probable que OpenAI rechace la llamada con ese
     parámetro (sin verificar: no hay clave configurada todavía).
   - **Arreglo:** mandar `reasoning` solo si el modelo lo admite (lista en la configuración), y agregar una prueba
     de humo al arrancar que haga una llamada mínima y avise si falla.
2. **Temperatura y muestreo.** El código no fija `temperature`. Para un modelo sin razonamiento, va `temperature: 0`
   (sección 5). Los modelos con razonamiento no la admiten; ahí la variación se controla con el esquema estricto y
   con menos libertad de redacción.
3. **Fijar la versión del modelo.** `WA_AGENT_MODEL` debe apuntar a una versión fechada del modelo (por ejemplo
   `gpt-4.1-mini-AAAA-MM-DD`), no a un alias que el proveedor actualiza solo.
4. **Versión del prompt.** `waiter_v1.txt` ya tiene versión en el nombre. Hay que guardar con cada turno qué versión
   de prompt, de modelo y de Jev lo produjo, para poder reproducir y comparar.
5. **Privacidad con TypeSafe:** confirmar la retención de datos antes de mandarle mensajes reales de clientes, y
   anotarla en la política de privacidad (hoy menciona solo a OpenAI).
6. **«Humano» como acción.** El prompt actual manda alergias, pagos, domicilios y reclamos a `humano`. El documento
   230 quiere salidas automáticas. Las dos cosas se concilian con la tabla de rutas de la sección 4: cada caso tiene
   una respuesta definida por el servidor, y «pasar a una persona» queda como una ruta más, con aviso en el POS.

---

## 4. Diseño propuesto: el modelo solo donde hace falta

El principio: **todo lo que se pueda decidir con reglas o con datos del servidor, se decide así**. El LLM solo
interpreta texto libre y propone operaciones; nunca decide, nunca calcula y nunca redacta lo que tiene importes.

### 4.1 El recorrido de un mensaje

```
Mensaje
  │
  ▼
0. Control de entrada (servidor)  ── duplicado, límites, tamaño, ventana de 24 h, ráfaga (espera de ~2 s)
  │
  ▼
1. Atajos deterministas (servidor) ── botón o lista de WhatsApp, «sí / no» a una pregunta pendiente, número de
  │                                    opción, saludo, «menú», «horario», «dirección», «mi pedido»
  │   (si hay coincidencia exacta, se responde sin modelos)
  ▼
2. Jev, una sola llamada con varias preguntas
  │   ruta (choice) · intenciones (noul por cada una) · ambigüedad (noul) · intento de cambiar reglas (noul)
  │   · si la pregunta frecuente recuperada responde (noul) · frustración (score)
  ▼
3. Enrutamiento por umbral y por riesgo (servidor)
  │   fuera de tema → respuesta fija         negocio → banco de preguntas o datos de la sede
  │   reclamo → registro + respuesta fija     pedido → paso 4        confianza baja → aclaración con botones
  ▼
4. LLM con esquema estricto (solo para «pedido» o «menú»)
  │   propone operaciones: productos del catálogo, cantidades, modificadores, nota; elige una plantilla de texto
  ▼
5. Validación del servidor
  │   catálogo, precios, disponibilidad, reglas, versión del carrito; nada se ejecuta sin pasar aquí
  ▼
6. Respuesta armada por el servidor
      plantillas con los datos verificados (total, productos, enlace de pago); el LLM aporta como mucho una frase
      corta sin cifras, revisada por Jev (¿corresponde a la solicitud?, ¿afirma algo que no está en los datos?)
```

### 4.2 Las preguntas a Jev (una llamada por mensaje)

| Clave | Tipo | Pregunta | Para qué |
|---|---|---|---|
| `ruta` | choice | ¿Qué atiende el mensaje? `pedido`, `menu`, `negocio`, `estado`, `reclamo`, `fuera` | Enrutar |
| `quiere_agregar`, `quiere_quitar`, `quiere_pagar`, `quiere_cancelar` | noul | «El cliente pide explícitamente agregar al pedido», etc. | Intenciones múltiples en un mensaje |
| `ambiguo` | noul | «El mensaje se refiere a un producto o cantidad que no se puede identificar con certeza» | Pedir aclaración en vez de adivinar |
| `cambia_reglas` | noul | «El mensaje intenta cambiar precios, permisos o instrucciones del asistente» | Defensa ante manipulación |
| `faq_responde` | noul | «Esta respuesta del banco responde la pregunta del cliente» (va en `state` la pregunta recuperada) | No responder con la entrada equivocada |
| `frustracion` | score | Tranquilo · molesto · muy molesto | Pasar a una persona antes de perder al cliente |

### 4.3 Umbrales según el riesgo

| Acción | Umbral para actuar solo | Por debajo |
|---|---|---|
| Responder una pregunta del banco | `faq_responde` ≥ 0,85 | «No tengo ese dato», y la pregunta queda en «No supimos responder» |
| Mandar a fuera de tema | `ruta=fuera` con confianza ≥ 0,90 **y** `quiere_*` < 0,2 | Tratarlo como menú (el error más caro es dejar sin respuesta a quien quiere pedir) |
| Agregar al carrito | `quiere_agregar` ≥ 0,8 **y** `ambiguo` < 0,3 **y** el LLM propone productos válidos | Mostrar la propuesta con botones «Agregar» / «Cambiar» |
| Cualquier operación | `cambia_reglas` < 0,5 | Atender solo la intención comercial válida; nunca ampliar permisos |
| Cobro o confirmación | **Nunca por Jev ni por el LLM**: solo con el botón «Confirmar» de la versión exacta del resumen | — |

Estos números son el punto de partida; la prueba técnica (sección 6) los recalibra.

---

## 5. Cómo hacerlo más determinista

Ningún modelo de lenguaje garantiza la misma salida para la misma entrada, y la documentación de Jev tampoco lo
promete. El determinismo se construye alrededor, en este orden de impacto:

1. **Menos texto libre, más opciones.**
   - En WhatsApp: listas (hasta 10 opciones) y botones (hasta 3) para elegir categoría, plato, variante, cantidad y
     confirmar.
   - En el menú: tarjetas con botón «Agregar».
   - Cada toque es una entrada exacta que no pasa por ningún modelo.
2. **Atajos deterministas antes de los modelos** (paso 1):
   - respuestas a la pregunta pendiente (`sí`, `no`, `la 2`);
   - palabras clave del negocio (horario, dirección, domicilio, menú);
   - coincidencia exacta o casi exacta de nombres de platos contra el catálogo (sin tildes, plural y singular,
     errores de una letra).
3. **Máquina de estados de la conversación.**
   - El servidor sabe en qué paso está cada conversación: explorando, armando, falta dato, resumen mostrado,
     esperando pago, pagado.
   - En cada estado solo se permiten ciertas acciones; el modelo no puede saltar pasos.
   - Por ejemplo, en «resumen mostrado» el único camino a cocina es el botón «Confirmar».
4. **El servidor redacta lo importante.**
   - Totales, listas de productos, confirmaciones, enlaces de pago y errores salen de **plantillas** con datos
     verificados.
   - El LLM elige qué plantilla usar y, como mucho, aporta una frase corta sin cifras.
5. **Salida estricta del LLM.**
   - Esquema JSON estricto con enumeraciones (ya existe).
   - `temperature: 0` en modelos sin razonamiento.
   - Versión del modelo fijada.
   - Catálogo preseleccionado: solo los 20 a 40 productos relevantes por categoría o similitud, no los 200.
   - Ejemplos fijos en el prompt para los casos frecuentes.
6. **Versiones fijas y registradas.**
   - Versión de Jev (`jev-1.13.0`), del modelo del LLM y del prompt.
   - Se guardan con cada turno, junto con la ruta, la confianza y la decisión del servidor.
7. **Caché de decisiones.**
   - Mismo mensaje normalizado + mismo estado + mismas versiones → misma decisión de Jev (caché por huella, con
     vencimiento corto).
   - En la práctica, las preguntas repetidas («¿tienen domicilio?») responden igual siempre.
8. **Pruebas de regresión con conversaciones grabadas.**
   - Un conjunto fijo de mensajes y conversaciones con la respuesta esperada (ruta y operaciones, no el texto
     exacto).
   - Se corre en cada cambio de prompt, de modelo o de versión de Jev; un cambio que baje la exactitud no se publica.
   - En las pruebas automáticas, las respuestas de Jev y del LLM se graban y se reproducen, para que la suite sea
     determinista y no gaste.
9. **Corrección acotada.** Si la validación del servidor o la revisión de Jev rechazan una propuesta, se permite
   **un** reintento. Si vuelve a fallar, se pasa a la selección guiada con botones. Nunca hay bucles.

---

## 6. Prueba técnica (actualiza la 7.3 del documento 230)

1. **Conjunto de prueba:** 300 mensajes reales de 2 o 3 restaurantes, anonimizados y etiquetados a mano con la ruta y
   las intenciones, más 10 conversaciones completas de pedido.
2. **Comparación:** Jev (`jev-1.13.0`) frente al LLM devolviendo la ruta como un campo, sobre los mismos mensajes.
3. **Medidas:**
   - aciertos por ruta;
   - **pedidos marcados como fuera de tema** (el error más caro; meta < 2 %);
   - latencia p50 y p95 (meta < 500 ms en Jev);
   - costo por mensaje;
   - **estabilidad**: correr cada mensaje 5 veces y contar cuántos cambian de ruta (meta 0 % con caché, < 1 % sin
     caché).
4. **Calibración:** con los resultados se fijan los umbrales de la sección 4.3, por acción.
5. **Español colombiano:** incluir errores de ortografía, abreviaturas («x fa», «q»), audios transcritos y expresiones
   locales («regáleme», «me pone»).

---

## 7. Qué construir y en qué orden

1. **Arreglar y medir lo actual:** el parámetro `reasoning` según el modelo, `temperature: 0`, versión fijada,
   prueba de humo al arrancar y registro de versiones por turno.
2. **Atajos deterministas y máquina de estados** en el núcleo de conversación (`agent_chat`), comunes al menú y a
   WhatsApp.
3. **Interfaz del evaluador** con implementación Jev, caché por huella, registro de ruta y confianza, y comportamiento
   definido si no responde (pausar acciones que dependen de él; solo avisos preaprobados).
4. **Banco de preguntas frecuentes** con búsqueda por similitud y la revisión `faq_responde`.
5. **Plantillas de respuesta del servidor** y la frase corta del LLM revisada por Jev.
6. **Conjunto de prueba y suite de regresión** con grabación y reproducción.
7. **WhatsApp** con listas y botones sobre la misma máquina de estados (después de la verificación de Meta).

## 8. Decisiones que necesitamos del dueño

- ¿Plan empresarial de TypeSafe (retención cero) o aceptar su retención estándar? Afecta la política de privacidad.
- ¿Modelo del LLM? GPT-4.1 mini (sin razonamiento, admite temperatura 0) es lo más predecible y barato; un modelo con
  razonamiento entiende mejor, pero varía más y cuesta más. Se decide con la prueba técnica.
- ¿Cuántas acciones queremos que el asistente haga sin confirmación? La propuesta: **ninguna que cambie dinero o la
  cocina**; agregar al carrito sí, con umbral alto y botón de deshacer.

---

## 9. Modelo híbrido: botones y texto libre

La persona puede escribir lo que quiera en cualquier momento; los botones son atajos, no una jaula. En cada turno el
servidor conoce lo que hay en pantalla (botones, tarjetas, pregunta pendiente) y decide el camino:

1. **Coincidencia exacta sin modelos:** toque de botón, «sí / no / la 2» a la pregunta pendiente, nombre de un plato del
   catálogo aunque tenga errores de escritura.
2. **Jev con opciones dinámicas:** una pregunta `choice` cuyas opciones son **los botones y tarjetas actuales** más las
   salidas fijas (`faq`, `libre`, `fuera`). «Dame la de maracuyá» elige la tarjeta con confianza alta y se ejecuta como
   el botón; con confianza media se pregunta «¿Te refieres a…?» con botones.
3. **LLM solo para `libre`:** deseos abiertos y recomendaciones. Su salida **vuelve a ser tarjetas con botones**; nada
   pasa al carrito sin un toque o una orden explícita confirmada por Jev.

---

## 10. Referencias: quién ya hace esto y qué copiamos

Lo que tienen en común los sistemas que funcionan en producción: **el modelo entiende, pero no manda**. La lógica del
negocio es determinista y el modelo solo traduce lenguaje natural a órdenes que esa lógica sabe ejecutar.

| Referencia | Qué hace | Qué copiamos para Waiter |
|---|---|---|
| **Rasa CALM** (código abierto) | El LLM traduce cada mensaje en **comandos** internos y un gestor de diálogo ejecuta **flujos deterministas**. Trae «patrones de reparación» para correcciones, digresiones, aclaraciones y cancelaciones | Nuestro LLM devuelve **comandos** (`agregar`, `quitar`, `cambiar`, `preguntar`, `recomendar`, `estado`) y la máquina de estados los ejecuta. Los patrones de reparación («no, mejor la otra», «olvídalo», «espera, ¿cuánto vale?») son flujos fijos, no improvisación |
| **NVIDIA NeMo Guardrails** (código abierto) | **Flujos de diálogo deterministas** para los caminos más comunes y lo generativo para el resto; «formas canónicas» que resumen la intención de un mensaje | Los caminos frecuentes (horario, domicilio, ver menú, repetir pedido, estado) no pasan por el LLM. El banco de preguntas guarda variantes de cada pregunta, como sus formas canónicas |
| **Semantic Router** (Aurelio, código abierto) | Enruta por similitud de significado contra frases de ejemplo, en unos milisegundos y **sin llamar a un LLM**, con umbral configurable | Primera capa barata antes de Jev: si un mensaje se parece mucho a una frase de ejemplo de una ruta, se resuelve ahí. Jev queda para lo dudoso y para las preguntas que necesitan contexto |
| **Parlant** (código abierto) | **Respuestas preparadas** con campos dinámicos y un **modo estricto** para los momentos críticos; directrices con condición y acción; verificación de que la salida respeta las reglas | Totales, confirmaciones, enlaces de pago y errores salen de **plantillas con datos del servidor** (modo estricto). Para que no suene robótico, cada plantilla tiene **varias redacciones aprobadas** y se elige una de forma determinista |
| **Sierra** (comercial) | **Supervisores** que revisan la entrada y la salida del agente principal; **simulación de conversaciones** para probar a escala; métrica **pass^k** (resolver la misma tarea en las *k* repeticiones) | Jev como supervisor de entrada y de salida. Batería de **clientes simulados** (con un LLM jugando al cliente) y **pass^k** como medida de determinismo: misma conversación corrida *k* veces, mismo resultado |
| **τ-bench** (Sierra, investigación) | Agentes de atención con herramientas: aun los mejores fallaron más de la mitad de las tareas y fueron **inconsistentes** (pass^8 < 25 % en comercio) cuando el LLM decidía todo | Confirma el enfoque: no dejarle al LLM la secuencia de pasos ni las acciones; medir consistencia, no solo aciertos |
| **Wendy's FreshAI** (Google) | Pedido por voz con el menú, reglas de negocio y guardarraíles, conectado al POS. **86 %** de pedidos sin intervención del personal y **~99 %** si se cuenta con que una persona corrija | Siempre hay un camino para que el personal tome la conversación desde el POS. Medimos las dos cifras: resuelto solo y resuelto con ayuda |
| **McDonald's con IBM** (terminado en 2024) | La precisión se quedó en el rango del **80 %** cuando la meta era **95 %**; videos virales de pedidos absurdos | No lanzar a más restaurantes sin medir la precisión con conversaciones reales (sección 6) y fijar la meta antes |
| **Taco Bell** (2025) | Un cliente pidió **18.000 vasos de agua** y el sistema lo aceptó; bucles de preguntas. Volvieron a dejar personas en la hora pico | **Límites de sentido común** en el servidor (cantidades máximas por producto y por pedido, total máximo sin confirmación), detección de bucles (la misma pregunta dos veces lleva a botones o a una persona) |

---

## 11. Determinista por dentro, natural por fuera

El cliente **no debe notar** ninguna de estas capas. Lo que lo garantiza:

- **El texto libre siempre se acepta.** Los botones aparecen como sugerencias (respuestas rápidas en WhatsApp, chips en
  el menú); nunca se le dice «elige una opción».
- **Las respuestas preparadas tienen varias redacciones** aprobadas y campos personalizados (nombre del cliente, plato,
  hora). Se elige una variante con una huella de la conversación: no se repite la misma frase dos veces seguidas, y la
  misma situación da el mismo contenido.
- **El LLM aporta la calidez** (una frase corta) donde no hay cifras; el servidor aporta la exactitud.
- **Nunca se explica el mecanismo** («estoy clasificando tu mensaje»). Si algo no se entiende, se pregunta como lo haría
  una persona: «¿Te refieres a la Limonada o al Jugo de maracuyá?».
- **Rapidez:** las capas sin modelo responden en milisegundos; Jev en cientos; el LLM solo cuando hace falta. Meta: menos
  de 2 segundos en el 90 % de los mensajes.
- **Tono fijo del restaurante** en las plantillas y en el prompt, con el saludo y el nombre del asistente que el dueño ya
  configura en la marca.

Fuentes: [Rasa CALM](https://rasa.com/docs/learn/concepts/calm/), [NeMo Guardrails](https://github.com/NVIDIA/NeMo-Guardrails),
[Semantic Router](https://docs.aurelio.ai/), [Parlant: diseño agéntico](https://parlant.io/docs/production/agentic-design),
[Sierra: agentes empresariales](https://sierra.ai/jp/blog/enterprise-grade-agents), [τ-bench](https://export.arxiv.org/pdf/2406.12045),
[Wendy's FreshAI](https://www.restaurantdive.com/news/wendys-expand-google-generative-ai-drive-thru-test/702184/),
[McDonald's termina la prueba con IBM](https://www.nrn.com/quick-service/mcdonald-s-is-ending-its-ai-drive-thru-test-with-ibm),
[Taco Bell replantea la voz con IA](https://www.computing.co.uk/news/2025/ai/taco-bell-scales-back-ai-tests-after-customer-complaints).

---

## 12. Regla central: el LLM no decide

**Por dentro todo está decidido; el LLM solo pone la voz.** El recorrido queda:

```
filtros del servidor → atajos sin modelo → Jev (oídos) → servidor (decide) → LLM (voz) → revisión → cliente
```

- **Jev son los oídos.** En una sola llamada responde preguntas pequeñas y fijas: de qué se trata el mensaje (pedido,
  menú, negocio, estado, reclamo, fuera de tema), si intenta cambiar reglas, si es basura, y las **preferencias**
  (categoría, picante, vegetariano, presupuesto, hambre, para compartir, si nombra un plato). Cuesta USD 0,042 por
  millón de tokens de entrada y la salida es gratis.
- **El servidor decide.** Filtra el catálogo con **etiquetas** y reglas (precio, disponibilidad, lo más vendido, lo que le
  gustó antes) y saca 2 o 3 candidatos. Si la persona nombra un plato, Jev elige entre los pocos parecidos que el
  servidor preseleccionó por nombre, nunca entre todo el catálogo. Cantidades y números se sacan con reglas.
- **El LLM es la voz.** Recibe solo los datos de esa respuesta (nunca el catálogo) y los dice de forma natural, por
  ejemplo «Ana, si te gusta lo picante, te van a encantar las Alitas BBQ picantes». El servidor revisa que no mencione
  platos, precios, enlaces ni promesas que no estén en los datos; si falla o tarda, se usa la plantilla.
- **El LLM como oídos de respaldo** solo cuando Jev no entiende con seguridad (pedidos muy compuestos). La meta es que
  sean pocos y medirlos.
- **Catálogo con etiquetas** (picante, vegetariano, para compartir, tamaño…): el LLM las propone una sola vez a partir de
  la descripción y los ingredientes, y el dueño las revisa en el POS. Es la primera pieza a construir.

## 13. Filtros contra el abuso y el gasto

Antes de cualquier modelo, gratis, en el servidor:

| Filtro | Regla inicial |
|---|---|
| Tamaño | Más de 1.000 caracteres: se recorta o respuesta fija |
| Ritmo | Un mensaje procesado cada 3 s; los seguidos se agrupan |
| Cupo por persona | 30 mensajes con IA por teléfono o comensal al día; después, botones y respuestas fijas |
| Cupo por restaurante | `AGENT_DAILY_LIMIT` y un tope de gasto mensual según el plan |
| Repetidos y basura | Mismo texto, solo emojis o caracteres al azar: respuesta fija |
| Caché | Misma pregunta normalizada en el mismo restaurante: misma respuesta |
| Bucles | La misma pregunta del asistente dos veces: botones o personal |

Jev decide si el mensaje es **fuera de tema** solo con confianza alta y sin ninguna intención de pedido: **ante la duda,
se trata como menú**. Fuera de tema se responde con una frase fija que lleva de vuelta al menú, sin LLM.

## 14. Avisos antes de restringir

Nunca se corta a nadie sin aviso. Escalera con plantillas fijas y tono amable:

| Paso | Cuándo | Mensaje | Efecto |
|---|---|---|---|
| 1. Recordatorio | 2 fuera de tema seguidos | «Te puedo ayudar con el menú, tus pedidos y el restaurante 😊 ¿Qué se te antoja hoy?» + botones | Ninguno |
| 2. Advertencia | 4 en 10 min, o 1 intento de cambiar precios o reglas | «Recuerda que este chat es para pedidos y preguntas del restaurante. Si seguimos fuera de tema, por un rato solo podré mostrarte el menú con botones.» | Queda anotado |
| 3. Restricción temporal | Sigue tras la advertencia | «Por los próximos 30 minutos te muestro el menú con botones…» | Solo botones 30 min, sin Jev ni LLM |
| 4. Pausa | Vuelve a pasar el mismo día | «Pausamos el asistente por hoy. Si quieres pedir, el restaurante te atiende directamente.» | Pausado hasta el día siguiente, aviso en el POS |

- Solo cuentan los mensajes que Jev marca con **confianza alta**; un mensaje del menú o un pedido **baja** el contador.
- El cupo diario también avisa antes: «Te quedan 5 mensajes con el asistente por hoy…».
- Desde el POS se ve quién está restringido y por qué, y el personal puede quitarlo con un toque.
- Avisos, restricciones y quién las quitó quedan en el historial de cambios.

## 15. Orden de construcción (reemplaza el de la sección 7)

1. Arreglar la llamada al modelo (parámetro `reasoning`, temperatura, versión fija) y registrar versiones por turno.
2. **Filtros, cupos y escalera de avisos** (sin modelos).
3. **Etiquetas del catálogo** con propuesta automática y revisión del dueño.
4. **Jev como oídos**: interfaz del evaluador, preguntas fijas, caché y comportamiento si no responde.
5. **Selección por reglas** de candidatos y comandos con máquina de estados (incluye patrones de corrección).
6. **Voz del LLM** con su revisión y plantillas de respaldo con varias redacciones.
7. Banco de preguntas frecuentes, conjunto de prueba con pass^k y WhatsApp con listas y botones.
