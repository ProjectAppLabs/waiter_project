# Contexto del proyecto

La [visión del producto](producto/vision.md) describe el destino del SaaS, incluidas IA,
pagos autónomos y facturación DIAN. El estado entregado se consulta en el
[README raíz](../README.md) y en los informes de revisión; una pantalla de diseño no
prueba que su integración externa exista.

## Arquitectura actual

- `experience/` es el sistema propio: Django y DRF sobre MySQL 8.4. Contiene organizaciones,
  acceso, catálogo, inventario, salón, pedidos, cocina, caja, fidelización, reservas e informes,
  además de la experiencia del comensal y el diseño de su menú.
- `pos/` es la aplicación Next.js del operador y contiene las consolas del dueño y de
  ProjectApp. Habla con las APIs propias del POS y de la plataforma; `diner/` sirve el menú
  del comensal y habla con la API de `experience/`.
- La organización y sus restaurantes se resuelven en el sistema propio. La marca, las
  plantillas y sus ajustes viven allí; los eventos en vivo llegan por SSE desde Django.
- Odoo y `registry/` se retiraron después de migrar y conciliar Burger House. El cliente de
  migración que queda en `tenancy/odoo_migration/` conserva esa historia, no es el motor operativo.
- La implementación de una integración no acredita su activación externa: el menú conserva
  pagos demo y las credenciales, pruebas de proveedor y habilitación real se documentan por separado.

El [Estado del plan T](planes/2026-10-01-plan-T-sistema-propio.md#estado) es la fuente de
verdad para el corte, MySQL y el acceso actual. El [README raíz](../README.md) describe el
entorno de desarrollo; [deploy/README.md](../deploy/README.md), el despliegue preparado.

## Guía de QA

La guía para el equipo de QA vive en [`docs/qa/`](qa/guia-qa-00-indice.md): un índice con lineamientos y datos de
prueba y una guía por rol (acceso, mesero, cajero, cocina, encargado, dueño, comensal y ProjectApp). Es un documento
vivo: cada plan que se termina añade o corrige casos. Se publica en el gestor de documentos de ProjectApp, carpeta
«Waiter SaaS / QA» (documentos 218 a 226).

## Orden de lectura

**Sistema vigente:** empezar por el [plan T](planes/2026-10-01-plan-T-sistema-propio.md),
sus contratos y su Estado. Un dueño puede operar muchos restaurantes dentro de su organización;
la base propia identifica la organización y la sede de los datos.

**Integraciones pendientes para un sprint propio al final:** autenticación con la API de WhatsApp (también para el
asistente), Bold, Wompi real y una IA de decisiones de código abierto para guiar a las personas. Ver el [sprint de integraciones pendientes](planes/2026-09-28-sprint-integraciones-pendientes.md).

La integración de WhatsApp comienza por el [puente de pedidos al POS](planes/2026-09-14-whatsapp-pos.md).
El [chat del menú](planes/2026-09-14-chat-menu.md) ya utiliza un núcleo de conversación compartido. Meta y la pasarela siguen pendientes.

**Antecedentes de arquitectura y diseño:** los siguientes documentos explican decisiones
de su fecha. Las referencias a Odoo, `registry/` y `pos.config` son históricas. El
[Plan O](planes/2026-09-28-plan-O-multirrestaurante.md), su
[inventario](inventario/2026-09-28-inventario-multirrestaurante.md) y la
[decisión de una base Odoo por organización](decisiones/2026-09-28-una-base-por-organizacion.md)
preceden al sistema propio. `docs/traspaso/` conserva los traspasos de esa etapa.

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
- [Tema del menú v2 (Plan J2–J5): contrato, variantes, borradores, página viva y compatibilidad](../experience/experience_app/diseno/README.md)
- [Cierre de J3: variantes, pruebas y evidencia visual](revisiones/2026-09-24-plan-j3.md)
- [J4: herramientas MCP, borradores y verificaciones](revisiones/2026-09-25-plan-j4.md)
- [J5: página viva del sistema de diseño, contrato público y verificación en navegador](revisiones/2026-09-25-plan-j5.md)
- [Inventario de pantallas y componentes del menú del comensal: base del Plan K](inventario/2026-09-25-inventario-menu-comensal.md)
- [Plan K: plantillas HTML por componente con datos y design system siempre enlazados](planes/2026-09-25-plan-K-plantillas-por-componente.md)
- [Decisión: plantillas HTML restringidas por componente](decisiones/2026-09-25-plantillas-html-restringidas-por-componente.md)
- [Plan K · cierre: verificador obligatorio, navegador permanente y cobertura](planes/2026-09-26-plan-K-cierre-verificador-obligatorio-y-cobertura.md)
- [Traspaso a Codex del cierre del Plan K (paquetes A y E)](traspaso/2026-09-26-traspaso-codex-plan-k-cierre.md)
- [Traspaso de J4: estado y cierre local](traspaso/2026-09-25-j4-estado-y-cierre.md)
- [Traspaso a Codex (2026-09-24): estado, ramas, pendientes y entorno](traspaso/2026-09-24-traspaso-a-codex.md)
