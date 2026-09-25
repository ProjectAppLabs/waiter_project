# Plan J: design system del menú, editable por IA a través del MCP

**Objetivo.** El diseño del menú del comensal (colores, tipografía, márgenes y rellenos, forma, densidad y la distribución
de sus componentes) vive como **datos con esquema**: un *tema* por sede. La IA lo entiende y lo cambia por el MCP con vista
previa, y el menú entero (unas 30 pantallas) se actualiza sin tocar código.

**Principio.** La IA nunca escribe HTML ni CSS. Cambia valores de un esquema cerrado y validado. El código del menú es el
único que sabe convertirlos en estilos. Así cualquier tema es legible, accesible y seguro en una pantalla que cobra, y
las funciones nuevas del menú siguen sirviendo para todos los restaurantes.

## Punto de partida (medido el 2026-09-24)

| Qué | Hoy |
|---|---|
| Pantallas del comensal | ~30, una sola ruta (`diner/app/[rest]/[sede]/[[...ruta]]`) |
| Componentes y estilos | 31 componentes en `components/smart/`, 11 CSS (2.237 líneas, 274 clases), 0 estilos en línea |
| Variables | 517 usos de `var(--…)`: colores y fuentes ya salen del tema |
| Tokens de la plantilla S1 | 20 (colores, fuentes, peso, tracking, radios, densidad, modo); **editables solo 6** (5 colores y la fuente de títulos) |
| Radios | `--t-radio-*` existen, pero el CSS no los usa: **170 radios fijos** |
| Espaciado | **637 valores fijos** de padding, margin y gap, con **57 medidas distintas** |
| Tipografía | **275 tamaños fijos**, 14 distintos; 5 pesos |
| Canal de tokens | experience `final_tokens` → contexto de entrada → `diner/lib/domain/template.ts` `templateVars` → variables CSS en `<main>` |
| Vista previa | El POS pasa paleta y tipografía por la URL (`previewUrl`). No alcanza para un tema completo. |

## Arquitectura

```
                    esquema + inventario (fuente de verdad, versionada)
                    experience/experience_app/diseno/  ──►  lo leen el MCP, la validación y las pruebas del diner
tema de la sede ──► validar ──► resolver (tema + valores por defecto) ──► contexto ──► diner: variables CSS + data-*
   ▲                                                                                      │
   └── MCP: preparar_tema (borrador) ──► enlace de vista previa ?borrador=<token> ──────────┘ ──► confirmar_cambio
```

### 1. Tema v2: tres capas

1. **Fundamentos** (tokens con rango y valor por defecto):
   - **Color**: los 9 tokens. Los derivados (suave, tinta sobre acento) se siguen calculando.
   - **Tipografía**: fuente de títulos y fuente de cuerpo, tamaño base, escala (razón), pesos de título y cuerpo,
     interlineado, tracking y mayúsculas en títulos.
   - **Espaciado**: unidad base, margen de página, separación entre secciones, relleno de tarjeta y densidad
     (compacta, media, amplia), que multiplica la escala.
   - **Forma**: radio de tarjeta, botón, chip, imagen y hoja inferior.
   - **Elevación**: sombra ninguna, suave o marcada.
   - **Modo**: claro u oscuro.
2. **Variantes de componente**, de un catálogo cerrado. Cada una está diseñada y probada una sola vez.
   - Botón: relleno, contorno o suave; forma píldora, redondeada o recta.
   - Tarjeta de plato: con sombra, con borde o plana.
   - Navegación de categorías: chips, pestañas o subrayado.
   - Precio: normal, destacado o en píldora.
   - Imagen: cuadrada o 4:3; esquinas del tema o circular.
   - Cabecera: logo a la izquierda o centrado; saludo visible u oculto.
   - Insignias: rellena o contorno.
3. **Distribución por pantalla**, solo donde haya variantes implementadas.
   - Carta: cuadrícula de 2, lista o foto grande.
   - Ficha del plato: foto héroe o dividida.
   - Carrito: tarjetas o lista compacta.

   Una pantalla sin variantes usa la única que tiene.

**Reglas que ningún tema puede romper**, porque se validan en el servidor:
- Contraste mínimo de 4,5:1 para el texto y los botones.
- Cuerpo de texto de al menos 14 px.
- Zonas táctiles de al menos 44 px.
- Escalas dentro de rango.
- Solo fuentes de la lista.

### 2. Inventario de componentes (lo que la IA «ve»)

Un manifiesto legible por máquina (`inventario.json`) describe cada componente:
- `id` y nombre en palabras («Tarjeta de plato»).
- En qué pantallas y secciones aparece.
- Qué fundamentos consume (tipografía de título, relleno de tarjeta, radio de tarjeta…).
- Qué variantes tiene, con una descripción de cada una.

Por pantalla, la estructura en orden. Por ejemplo, la carta:
cabecera → saludo → banners → navegación de categorías → lista de platos (tarjeta de plato) → barra de pedido.

Es la fuente de verdad: el MCP la sirve, el validador la usa y el diner tiene pruebas que fallan si una variable o una
variante del inventario no existe en el CSS, o si el CSS usa una que el inventario no declara.

