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
| `leer_design_system` | Esquema versionado, inventario de componentes/pantallas, tema actual y reglas |
| `describir_pantalla` | Secciones en orden, fundamentos, variantes disponibles y tema actual de una pantalla del inventario |
| `preparar_tema` | Mezcla los campos de `tema` enviados con lo guardado, valida y devuelve borrador, enlace y token de confirmación |
| `restablecer_tema` | Prepara volver `todo` o una `capa` (`fundamentos`, `variantes`, `distribucion`) a sus valores por defecto |
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
3. Mostrar `vista_previa` y abrir `url` (`/<rest>/<sede>/carta?borrador=<token-de-lectura>`).
4. Tras la aprobación de la persona, llamar `confirmar_cambio({"token":"<token-de-confirmación>"})`.

Los dos tokens son distintos. El público solo permite leer la instantánea validada durante 30 minutos; nunca devuelve
el token de confirmación ni la clave MCP. Revocar la clave, confirmar o alcanzar la caducidad retira el enlace.
No se permite editar derivados de color. La confirmación rechaza un borrador si otro editor cambió el tema entretanto;
hay que leer y preparar de nuevo. Preparar o restablecer no publica ni cambia los ajustes de la sede.

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
