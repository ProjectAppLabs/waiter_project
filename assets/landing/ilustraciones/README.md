# Ilustraciones de la landing de Waiter

Generadas con la API de OpenAI (`gpt-image-2.5`) el 2026-10-10, a partir del documento de producción de la landing.
Ese documento explica la estructura, el motion y el sistema de diseño: `docs/marketing/2026-10-10-landing-waiter.md`.

**Formato:** WebP con transparencia, calidad 85, al tamaño de entrega del documento. Las referencias y la escena final
van con fondo.

**Costo total:** US$2,17, incluidos los reintentos. En `registro.json` está el prompt, el modelo, la calidad y el costo
de cada pieza, para regenerar cualquiera igual.

## Cómo se graduó el esfuerzo

| Esfuerzo | Modelo y calidad | Piezas |
|---|---|---|
| Alto | sunburst · alta | Referencias (estilo y 3 personajes), mano con teléfono, mesero, domiciliario, cocinera, escena final |
| Medio | sunburst · media | Mesa, 8 platos, sede, casa, escenas de dolor, nevera, monedas, trofeo, candados, separadores y todas las variantes (editando el maestro) |

Todo se generó con la hoja de estilo (`ref01`) y la ficha del personaje como imágenes de referencia, para que parezca
de una sola mano.

## Piezas

| ID | Archivos |
|---|---|
| REF-01 | `ref01-hoja-de-estilo` |
| REF-02 | `ref02-mesero`, `ref02-cocinera`, `ref02-domiciliario` |
| IL-01 | `il01-mano-telefono` |
| IL-02 | `il02-mesa-nfc` |
| IL-04 | `il04-hamburguesa`, `-arepa`, `-empanadas`, `-perro`, `-bandeja`, `-limonada`, `-tinto`, `-cerveza` |
| IL-05 | `il05-mesero` y sus variantes: `-ojos-cerrados`, `-boca-e`, `-boca-a`, `-paisa`, `-rolo`, `-costeno`, `-caleno`, `-santandereano` |
| IL-06 | `il06-domiciliario-moto` |
| IL-07 | `il07-sede`, `il07-casa` |
| IL-08 a IL-11 | `il08-mano-que-espera`, `il09-la-tajada`, `il10-comanda-arrugada`, `il11-nevera-abierta`, `il11-nevera-cerrada` |
| IL-12 | `il12-cocinera`, `-llama-media`, `-llama-alta` |
| IL-13 | `il13-monedas` (las 3 en una lámina), `il13-trofeo` |
| IL-14 | `il14-candado-abierto`, `il14-candado-cerrado` |
| IL-15 | `il15-viernes-8pm` (3840 × 1872) |
| IL-17 | `il17-separador-1`, `-2`, `-3` |

## Lo que falta

- **Separar en capas** (pulgar, ruedas, brazos, bocas solas…). Las variantes vienen como imágenes completas del mismo
  encuadre: bocas, ojos, accesorios, llamas, nevera y candado. El recorte por capas es el paso manual del flujo del
  documento.
- **Las monedas vienen en una sola lámina:** hay que recortarlas.
- **IL-18 (retratos de dueños):** necesita fotos reales con autorización.