### 3. CSS por variables y variantes

- Cada valor fijo pasa a una variable semántica: `--ds-espacio-*` (escala), `--ds-texto-*` (escala tipográfica) y
  `--ds-radio-*`. Las 57 medidas de espaciado se agrupan en una escala de 4 px; los casos que no sean de escala se
  justifican o se vuelven relativos.
- Las variantes se aplican con atributos en `<main>`, por ejemplo `data-ds-boton="contorno"` o
  `data-ds-carta="lista"`, y con selectores CSS. No hay JavaScript por variante.
- **El tema por defecto debe verse idéntico al menú de hoy.** Se comprueba con capturas antes y después de las 30
  pantallas (`diner/scripts/exporty-audit/capture.cjs`, que ya captura 99 escenarios). Las diferencias de 1–2 px por
  normalizar la escala se revisan a ojo, no se aceptan en silencio.

### 4. Vista previa con borrador

`preparar_tema` guarda el borrador en experience (reutiliza `McpPendingChange`) y devuelve un enlace:
`<diner>/<rest>/<sede>/carta?borrador=<token>`.

- El diner pide el tema del borrador a un endpoint público de solo lectura, que responde por token (122 bits,
  caduca a los 30 minutos).
- El comensal real nunca lo ve.
- La persona revisa el borrador en su teléfono, en todas las pantallas, antes de confirmar.
- El POS usa el mismo mecanismo en vez de pasar la paleta por la URL.

### 5. Herramientas del MCP

| Herramienta | Qué hace |
|---|---|
| `leer_design_system` | Esquema (fundamentos con rango y valor por defecto, variantes con descripción), inventario y tema actual |
| `describir_pantalla` | Estructura de una pantalla: secciones y componentes en orden, con lo que se puede cambiar de cada uno |
| `preparar_tema` | Cambio parcial (solo lo que se toca); valida y devuelve la vista previa en texto, el enlace del borrador y un token |
| `restablecer_tema` | Prepara volver todo, o una capa, a los valores por defecto |
| `confirmar_cambio` | Ya existe: aplica el borrador |

Los errores de validación dicen qué valor falló y por qué, para que la IA corrija sola. Por ejemplo: «radio de botón
40: máximo 32» o «tinta sobre superficie 3,1:1: mínimo 4,5:1».

## Fases

| Fase | Entrega | Cómo se verifica |
|---|---|---|
| **J1. Fundamentos** | Auditoría del CSS; escalas de espaciado, tipografía y radio; CSS por variables | Capturas antes/después idénticas con el tema por defecto |
| **J2. Tema v2** | Esquema e inventario en experience, validación, resolución, migración de los ajustes actuales, `templateVars` extendido | Pruebas del esquema y de las reglas; conservar el diseño salvo los mínimos de accesibilidad aceptados en el cierre |
| **J3. Variantes** | Botón, tarjeta, navegación de categorías, precio, imagen, cabecera e insignias; distribución de carta, ficha y carrito | Una captura por variante; pruebas inventario ↔ CSS y combinaciones con los mínimos de J2 |
| **J4. MCP y borradores** | Las 4 herramientas nuevas, el enlace `?borrador=`, y el POS pasado al mismo mecanismo | Prueba de punta a punta: la IA lee, prepara, se ve el borrador y se confirma |
| **J5. Página viva** | `/<rest>/<sede>/design-system`: todos los componentes y variantes con el tema de la sede | Captura y revisión visual |

J1 es la base de todo y no cambia nada visible. Cada fase se fusiona por separado.

## Estado

**J1 hecho (2026-09-24).**
- `diner/scripts/design-system/tokenizar.py` pasó a variables de `smart-tokens.css`:
  - 775 espaciados (pasos de 2 px × `--ds-densidad`),
  - 373 tamaños e interlineados de texto (× `--ds-texto` y, en títulos, × `--ds-titulo`),
  - 163 radios (× `--ds-forma-<rol>`: tarjeta, botón, chip, campo, imagen u hoja).
- La escala de 2 px reemplazó a la de 4 px del plan: la de 4 px movía 206 valores y agrandaba los más usados; con la de 2 px
  solo se mueven los impares, 1 px cada uno.
- Verificación con las capturas de 68 pantallas:
  - 42 quedan idénticas al píxel.
  - 18 tienen cambios deterministas, todos de un espaciado impar redondeado (p. ej. `padding: 5px` → `6px`); ningún tamaño de
    texto cambió.
  - 8 difieren igual entre dos capturas con el mismo CSS (animaciones): son ruido.
- `components/smart/__tests__/designTokens.test.ts` falla si vuelve una medida fija.

**J2 cerrado (2026-09-24), incluida la accesibilidad heredada.**

- Esquema e inventario en `experience/experience_app/diseno/`: densidad, texto, títulos, seis formas por rol,
  nueve colores (dos derivados) y fuentes independientes de títulos/cuerpo. Rangos, tipos, campos y contraste validados.
- `VenueMenuSettings.theme` y migración `0025`: conserva los ajustes de S1 y el contrato anterior del POS/MCP.
  La entrada entrega `plantilla.tema` y mantiene `tokens`; guardar invalida la caché por sede.
