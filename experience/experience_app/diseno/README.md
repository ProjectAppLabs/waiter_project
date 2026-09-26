# Tema del menú v2 (Plan J2–J5 y K1)

`esquema.json` es el contrato cerrado y versionado. `services.validate` completa los valores omitidos, normaliza colores,
calcula los derivados y rechaza campos, versiones, tipos, fuentes o rangos desconocidos. No admite HTML ni CSS.
`inventario.json` relaciona fundamentos, variables CSS y los componentes compartidos de las pantallas actuales.
J3 añade variantes de componente y distribución mediante atributos `data-ds-*` en `<main>` y selectores CSS.
J4 expone el contrato por MCP y comparte los borradores con la vista previa del POS.
J5 añade la página viva del comensal, que muestra todos los componentes y variantes con el tema de la sede o de un borrador.
K1 añade la capa `componentes`: una plantilla HTML restringida por componente, validada contra su contrato.

## Contrato

```json
{
  "plantilla": "S1",
  "tema": {
    "version": 2,
    "fundamentos": {
      "densidad": 0.85,
      "texto": 1.1,
      "titulo": 1.15,
      "forma": {"tarjeta": 0, "boton": 1.5},
      "colores": {"acento": "#234567"},
      "tipografia": {"display": "DM Sans", "cuerpo": "Lato"}
    },
    "variantes": {"boton": "contorno", "categorias": "subrayado", "formaImagen": "tema"},
    "distribucion": {"carta": "lista", "ficha": "heroe", "carrito": "compacta"}
  }
}
```

Se guarda con el PUT interno ya existente: `/internal/v1/<rest>/<sede>/menu/`, con `X-Internal-Key`.
Es un reemplazo: los fundamentos, variantes y distribuciones omitidos vuelven al valor por defecto. No se mezclan `tema` y `paleta`/`tipografia`
en la misma petición. El GET interno devuelve el tema y los campos anteriores; la entrada pública lo entrega en
`contexto.plantilla.tema`, junto a `tokens` y `fuentesGoogle` resueltos para mantener compatibilidad.

| Fundamento | Rango / regla | Predeterminado |
|---|---|---|
| Densidad | 0,75–1,5; relleno de controles nunca menor al original | 1 |
| Texto | 1–1,5; cuerpo base = 14 px × factor | 1 |
| Títulos de J1 (fuente display) | 1–1,5; se multiplica también por texto | 1 |
| Forma: tarjeta, botón, chip, campo, imagen, hoja | 0–2, multiplicador del radio de J1; 0 = recto | 1 |
| Colores | 9 colores `#RRGGBB`; `acentoTinta` y `acentoSuave` calculados, de solo lectura | S1 |
| Fuentes de títulos y cuerpo | Lista cerrada del esquema; independientes | DM Sans / Mulish |

Con las variantes predeterminadas, los radios circulares de J1 (`50%`, `999px`) conservan su forma. No se convierten en cuadrados al poner un factor cero.
Los tokens `--t-radio-*` antiguos siguen presentes por compatibilidad;
los componentes smart usan los factores `--ds-forma-*`.

## Variantes y distribución

El catálogo tiene 13 campos y 36 valores, incluidos los 13 predeterminados. Cada opción tiene descripción y selector
en `inventario.json`; los componentes y pantallas declaran qué campos consumen. El servidor rechaza opciones,
campos y tipos desconocidos. El comensal solo emite atributos del catálogo cerrado de `designVariants.ts`.

| Capa y campo | Valores (predeterminado en negrita) |
|---|---|
| `variantes.boton` | **`relleno`**, `contorno`, `suave` |
| `variantes.formaBoton` | **`tema`**, `pildora`, `recta` |
| `variantes.tarjeta` | **`plana`**, `sombra`, `borde` |
| `variantes.categorias` | **`chips`**, `pestanas`, `subrayado` |
| `variantes.precio` | **`destacado`**, `normal`, `pildora` |
| `variantes.imagen` | **`actual`**, `cuadrada`, `4:3` |
| `variantes.formaImagen` | **`actual`**, `tema`, `circular` |
| `variantes.cabecera` | **`izquierda`**, `centrada` |
| `variantes.saludo` | **`visible`**, `oculto` |
| `variantes.insignia` | **`rellena`**, `contorno` |
| `distribucion.carta` | **`actual`**, `cuadricula`, `lista`, `foto-grande` |
| `distribucion.ficha` | **`actual`**, `heroe`, `dividida` |
| `distribucion.carrito` | **`tarjetas`**, `compacta` |

