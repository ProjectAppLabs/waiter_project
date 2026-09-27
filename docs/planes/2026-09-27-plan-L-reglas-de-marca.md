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
   `ds-texto-enorme` (display 40 px × escala, mayúsculas, interlineado 1), `ds-fuente-1`, `ds-fuente-2`, `ds-fuente-3`.
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
