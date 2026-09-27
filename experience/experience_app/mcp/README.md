# MCP de Waiter

Servidor MCP para que un asistente de IA (Claude u otro cliente MCP) llene la configuración aburrida del restaurante.
Cubre el **tema v2 completo**, el diseño anterior (colores, tipografía de títulos, saludo) y los **banners** del carrusel.

## Claves: una por persona o asistente, siempre de un solo restaurante

- Se generan en el POS: **Administración › Configuración › Integraciones IA**. Solo las ve y crea un administrador
  del POS, a través de la pasarela `/waiter/admin/mcp_keys` del addon, que toma la sede de Odoo, nunca del navegador.
- La clave (`wtr_…`, 256 bits al azar) se muestra **una sola vez**; aquí se guarda solo su sha256 (`McpKey`).
- **La clave decide la sede.** Ninguna herramienta acepta un restaurante o una sede como argumento.
- Revocar corta el acceso de inmediato. Hay como máximo 10 claves activas por sede.

## Conexión

| Cliente | Cómo |
|---|---|
| claude.ai (conector personalizado) | URL `https://<experience>/mcp/<clave>/` (la clave va en la ruta) |
| Claude Code | `claude mcp add --transport http waiter https://<experience>/mcp/ --header "Authorization: Bearer <clave>"` |

La clave en la ruta queda en los registros de acceso del proxy: en producción, no registres la ruta de `/mcp/` o
enmascárala.

## Protocolo

JSON-RPC 2.0 en modo sin estado del transporte «Streamable HTTP»: un POST por mensaje y la respuesta en JSON. No usa
sesiones ni flujos SSE. Soporta `initialize`, `ping`, `tools/list` y `tools/call`. Las notificaciones responden 202,
y GET y DELETE responden 405. Versiones: 2025-06-18, 2025-03-26 y 2024-11-05.

## Herramientas

| Herramienta | Qué hace |
|---|---|
| `leer_design_system` | Esquema versionado, inventario de componentes/pantallas, tema actual, reglas, `pagina` (la página viva) y `plantillas` (contratos, plantillas de fábrica, utilidades `ds-*` y decoraciones del Plan K) |
| `describir_pantalla` | Secciones en orden, fundamentos, variantes disponibles y tema actual de una pantalla del inventario |
| `preparar_tema` | Mezcla los campos de `tema` enviados con lo guardado (incluida la capa `componentes` con plantillas HTML restringidas, Plan K), valida y devuelve borrador, enlaces (`url` a la carta, `url_design_system` a la página viva) y token de confirmación |
| `restablecer_tema` | Prepara volver `todo` o una `capa` (`fundamentos`, `variantes`, `distribucion`, `componentes`) a sus valores por defecto |
| `leer_componente` | Contrato de un componente plantillable (`plato`, `banners`, `cabecera`, `ficha-heroe`, `linea-pedido`, `tarjeta-historial`, `tarjeta-estado`, `recibo-papel`, `recorrido`, `buscador`, `categorias`, `seccion`, `resumen`, `cupon`, `perfil`, `saldo-puntos`, `banner-recompensa`): datos, ranuras, límites, su plantilla actual en HTML, utilidades `ds-*` y decoraciones de fábrica y de la sede (Plan K3–K5) |
| `preparar_componente` | Valida una plantilla HTML restringida (`html`; `null` vuelve a la de fábrica), avisa de medidas y deja un borrador. **No publica.** |
| `verificar_borrador` | Inicia la medición en segundo plano y devuelve `en_curso` con `inicio`; al volver a llamar con el mismo token consulta el resultado guardado. Mide desbordes, solapes, palabras partidas y mínimos de texto y controles. Una plantilla propia solo se confirma con la última verificación en verde; volver a fábrica no la necesita |
| `leer_diseno_menu` | Colores editables (con su uso), tipografía y las permitidas, saludo, logo y reglas de contraste |
| `preparar_diseno_menu` | Valida un cambio (colores, tipografía, saludo) y devuelve una vista previa y un token. **No guarda.** |
| `leer_banners` | Banners actuales, valores permitidos y límites de texto |
| `preparar_banners` | Valida la lista completa de banners en Odoo (`dry_run`) y devuelve una vista previa y un token. **No guarda.** |
| `listar_catalogo` | Productos y categorías con sus ids, para usarlos como destino de los banners |
| `confirmar_cambio` | Aplica un cambio preparado. El token es de un solo uso, caduca a los 30 minutos y solo sirve con la misma clave que lo preparó. |

Las reglas son las mismas del POS: `plantillas.services.validate` para el diseño y
`pos.config._waiter_clean_banners` para los banners. Las imágenes de los banners y el logo se siguen subiendo desde el
POS. Un banner puede conservar su imagen con `imagen_de_banner`.