- `actual` conserva la presentación de J2: carruseles de carta, lista filtrada, favoritos y ficha con su geometría
  original. Las reglas de `smart-variants.css` solo se activan al elegir una opción diferente de la predeterminada.
- La forma de botón `tema` conserva el factor `fundamentos.forma.boton`; `pildora` y `recta` lo sustituyen en las
  acciones principales y secundarias. La variante de relleno afecta las acciones principales, incluido añadir desde el chat.
- Imagen `actual` conserva el recorte de cada componente/distribución. El recorte explícito se aplica a las fotos de
  plato; `circular` prevalece sobre `4:3`. Forma `tema` usa 16 px × `fundamentos.forma.imagen`, incluido cero.
- La cuadrícula tiene hasta dos columnas y pasa a una cuando el ancho o el texto ampliado lo requieren. Lista y foto
  grande mantienen filtros, favoritos y añadir. La ficha dividida muestra dos columnas desde 760 px y se apila en móvil.
- Ocultar el saludo conserva logo, sede y navegación. El carrito compacto conserva precios, cantidades y eliminación.
  Los diálogos heredan el mismo tema, sin duplicar componentes ni introducir condiciones de JavaScript por variante.

## Legibilidad

El servidor exige contraste ≥ 4,5:1 entre `tinta`/`tintaSuave` y `fondo`/`superficie`, entre `tinta` y `acentoSuave`,
y entre `acentoTinta` y `acento`. El comensal deriva `--sm-highlight-text`, `--sm-accent-text` y `--sm-readable-muted`
para leer precios, acentos y texto secundario sobre las tres superficies. `--sm-highlight-ink` contrasta sobre el
color destacado. El color decorativo original permanece disponible para fondos y bordes; las superficies oscuras
fijas usan sus propias tintas claras.

Todos los tamaños declarados parten de al menos 14 px y crecen con la escala de texto. `smart-accessibility.css`
garantiza áreas interactivas de 44 × 44 px como mínimo; en checkbox/radio el área es la etiqueta asociada. Compactar
no reduce el relleno original de los controles. Las etiquetas de formulario crecen sin superponerse al campo,
los títulos largos se ajustan al ancho y los métodos de pago pasan a una columna cuando el texto necesita más espacio.

El cierre pedido por el usuario acepta estos cambios visuales frente a J1: favoritos, navegación, contadores y enlaces
más grandes; texto secundario mayor; precios más oscuros en el tema claro. Ya no se conserva la excepción de accesibilidad
inicial. Las pruebas miden estos mínimos en componentes reales; no constituyen una certificación WCAG completa.

## Persistencia y compatibilidad

- `VenueMenuSettings.theme` guarda el tema de cada sede. La migración `0025` copia colores y tipografía de S1 con
  factores en 1; conserva `palette` y `typography`. Las plantillas retiradas no se reactivan.
- El PUT anterior del POS/MCP sigue reemplazando su paleta y su tipografía. Conserva densidad, escalas, formas,
  colores exclusivos de v2, una fuente de cuerpo elegida independientemente y las dos capas de J3. Se valida el resultado combinado.
- No hay migración adicional en J3: al leer un tema v2 anterior, el resolvedor completa las capas omitidas con sus
  valores predeterminados sin modificar la fila guardada. El número de versión sigue siendo 2.
- La preparación antigua del MCP usa la misma validación para no producir un borrador que falle al confirmar.
- La caché está separada por restaurante/sede y versión; se invalida al guardar y al confirmar la transacción.
- Sin tema se adaptan los ajustes anteriores. Un tema guardado inválido se registra en el log y se sustituye por S1
  predeterminado; nunca impide cargar la carta. Valores antiguos que incumplan las reglas nuevas también usan ese respaldo.
- El comensal sigue aceptando respuestas anteriores sin `tema`; aplica los factores 1. Los colores y fuentes siguen
  llegando en `tokens`. Los factores numéricos inválidos no se interpolan como CSS.
- Las variables de espaciado se calculan en `.smart-menu`, donde se heredan los factores de `<main>`; calcularlas solo
  en `:root` fijaba la densidad en 1. La escala de títulos ya no modifica el cuerpo base.

