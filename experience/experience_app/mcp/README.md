# MCP de Waiter

Servidor MCP para que un asistente de IA (Claude u otro cliente MCP) llene la configuración aburrida del restaurante.
v1 cubre el **diseño del menú** (colores, tipografía de títulos, saludo) y los **banners** del carrusel.

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
| `leer_diseno_menu` | Colores editables (con su uso), tipografía y las permitidas, saludo, logo y reglas de contraste |
| `preparar_diseno_menu` | Valida un cambio (colores, tipografía, saludo) y devuelve una vista previa y un token. **No guarda.** |
| `leer_banners` | Banners actuales, valores permitidos y límites de texto |
| `preparar_banners` | Valida la lista completa de banners en Odoo (`dry_run`) y devuelve una vista previa y un token. **No guarda.** |
| `listar_catalogo` | Productos y categorías con sus ids, para usarlos como destino de los banners |
| `confirmar_cambio` | Aplica un cambio preparado. El token es de un solo uso, caduca a los 30 minutos y solo sirve con la misma clave que lo preparó. |

Las reglas son las mismas del POS: `plantillas.services.validate` para el diseño y
`pos.config._waiter_clean_banners` para los banners. Las imágenes de los banners y el logo se siguen subiendo desde el
POS. Un banner puede conservar su imagen con `imagen_de_banner`.

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