### Flujo del tema completo (J4)

1. Leer `leer_design_system`; consultar `describir_pantalla({"pantalla":"carta"})` si hace falta.
2. Preparar, por ejemplo:
   `preparar_tema({"tema":{"variantes":{"boton":"contorno"},"distribucion":{"carta":"lista"}}})`.
3. Mostrar `vista_previa` y abrir `url` (`/<rest>/<sede>/carta?borrador=<token-de-lectura>`) o `url_design_system`
   (`/<rest>/<sede>/design-system?borrador=<token-de-lectura>`, todos los componentes y variantes con el borrador).
4. Tras la aprobación de la persona, llamar `confirmar_cambio({"token":"<token-de-confirmación>"})`.

Los dos tokens son distintos. El público solo permite leer la instantánea validada durante 30 minutos; nunca devuelve
el token de confirmación ni la clave MCP. Revocar la clave, confirmar o alcanzar la caducidad retira el enlace.
No se permite editar derivados de color. La confirmación rechaza un borrador si otro editor cambió el tema entretanto;
hay que leer y preparar de nuevo. Preparar o restablecer no publica ni cambia los ajustes de la sede.

### Reglas de marca (Plan L)

`leer_design_system` expone el esquema ampliado, los mapas de `tintaFondo` y `tipografia.fuentes` a sus variables CSS,
la variante `banners` y el grupo **Marca**. `leer_componente` entrega ese mismo catálogo y la `tipografia` actual de la sede,
para conocer qué familia corresponde a cada utilidad. Las descripciones de `preparar_tema` y del esquema explican su uso.

Ejemplo de cambio parcial para fondo oscuro, tarjetas claras y fuentes globales:

```json
{
  "tema": {
    "fundamentos": {
      "colores": {"fondo": "#111111", "superficie": "#FFFFFF", "tinta": "#32324D", "tintaSuave": "#666687", "tintaFondo": "#FFFFFF"},
      "tipografia": {"fuentes": ["Barlow Condensed", "Anton"], "display": "Barlow Condensed", "cuerpo": "Mulish"}
    },
    "variantes": {"banners": "tema"}
  }
}
```

- `fuentes` admite 0–3 nombres exactos, únicos, con patrón `^[A-Z][A-Za-z0-9 ]{1,39}$`; `[]` es el valor por defecto.
  Son globales, cargadas una sola vez para toda la sede. `display` y `cuerpo` eligen la lista fija o una de esas familias.
  La lista enviada reemplaza la anterior: si retiras una familia en uso, cambia también el rol que la usa.
- `ds-fuente-1`, `ds-fuente-2` y `ds-fuente-3` eligen la familia por posición; una posición vacía usa la fuente de títulos.
  Las demás clases de Marca son `ds-sombra-dura`, `ds-borde-grueso`, `ds-fondo-reticula`, `ds-inclinado-izquierda`,
  `ds-inclinado-derecha`, `ds-barra` (admite `<span class="ds-barra"></span>`) y `ds-texto-enorme`.
- Al preparar cualquier borrador que conserve fuentes globales se exige HTTP 200 de
  `https://fonts.googleapis.com/css2?family=<Familia>` por cada familia. Cada petición tiene 3 s de tiempo de conexión/lectura,
  sin redirecciones ni reintentos. Sin red o sin HTTP 200 se devuelve `isError` con la familia y no se crea el borrador.
  Leer y confirmar no hacen nuevas consultas. Las pruebas simulan las respuestas HTTP.
- `tintaFondo` omitida toma `tinta`. Contrastes mínimos de 4,5:1: `tintaFondo`/`fondo`, `tinta`/`superficie`,
  `tintaSuave`/`superficie`, `tinta`/`acentoSuave`, `acentoTinta`/`acento`. La mezcla de acento suave usa `superficie`;
  S1 sin cambios conserva sus derivados originales. Ya no se exige `tinta` sobre `fondo`.
