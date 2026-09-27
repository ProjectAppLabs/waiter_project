# Tema del menú v2 (Plan J2)

`esquema.json` es el contrato cerrado y versionado. `services.validate` completa los valores omitidos, normaliza colores,
calcula los derivados y rechaza campos, versiones, tipos, fuentes o rangos desconocidos. No admite HTML ni CSS.
`inventario.json` relaciona fundamentos, variables CSS y los componentes compartidos de las pantallas actuales.
Las variantes permanecen vacías hasta J3; las herramientas nuevas del MCP y los borradores pertenecen a J4.

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
    }
  }
}
```

Se guarda con el PUT interno ya existente: `/internal/v1/<rest>/<sede>/menu/`, con `X-Internal-Key`.
Es un reemplazo: los fundamentos omitidos vuelven al valor por defecto. No se mezclan `tema` y `paleta`/`tipografia`
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

Los radios circulares de J1 (`50%`, `999px`) conservan su forma. No se convierten en cuadrados al poner un factor cero;
las variantes de imagen corresponden a J3. Los tokens `--t-radio-*` antiguos siguen presentes por compatibilidad;
los componentes smart usan los factores `--ds-forma-*`.

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
  colores exclusivos de v2 y una fuente de cuerpo elegida independientemente. Se valida el resultado combinado.
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
