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
| `leer_componente` | Contrato de un componente plantillable (datos, ranuras, límites), su plantilla actual en HTML, utilidades `ds-*` y decoraciones de fábrica y de la sede (Plan K3–K4) |
| `preparar_componente` | Valida una plantilla HTML restringida (`html`; `null` vuelve a la de fábrica), avisa de medidas y deja un borrador. **No publica.** |
| `verificar_borrador` | Abre la carta con el borrador en un navegador (320, 375 y 1024 px) y mide en las tarjetas con plantilla propia desbordes, solapes, palabras partidas, textos < 14 px y controles < 44 px. Una plantilla propia solo se confirma con la última verificación en verde; volver a fábrica no la necesita |
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

### Flujo de una plantilla de componente (K3)

1. `leer_componente({"componente":"plato"})`: contrato, `plantilla_actual.html` (de fábrica o la propia), utilidades y decoraciones.
2. `preparar_componente({"componente":"plato","html":"…"})`: rechaza con el error exacto si algo no cumple; si cumple,
   devuelve `borrador`, `url`, `url_design_system`, `token`, `vista_previa` y `advertencias` (criterios de medidas que se
   juzgan sin navegador, p. ej. un título de 22 px en una tarjeta de 142 px).
3. `verificar_borrador({"borrador":"…"})`: con `DESIGN_VERIFIER_CMD` configurado abre la carta con el borrador a 320,
   375 y 1024 px y devuelve `estado` `ok` o `problemas` con la lista concreta («375 px: tarjetas 1, 2: la palabra
   «Hamburguesa» (144 px) no cabe en 66 px y se parte»), agrupada por tarjeta. `estado: error` (`ok: null`) significa que el
   navegador no pudo medir (no es culpa de la plantilla); `no_disponible` solo sale cuando la variable está vacía. Corre
   una verificación a la vez por sede. Hoy mide solo la carta y la tarjeta de plato (hasta 12 tarjetas).
4. Con la aprobación de la persona, `confirmar_cambio({"token":"…"})`. Con verificador configurado, un borrador que
   introduce o cambia una plantilla propia solo se confirma con la última verificación en verde; volver a fábrica o cambiar
   otras capas no la exige.

El mismo mecanismo sirve la vista previa del POS. Su pasarela de administrador prepara sin clave MCP y devuelve
solo el token público; guardar en POS conserva su autorización habitual. Contrato, endpoints y persistencia en el
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