- `variantes.banners`: `actual` conserva violeta/ámbar/oscuro; `tema` usa `acento`, `acentoTinta` y `tintaTerciaria`.
- El contrato del verificador del comensal añade contenido activo, orígenes de recursos y carga de las fuentes globales
  a las mediciones existentes. Solo admite recursos del propio origen, `fonts.googleapis.com` y `fonts.gstatic.com`;
  los detalles y las utilidades se documentan en el [README del tema](../diseno/README.md#fuentes-y-utilidades-de-marca-plan-l).

### Flujo de una plantilla de componente (K3)

1. `leer_componente({"componente":"plato"})`: contrato, `plantilla_actual.html` (de fábrica o la propia), utilidades y decoraciones.
2. `preparar_componente({"componente":"plato","html":"…"})`: rechaza con el error exacto si algo no cumple; si cumple,
   devuelve `borrador`, `url`, `url_design_system`, `token`, `vista_previa` y `advertencias` (criterios de medidas que se
   juzgan sin navegador, p. ej. un título de 22 px en una tarjeta de 142 px).
3. `verificar_borrador({"borrador":"…"})` responde de inmediato `estado: en_curso`, `ok: null`, `inicio`, `borrador` y
   `siguiente`. Espera unos segundos y vuelve a llamar con el mismo `borrador`: mientras corre devuelve el mismo inicio;
   al terminar entrega el resultado guardado, sin lanzar otro navegador. Con `DESIGN_VERIFIER_CMD` configurado abre
   la carta a 320, 375 y 1024 px y devuelve `estado` `ok` o `problemas` con la lista concreta («375 px: tarjetas 1, 2: la palabra
   «Hamburguesa» (144 px) no cabe en 66 px y se parte»), agrupada por tarjeta. `estado: error` (`ok: null`) significa que el
   navegador no pudo medir (no es culpa de la plantilla); `no_disponible` solo sale cuando la variable está vacía. Corre
   una verificación a la vez por sede. Mide en la página viva todos los componentes con plantilla propia (hasta 12 raíces
   por componente) y, en la carta, la tarjeta, los banners y la cabecera en su contexto real.
4. Con la aprobación de la persona, `confirmar_cambio({"token":"…"})`. `DESIGN_VERIFIER_REQUIRED=true` es el valor
   predeterminado: un borrador que introduce o cambia una plantilla propia solo se confirma con la última verificación
   en verde (`ok: true`). Sin comando, con `error`, con problemas o sin verificar, la confirmación explica qué falta y no
   consume el token. Mientras mide, rechaza con «La verificación está en curso». Un verde anterior no sirve si la última
   medición falló. Volver a fábrica por MCP o cambiar otras
   capas sin tocar plantillas no exige verificación.

Para desarrollo sin navegador, `DESIGN_VERIFIER_REQUIRED=false` conserva la puerta anterior: MCP exige verde solo si
hay comando configurado; el PUT interno no exige borrador.

El hilo respeta `DESIGN_VERIFIER_TIMEOUT` y cierra sus conexiones de Django al terminar. Si se interrumpe sin guardar,
la siguiente consulta convierte un `en_curso` de más de ese máximo + 5 segundos en `error`. Nunca se publica con un
estado pendiente ni se acepta un verde tardío después de recuperar el error. Los resultados terminales se conservan:
para reintentar un error o `no_disponible` tras reparar la infraestructura, o para corregir problemas, prepara otro
borrador. El flujo es **verificar → esperar → volver a llamar → confirmar con verde y aprobación**.

El mismo mecanismo sirve la vista previa del POS. Su pasarela de administrador prepara sin clave MCP y devuelve
solo el token público. `verify {borrador}` ejecuta el POST interno de verificación y devuelve el mismo contrato del MCP.
Con el modo estricto, `set` debe enviar ese `borrador` si cambia `tema.componentes` (también al volver a fábrica):
la sede, vigencia, última verificación y tema completo deben coincidir. Guardar consume el borrador en la misma
transacción y conserva la autorización habitual del POS; el token público por sí solo no permite publicar.
Contrato, endpoints y persistencia en el
[README del tema](../diseno/README.md#borradores-y-cambios-parciales-j4).

## Identidad en Odoo

experience entra a cada Odoo con el usuario de servicio de la sede, el que guarda el registro. Para guardar banners sin
el PIN de un empleado, ese usuario necesita el grupo **Waiter · Integraciones (MCP)**
(`projectapp_ops.group_waiter_integration`). Se asigna solo a él. El saludo se escribe por `res.company.write_brand`,
que exige gerente del POS.

Pendiente, y ya documentado en `docs/arquitectura/2026-09-21-odoo-headless-y-django-orquestador.md`: el usuario de
servicio sigue siendo `admin` en la demo. El MCP no amplía ese acceso, pero tampoco lo reduce.

## Próximas herramientas

Fichas de plato (ingredientes, nutrición, adicionales), horario de reservas, cupones… Cada una se agrega en `tools.py`
(`TOOLS`) con el mismo patrón: leer, preparar con vista previa y confirmar.

## Orden: primero el sistema de diseño (Plan L)

`leer_design_system` devuelve `orden`: 1) `preparar_tema` con fundamentos (colores, tipografía y fuentes globales, forma,
imágenes, textura) y variantes, verificado y confirmado; 2) plantillas de componente sobre ese sistema. Con los fundamentos de
fábrica, `preparar_componente` y `preparar_tema` con `componentes` responden «Define primero el sistema de diseño». Las
reglas de imágenes (`fundamentos.imagenes`, `variantes.marcoImagen`) las comprueba `verificar_borrador` en cada foto.