## Pruebas

```bash
cd experience
venv/bin/python -m pytest -q experience_app/tests/diseno experience_app/tests/mcp
venv/bin/python manage.py makemigrations --check --dry-run
cd ../diner
npx tsc --noEmit
npx jest --ci --runInBand
```

Para la comparación visual, `scripts/exporty-audit/capture.cjs` acepta `AUDIT_TEMPLATE=/ruta/plantilla.json`, un JSON
producido por `plantillas.services.build`. Sin esa variable mantiene el fixture anterior a J2. Ver el
[README de capturas](../../../diner/scripts/exporty-audit/README.md).

`diner/scripts/design-system/verificar-tema.cjs` lee `predeterminado.json`, `compacto.json` y `amplio.json` del directorio
`THEME_EVIDENCE`. Son plantillas resueltas por `build`, no temas crudos. Intercepta la API y omite la introducción para
comprobar la carta real y el botón de pedir. Mide densidad, tamaño base, fuente de cuerpo, radio y todos los botones/enlaces visibles de la carta;
guarda capturas y `fundamentos-navegador.json`. Admite `DINER_URL` y `CDP_URL` igual que la auditoría visual.

`AUDIT_CASES=j2 AUDIT_ACCESSIBILITY=1` selecciona los 50 recorridos vigentes del runner de capturas. Mide tamaños reales,
texto, contraste (incluye placeholders), fondos y desbordamiento. Falla ante infracciones o escenarios fallidos.
Los controles deshabilitados se miden, pero su contraste se excluye; con un modal abierto se evalúa su contenido.
Las capturas incluyen los cuatro medios de pago, reservas y chat, con API interceptada y sin pagos reales.

Para reproducir J3 desde la raíz, con el comensal y el navegador disponibles:

```bash
experience/venv/bin/python diner/scripts/design-system/exportar-variantes.py
EXPORTY_SOURCE=/ruta/exporty CDP_URL=http://127.0.0.1:9333 DINER_URL=http://localhost:3001 \
  node diner/scripts/design-system/verificar-variantes.cjs
```

El exportador usa el resolvedor real sin escribir datos: genera 27 temas en `test-reports/j3/temas/`. El verificador
captura 138 escenarios: cada una de las 23 opciones nuevas, el predeterminado, 50 recorridos en cada combinación
clara/oscura con texto máximo y nueve a 320 px. Comprueba atributos, estilos calculados, geometría y mínimos de J2.
Los resultados se guardan en `variantes-resumen.json` y `variantes/<tema>/`. Admite `VARIANT_EVIDENCE` para otra raíz
(el exportador recibe como argumento su subcarpeta `temas`), `VARIANT_CASES=mixto-claro` para seleccionar temas,
`VARIANT_SCENARIOS=cart,cart-swiped` para repetir recorridos conservando la evidencia anterior y `VARIANT_VERIFY_ONLY=1`
para reevaluar los JSON sin abrir el navegador. La última opción no reemplaza una captura después de cambiar CSS.
Ver [resultado y límites de J3](../../../docs/revisiones/2026-09-24-plan-j3.md).

## Borradores y cambios parciales (J4)

`preparar_tema({"tema":{"variantes":{"boton":"contorno"}}})` mezcla recursivamente solo los campos enviados con el
tema guardado. Valida el resultado completo y devuelve `token` de confirmación, `borrador` de lectura, `url`, `caduca`
y `vista_previa` (lista de campo/antes/después). No publica nada. Los derivados `acentoTinta` y `acentoSuave` se rechazan
como entrada del cambio parcial. `restablecer_tema` acepta `capa`: `todo`, `fundamentos`, `variantes` o `distribucion`.
También prepara un borrador; no aplica el restablecimiento inmediatamente.

- `McpPendingChange` guarda una instantánea validada y el tema base. La migración `0026` añade token público,
  sede e instantánea; permite una clave nula para las vistas previas del POS. Los tokens públicos y de confirmación
  son UUID aleatorios independientes de 122 bits. El enlace no concede permiso para publicar.
- `GET /api/v1/<rest>/<sede>/borradores/<token>/` devuelve solo `plantilla` y `caduca`, con `Cache-Control: no-store`.
  Es de solo lectura. Sede ajena, token inválido, 30 minutos cumplidos, clave revocada o cambio aplicado responden 404.