- `templateVars` emite los factores `--ds-*`. Se corrige el cálculo del espaciado en `.smart-menu` y se evita que
  el factor de títulos modifique el cuerpo base. Compactar no reduce el relleno original de los controles.
- Un tema guardado inválido usa S1 predeterminado; una respuesta sin tema sigue funcionando en el comensal.
- Cierre solicitado por el usuario: todos los textos parten de 14 px y las áreas interactivas de 44 × 44 px.
  Las tintas decorativas se derivan con contraste ≥ 4,5:1; se corrigieron campos inválidos, pagos, estado y carrito
  deslizado en temas oscuros. Etiquetas y distribución se ajustan al texto ampliado. Estos cambios visuales reemplazan
  la excepción inicial de conservar los controles pequeños de J1.
- Se actualizaron las pruebas del catálogo retirado para verificar S1; las suites de comensal y experience pasan.
  TypeScript, ESLint, Ruff y la comprobación de migraciones pasan. Migración aplicada localmente.
- Auditoría de componentes reales en temas predeterminado, compacto, oscuro y con escalas máximas; incluye formularios
  de pago, reservas y chat. El runner falla ante controles/textos pequeños, contraste insuficiente o desbordamiento.

Contrato y reproducción de pruebas: [README del tema v2](../../experience/experience_app/diseno/README.md).
Capturas, resultados y límites de la comprobación: [revisión de J2](../revisiones/2026-09-24-plan-j2.md).
**J3 cerrado (2026-09-24).**

- Catálogo cerrado de 13 campos y 36 valores: estilos y formas de botones, tarjetas, categorías, precios, recorte/forma
  de fotos, cabecera, saludo e insignias; distribución de carta, ficha y carrito. Incluye 23 opciones nuevas además de
  los valores predeterminados que conservan J2.
- `variantes` y `distribucion` completadas al leer temas v2 anteriores, sin migración adicional. Guardar por el PUT
  existente persiste ambas capas, invalida la caché y conserva el aislamiento por sede. Las ediciones antiguas del
  POS/MCP preservan esas capas.
- Atributos `data-ds-*` cerrados en `<main>` y `smart-variants.css`; mismos componentes y recorridos. El inventario
  describe opciones, selectores y consumidores, con pruebas de correspondencia entre esquema, inventario, TypeScript y CSS.
- Cuadrícula de hasta dos columnas adaptable al texto; lista y foto grande; ficha héroe/dividida adaptable a móvil;
  carrito compacto. Recorte circular prevalece sobre 4:3, y las formas explícitas prevalecen sobre los radios locales.
- Pruebas de contrato, persistencia y ruta real, capturas de cada opción y combinaciones extremas, incluida producción.
  Los nuevos estilos mantienen los mínimos medidos de J2. La valoración con botones alternativos deja espacio para
  el chat y «Continuar»; el destacado crece con el texto.

Contrato, valores y reproducción: [README del tema v2](../../experience/experience_app/diseno/README.md).
Resultados y límites: [revisión de J3](../revisiones/2026-09-24-plan-j3.md).
**J4 implementado y validado (2026-09-25); cierre entregado a Claude, sin commit todavía.**

- Las cuatro herramientas nuevas sirven el esquema/inventario reales, describen pantallas, mezclan cambios parciales y
  preparan restablecimientos por capa o completos.
- Borradores de 30 minutos sobre `McpPendingChange` (migración `0026`), con token público distinto del de confirmación,
  endpoint de lectura sin caché y comprobaciones de sede, revocación y caducidad. Confirmación transaccional de un uso,
  con rechazo de temas que cambiaron desde la preparación.
- Vista previa del POS por la acción `preview` de Odoo; iframe y enlace del comensal usan `?borrador=`. El comensal conserva
  el token al navegar, maneja caducidad/salida y bloquea escrituras. Las llamadas antiguas del MCP siguen disponibles.
- Pruebas de backend, componentes y pasarela; recorrido completo en navegador con base aislada, tanto en desarrollo
  como en producción. Ver [revisión de J4](../revisiones/2026-09-25-plan-j4.md) y
  [estado del cierre local](../traspaso/2026-09-25-j4-estado-y-cierre.md).

La página viva del sistema de diseño continúa en **J5**.

## Fuera de alcance

- HTML o CSS libres por restaurante: riesgo de suplantar el botón de pago, rastreo con imágenes externas y roturas con
  cada función nueva.
- Reordenar o quitar secciones de una pantalla: más adelante, como variantes de distribución, si hace falta.
- Editar las ~30 pantallas una por una: el tema es global; la distribución por pantalla solo existe donde hay variantes.

## Riesgos

- **Regresiones visuales en J1**: 637 espaciados y 275 tamaños tocados a mano. Se mitiga con capturas de todas las
  pantallas y revisión por lotes.
- **Combinatoria de variantes**: cada una se prueba sola y en combinaciones representativas, no en todas.
- **El comensal siempre debe cargar**: si el tema no es válido o falta, se usan los valores por defecto (como hoy con la
  plantilla).
