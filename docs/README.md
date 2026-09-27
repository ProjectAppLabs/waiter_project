# Contexto del proyecto

La [visión del producto](producto/vision.md) describe el destino del SaaS, incluidas IA,
pagos autónomos y facturación DIAN. El estado entregado se consulta en el
[README raíz](../README.md) y en los informes de revisión; una pantalla de diseño no
prueba que su integración externa exista.

## Arquitectura actual

- Odoo Community 19 es el motor operativo. `pos/` es nuestra interfaz para salón,
  cocina y administración; `registry/` resuelve restaurantes, sedes, mesas y credenciales.
- `experience/` es el backend del comensal y dueño de catálogo de plantillas, ajustes
  por sede, cuentas, carrito y confirmación. `diner/` renderiza los datos de esa API.
- La marca sigue en Odoo (Plan G); la plantilla elegida y su personalización viven en
  experience (Plan H). El POS escribe mediante una pasarela autorizada del addon.
- H tiene descuento real y pago simulado: confirma y manda a cocina, pero el cobro real
  sigue en el POS. No hay proveedor de OTP, pasarela móvil ni facturación DIAN integrada.

## Orden de lectura

La integración de WhatsApp comienza por el [puente de pedidos al POS](planes/2026-09-14-whatsapp-pos.md).
El [chat del menú](planes/2026-09-14-chat-menu.md) ya utiliza un núcleo de conversación compartido. Meta y la pasarela siguen pendientes.

1. [Arquitectura modular](arquitectura/2026-09-04-arquitectura-modular.md) y
   [API del bloque 3](arquitectura/2026-09-04-bloque-3-experiencia.md).
2. Planes A/B/C/E para operación; D/F para backend y PWA; G para marca.
3. [Plan H](planes/2026-09-05-plan-H-plantillas.md) y
   [decisión de propiedad de plantillas](decisiones/2026-09-05-plantillas-en-el-modulo-3.md).
4. [Revisión y evidencia del PR #14](revisiones/2026-09-05-cierre-H-pr14.md).
5. [Inventario del kit CloudPos frente al POS](diseno/2026-09-06-inventario-kit-cloudpos.md):
   rediseño del POS del operador; pantallas y textos del kit en `diseno/pos-kit/`.
6. [Plan I · Rediseño del POS sobre el kit](planes/2026-09-06-plan-I-rediseno-pos-kit.md) y su primera
   oleada ejecutable, [Plan I.1 · Sistema de diseño y armazón](planes/2026-09-06-plan-I1-sistema-de-diseno.md).

Los planes anteriores conservan instrucciones y supuestos históricos. Los ADR documentan
las decisiones de su fecha. `diseno/` contiene referencias visuales; promociones, tarjetas
guardadas, verificación real, facturas y sellos que aparezcan allí no deben presentarse como
servicios ya implementados. El contrato ejecutado de H prevalece para sus flujos demo.

- [Pagos Wompi dentro del menú: configuración, pruebas y conciliación](planes/2026-09-14-wompi.md)
- [Carta del comensal: saludo en la cabecera y tarjeta con el precio primero](decisiones/2026-09-14-carta-saludo-y-tarjeta.md)
- [Sistema de diseño del POS: la vista /kit y cómo extenderlo](diseno/2026-09-19-sistema-de-diseno-pos.md)
- [Reservas: el mismo plano, platos opcionales, costo y enlace de pago](decisiones/2026-09-19-reservas-mapa-anticipo-y-enlace-de-pago.md)
- [Horario de reservas: semanal, con franjas y fechas especiales](decisiones/2026-09-20-horario-de-reservas.md)
- [Inicio como tablero (atención, platos, predicción) y la caída de Administración](decisiones/2026-09-20-inicio-tablero.md)
- [Revisión del código con Codex: 14 hallazgos verificados, 7 arreglados](decisiones/2026-09-21-revision-con-codex.md)
- [¿Quitar el frontend de Odoo y meterlo dentro de Django? Análisis y hueco de seguridad del registro](arquitectura/2026-09-21-odoo-headless-y-django-orquestador.md)
- [MCP de Waiter: la IA configura el menú con una clave por restaurante](../experience/experience_app/mcp/README.md)
- [Traspaso a Codex (2026-09-24): estado, ramas, pendientes y entorno](traspaso/2026-09-24-traspaso-a-codex.md)