- `confirmar_cambio` exige la clave MCP que preparó el cambio. Reclama el token y guarda en una transacción, bloquea
  los ajustes de la sede y rechaza si el tema publicado cambió desde la preparación. Si falla, no consume el token.
  Guardar conserva la invalidación de caché de J2.
- El POS llama `POST /internal/v1/<rest>/<sede>/menu/borradores/` por la acción `preview` de la pasarela autorizada de Odoo.
  Acepta el contrato de paleta/tipografía anterior o un tema v2 completo, conserva las capas que el editor antiguo no
  conoce y devuelve el mismo enlace de lectura, sin token de confirmación. Guardar en el POS sigue usando `set`.
- Diner carga `?borrador=<token>`, conserva el parámetro al navegar y recargar, y ofrece «Abrir menú publicado» para salir.
  Vuelve a validar al caducar y muestra el error si el enlace dejó de servir. Las respuestas lentas de otras cargas no
  reemplazan el tema actual. El store y el cliente HTTP bloquean escrituras durante la vista previa, incluso si ya había sesión.
- Los enlaces antiguos `vista_previa` permanecen por compatibilidad, pero el POS ya no codifica ajustes en la URL.

Configuración: `DINER_PUBLIC_URL` debe ser la dirección pública del comensal. Reiniciar experience tras actualizar el
contrato y Odoo tras cambiar la pasarela. Los borradores caducados se limpian al preparar otros de la misma sede.
Esquema y catálogo de herramientas: [README del MCP](../mcp/README.md).

## Página viva del sistema de diseño (J5)

`<diner>/<rest>/<sede>/design-system` dibuja, con el tema publicado de la sede, los fundamentos (colores con derivados
marcados, tipografía, escalas, espaciado y formas), los 15 componentes del inventario con los componentes reales de la
carta, cada opción de las 13 variantes y distribuciones con la elegida enmarcada, y las pantallas con sus componentes en
orden. Con `?borrador=<token público>` muestra ese borrador en todos los componentes, avisa de que nada está publicado y
enlaza la carta con el borrador y el tema publicado.

- `GET /api/v1/diseno/` devuelve `{version, esquema, inventario}`: el mismo contrato que sirve el MCP, sin clave, con
  `Cache-Control: public, max-age=3600` y solo lectura. La página lo usa para describir cada componente y opción; si no
  responde, dibuja igual todos los componentes y opciones a partir del catálogo cerrado de `designVariants.ts`.
- `leer_design_system` devuelve `pagina` (la página con el tema publicado). `preparar_tema`, `restablecer_tema` y la
  pasarela `preview` del POS devuelven `url_design_system` (la página con el borrador). El POS enlaza «Sistema de diseño ↗».
- Cada muestra lleva los atributos `data-ds-*` completos del tema con la opción demostrada encima, dentro de `.smart-menu`
  y `.sm-page` reales; el `<main>` no lleva atributos para que una opción no alcance a la vecina. Las muestras son `inert`:
  la página no abre sesiones ni escribe. La copia local de la lista de componentes (`components/design-system/samples.tsx`)
  tiene una prueba de paridad con `inventario.json`.

## Plantillas por componente (Plan K)

Cuarta capa del tema, `componentes`: por cada componente plantillable, `null` (plantilla de fábrica) o una plantilla
propia. Se prepara con `{"version": N, "html": "…"}` y se guarda como `{"version": N, "arbol": [...]}`, un árbol JSON
validado que el comensal dibuja sin HTML crudo. La [decisión](../../../docs/decisiones/2026-09-25-plantillas-html-restringidas-por-componente.md)
y el [plan K](../../../docs/planes/2026-09-25-plan-K-plantillas-por-componente.md) explican el porqué.

- `componentes.json` es el contrato: por componente, `version`, `datos` (con tipo; `obligatorio` cuando la plantilla
  debe enlazarlo), `ranuras` (`obligatoria`; `envoltorio` si admite contenido), `requisitos` (alternativas, p. ej.
  el precio como dato o como ranura) y `plantilla_fabrica`, escrita en el mismo lenguaje. Hoy solo `plato` (tarjeta de plato).
- `utilidades.json` es el catálogo de clases `ds-*` que admite una plantilla; `diner/components/smart/smart-utilities.css`
  las implementa desde los tokens y una prueba de paridad las mantiene iguales.
