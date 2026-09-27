# Plan L · Reglas de marca: fuentes globales, utilidades de marca, tinta del fondo y verificador de seguridad

**Por qué.** El rediseño Littigio por MCP (2026-09-27) pasó todas las reglas y la verificación, pero no se parecía a la
marca: el lenguaje no tenía su tipografía condensada, ni sombra dura, borde grueso, retícula o foto inclinada, y una sola
tinta impedía fondo oscuro con tarjetas claras. Este plan amplía las reglas lo mínimo para que un estilo de marca así sea
posible sin abrir CSS libre, y endurece el verificador contra contenido activo.

## Contrato común (servidor y comensal lo implementan igual)

1. **Fuentes globales del proyecto.** `tema.fundamentos.tipografia.fuentes`: lista de 0 a 3 familias de Google Fonts
   (nombre exacto, `^[A-Z][A-Za-z0-9 ]{1,39}$`, sin repetir), `[]` por defecto. Se importan una vez para toda la sede.
   `tipografia.display` y `tipografia.cuerpo` admiten la lista fija actual **o** cualquiera de `fuentes`. Las plantillas
   eligen dónde usarlas con las utilidades `ds-fuente-1`, `ds-fuente-2`, `ds-fuente-3` (posición en la lista); una
   utilidad sin fuente en esa posición usa la de títulos. El servidor comprueba al preparar que la familia existe en
   Google Fonts (`https://fonts.googleapis.com/css2?family=<Familia>` responde 200; sin red → error claro, nunca se acepta a
   ciegas). El comensal la carga con `<link>` a fonts.googleapis.com y expone `--ds-fuente-1..3`.
2. **Tinta del fondo.** `tema.fundamentos.colores.tintaFondo` (hex), texto que va directo sobre el fondo de la página
   (títulos, saludo, encabezados de sección, pestañas). Por defecto igual a `tinta`. Contraste ≥ 4.5:1: `tintaFondo` sobre
   `fondo`; `tinta` y `tintaSuave` sobre `superficie`; `tinta` sobre `acentoSuave`; `acentoTinta` sobre `acento`. Ya no se
   exige `tinta` sobre `fondo`. `acentoSuave` pasa a mezclarse con `superficie` (antes con `fondo`) para que siga siendo claro.
3. **Banners del tema.** `tema.variantes.banners`: `actual` (colores fijos violeta/ámbar/oscuro) o `tema` (todos los
   banners toman `acento`, `acentoTinta` y `tintaTerciaria`). Atributo `data-ds-banners`.
4. **Utilidades nuevas** (grupo «Marca» en `utilidades.json`; el comensal las define igual en `smart-utilities.css`):
   `ds-sombra-dura` (sombra desplazada 4px 4px sin desenfoque, color tinta), `ds-borde-grueso` (2 px color tinta),
   `ds-fondo-reticula` (color de fondo de la página, con su tinta `tintaFondo`, y retícula de 16 px), `ds-inclinado-izquierda` / `ds-inclinado-derecha`
   (giro de 2.5°), `ds-barra` (barra de acento de 36×4 px con `tintaTerciaria`; admite elemento vacío),
   `ds-texto-enorme` (display 40 px × escala, mayúsculas, interlineado 1), `ds-tinta-fondo` (texto con `tintaFondo`, añadida tras la primera prueba), `ds-fuente-1`, `ds-fuente-2`, `ds-fuente-3`.
5. **Verificador de seguridad** (`verificar-borrador.cjs`): además de medidas, falla si la página con el borrador tiene
   `iframe`, `object`, `embed` o `frame`; si dentro de una raíz con plantilla propia hay `script`, atributos `on*`,
   `style` que no ponga el código, enlaces `javascript:` o `data:`; si la página pide recursos a orígenes fuera de la
   lista (el propio, `fonts.googleapis.com`, `fonts.gstatic.com`); o si una fuente de `tipografia.fuentes` no cargó.

## Reparto

| Parte | Quién | Archivos |
|---|---|---|
| Servidor: esquema, validación, comprobación en Google Fonts, `utilidades.json`, MCP (descripciones y `leer_*`), pruebas y README | Codex | `experience/experience_app/diseno/*`, `experience/experience_app/mcp/*`, `experience/experience_app/tests/diseno/*`, `experience/experience_app/tests/mcp/*` |
| Comensal: CSS de utilidades, fuentes globales, `tintaFondo`, banners del tema, página viva, verificador de seguridad, pruebas | Claude | `diner/**` |
| Rediseño Littigio por MCP con las reglas nuevas, verificado en Edge | Claude | — |

Rama única `feat/27092026-plan-l-reglas-de-marca`; cada uno toca solo sus carpetas.

## Ampliaciones tras las pruebas reales (2026-09-27)

- **Textura del fondo** (`fundamentos.textura`: patrón ninguna/retícula/cuaderno/puntos/diagonal, tamaño 8–48 px,
  intensidad 0–0.25), dibujada en todo el layout con la tinta del fondo.
- **Contraste verificado en Chromium**: texto 4.5:1 (grande 3:1) e iconos 3:1 contra su fondo efectivo, en catorce
  combinaciones de pantalla y ancho, también sobre el tema publicado. La tinta por contexto (fondo o tarjeta) se genera desde el
  propio CSS con `diner/scripts/design-system/superficies.cjs` (orden de cascada, `@media`, `!important`, colores fijos claros).
- **Reglas de imágenes en el sistema de diseño**: `fundamentos.imagenes` (`radio` 8–40 px, nunca en punta; `ajuste`
  cubrir/contener) y `variantes.marcoImagen` (ninguno/borde/sombra). `forma.imagen` se deriva del radio y no se edita. El
  verificador exige a cada foto de plato un radio de al menos la mitad del definido y nunca menos de 8 px (salvo circular),
  sin deformación y con el ajuste y el marco del tema.
- **Orden del MCP**: primero el sistema de diseño, después los componentes. `preparar_componente` y `preparar_tema` rechazan
  plantillas mientras los fundamentos sigan siendo los de fábrica; `leer_design_system` devuelve el `orden`.
- **Maquetación verificada en Chromium** (reglas del código, que el MCP no cambia): espacio vacío al final (solo si la
  página se desplaza) no mayor que el muelle más 96 px; fotos y textos no cortados por el borde (salvo carriles
  desplazables); botones del muelle en una fila y sin texto partido; órbitas de la ficha solo con foto circular; nutrición
  en una fila. Se comprobó reproduciendo los defectos anteriores de la ficha: los cinco se detectan.