- `decoraciones.json` lista el paquete de fábrica (las ilustraciones de `/smart-menu/`), los movimientos y las posiciones.
- `plantillas.py` parsea y valida: etiquetas `div span p h1 h2 h3 strong em small ul ol li figure figcaption`, solo el
  atributo `class` con utilidades; `<dato nombre="plato.nombre"/>` (con `formato="precio|numero|texto"`),
  `<ranura nombre="agregar"/>` (las obligatorias exactamente una vez; las de envoltorio admiten hijos),
  `<si dato="…">`, `<cada dato="…" como="alias">` y `<decoracion id="…" movimiento="…" posicion="…"/>`. Límites:
  150 nodos, profundidad 8, textos fijos de 120 caracteres, 3 decoraciones, sin direcciones web.
- Cada error dice qué falló y dónde («<div>: clase desconocida «rojo»…», «falta el dato obligatorio «plato.nombre»»).
- Un HTML inválido se rechaza al preparar. Un árbol guardado que ya no cumple su contrato (otra versión, un dato retirado)
  vuelve a fábrica y se registra; nunca impide cargar la carta.
- Se prepara con las herramientas de J4: `preparar_tema({"tema":{"componentes":{"plato":{"version":1,"html":"…"}}}})`
  y `restablecer_tema({"capa":"componentes"})`. `vista_previa` resume «de fábrica» / «plantilla propia (vN)».
- `GET /api/v1/diseno/` y `leer_design_system` devuelven `plantillas`: componentes con su contrato y plantilla de fábrica
  (HTML y árbol), utilidades y decoraciones.

**Dibujo en el comensal (K2).** `diner/components/plantillas/Renderizador.tsx` convierte el árbol en React con la
lista cerrada de etiquetas; los datos y las ranuras los aporta el componente real, que sigue siendo dueño de las
acciones (`FoodCard` conserva `add`, favorito y el enlace a la ficha; la plantilla solo los coloca). Sin `innerHTML`.
`lib/domain/plantillas.ts` comprueba versión del contrato, forma del árbol, etiquetas y clases antes de dibujar; ante
cualquier duda, o si algo falla al convertir, se muestra el componente de fábrica. La plantilla se dibuja **dentro** de
la raíz real (`article.sm-food-card`), así la variante de tarjeta y la distribución de la carta siguen mandando. La tarjeta
con plantilla propia lleva `data-plantilla="propia"` y la página viva la marca. Las decoraciones se dibujan como `<img>`
del paquete de fábrica con las clases de movimiento de `smart-decoraciones.css` (quietas con `prefers-reduced-motion`).
Una prueba dibuja la plantilla de fábrica desde el árbol y exige el mismo HTML que el JSX de fábrica.

**Herramientas y verificación (K3).** `leer_componente`, `preparar_componente` y `verificar_borrador` (ver el
[README del MCP](../mcp/README.md)). `plantillas.to_html` regenera el HTML de un árbol para que la IA edite la plantilla
actual; `plantillas.warnings` aplica criterios de medidas sin navegador (`limites.ancho_minimo` del contrato: títulos
grandes, rejillas o varias decoraciones en un componente estrecho). La verificación dinámica la hace
`diner/scripts/design-system/verificar-borrador.cjs`: abre la página viva a 375 y 1024 px y la carta a 320, 375 y 1024 px
con el borrador y mide en cada raíz con plantilla propia (hasta 12 por componente) desbordes de página y raíz, elementos que sobresalen, palabras que no caben
(medidas con la fuente real contra el ancho del bloque), textos < 14 px, controles < 44 px y solapes (las piezas que se
colocan encima a propósito, como la valoración o el corazón, no cuentan); escribe `{ok, problemas, medidas, capturas}` en
stdout, con `ok: null` si no pudo medir, una nota cuando el borrador no trae plantillas propias y un problema si un
componente del borrador no llegó a dibujarse. Los problemas se agrupan por componente. experience lo lanza con `DESIGN_VERIFIER_CMD`
(y `DESIGN_VERIFIER_TIMEOUT`) desde `verificar_borrador`, una verificación a la vez por sede, guarda el resultado en el
cambio pendiente (solo nombres de archivo, nunca rutas) y, con verificador configurado, `confirmar_cambio` exige la última
verificación en verde para cualquier borrador que introduzca o cambie una plantilla propia; volver a fábrica no la exige.
Un `arbol` enviado directamente en vez de `html` se valida y canoniza igual: solo sobreviven las claves de cada nodo.

**Galería de decoraciones por sede (K4).** `MenuDecoration` (migración `0027`) guarda PNG o WebP pequeños por sede:
300 KB, entre 16 y 1024 px de lado, 30 por sede, tipo y dimensiones leídos de la cabecera (sin Pillow), id
`[a-z0-9-]` derivado del nombre y único por sede (los ids de fábrica no se pueden pisar). El POS los sube por
`POST /internal/v1/<rest>/<sede>/decoraciones/` (`{nombre, imagen}` en base64 o data URL) y los borra por `DELETE
…/decoraciones/<id>/`, ambos con `X-Internal-Key`, a través de la pasarela `/waiter/admin/menu_decorations` de Odoo. El
comensal recibe la lista en `GET /api/v1/<rest>/<sede>/decoraciones/` y cada imagen en `…/decoraciones/<id>/?v=<versión>`
con las mismas cabeceras seguras e inmutables que las fotos y el logo. Una plantilla usa `<decoracion id="…"/>` con
cualquier id de fábrica o de su propia sede; el validador fija la sede en contexto (`plantillas.for_venue`, aplicado al
resolver, leer y preparar el tema y a toda herramienta MCP) y guarda en el nodo el `archivo` resuelto, que el comensal solo
acepta si es una ruta del propio origen. Borrar una decoración invalida la caché y las plantillas que la usaban vuelven a
fábrica al releerse. `leer_componente` lista `decoraciones.sede` junto a las de fábrica.

**Componentes plantillables (K5 y cierre C y D).** Diecisiete contratos en `componentes/`: `plato` (tarjeta de plato), `banners`,
`cabecera`, `ficha-heroe` (cabecera de la ficha), `linea-pedido`, `tarjeta-historial`, `tarjeta-estado`, `recibo-papel`,
`buscador`, `categorias`, `seccion` (encabezado de sección), `resumen` (totales del pedido), `cupon`, `perfil`, `saldo-puntos`,
`banner-recompensa` y `recorrido` (la pantalla ilustrada de paso a paso: introducción, ubicación, cuenta lista, correo, canal, éxito al restablecer,
éxito de la opinión y celebración del pago; nueve pantallas con un solo componente `Recorrido` en el comensal, cuyo
envoltorio `.sm-recorrido` es la raíz de la plantilla y cuya sección `.sm-journey` sigue siendo de cada pantalla). En todos,
la raíz real (enlace, cabecera, artículo…) sigue siendo del código con sus variantes y acciones; la plantilla se dibuja dentro.
Cada contrato ofrece dos formas de componer: **ranuras de fábrica** (bloques enteros del diseño actual, p. ej. `copia`,
`saludo`, `encabezado`, `info`, `cabecera`, `total`) y **datos sueltos** (`banner.titulo`, `marca.nombre`, `linea.subtotal`,
`pedido.lineas` con `<cada>`), con las obligaciones expresadas como alternativas en `requisitos` (el título como dato o como
ranura de fábrica). La plantilla de fábrica de cada uno reproduce el diseño actual exactamente, y una prueba del comensal lo
exige para los diecisiete (y otra, pantalla por pantalla, para los nueve recorridos). La página viva muestra los diecisiete con datos
de muestra y marca `data-componente` en cada raíz con plantilla propia; el verificador mide allí todos los componentes (y en
la carta la tarjeta, los banners y la cabecera). En el recorrido, la ilustración orbital sobresale de la columna a propósito
y los puntos de diapositiva miden 6 px: el verificador los excluye del desborde y del mínimo de 44 px.
Los contratos viven en `componentes/<id>.json`; `componentes.json` guarda las reglas comunes y la capa `componentes` del
esquema se completa al cargar.

`diner/scripts/design-system/verificar-pagina.cjs` abre la página en Edge/Chromium a 375 y 1024 px, con el tema publicado y,
si se pasa `DRAFT_TOKEN`, con un borrador. Comprueba componentes y opciones, atributos e inercia de cada muestra, el estilo
calculado que distingue cada opción, ausencia de elementos fijos, desbordamiento, errores JS y escrituras, y guarda capturas
y recortes en `DESIGN_EVIDENCE` (`test-reports/j5`). Admite `DINER_URL`, `CDP_URL`, `REST` y `SEDE`. Solo lee.
