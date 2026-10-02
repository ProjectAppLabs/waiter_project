# Decisión: reemplazar Odoo por un sistema propio en Django

- **Fecha:** 2026-10-01
- **Estado:** aceptada
- **Reemplaza a:** [una base de Odoo por organización](2026-09-28-una-base-por-organizacion.md) y al
  [Plan S](../planes/2026-10-01-plan-S-plataforma-projectapp.md) (plataforma sobre Odoo), que quedan superados.
- **Análisis que la sustenta:** inventario del uso de Odoo del 2026-10-01 (resumido abajo) y
  [Odoo headless y Django orquestador](../arquitectura/2026-09-21-odoo-headless-y-django-orquestador.md), que ya decía
  que si Odoo dejaba de ser la fuente de verdad «sería otro producto».

## Contexto

Waiter iba a crecer a muchos dueños (organizaciones) que le pagan a ProjectApp. Sobre Odoo eso exigía una base por
cliente, una base plantilla, un usuario de servicio por cliente, elegir la base por subdominio y actualizar 99 módulos en
cada base con cada versión, además de la migración anual de Odoo. Antes de pagar ese costo, el dueño pidió medir cuánto
costaría dejar Odoo.

## Lo que medimos

- **De Odoo no usamos ninguna pantalla.** Nuestros 8 addons no definen ni una vista; Odoo es solo un motor con API.
- **El POS llama 96 operaciones distintas: 72 son nuestras (`waiter_*`) y 24 de Odoo** (crear pedidos, marcarlos
  pagados, abrir y cerrar caja, mover existencias, leer y escribir).
- **Código propio sobre Odoo:** 11.459 líneas de Python y 272 pruebas. Esas pruebas describen cómo funciona el
  producto y guían la reescritura.
- **Lo que Odoo calcula por nosotros** y hay que reescribir: pedidos y caja, catálogo y precios, impuestos de Colombia
  (usamos pocos), inventario y recetas, compras, fidelización, personas y acceso, avisos en vivo y correo,
  contabilidad (asientos del cierre, facturas del POS, notas crédito).
- **La factura electrónica DIAN no se pierde:** solo existe en Odoo Enterprise; ya estaba previsto un proveedor externo.
- **Lo que nos costaba Odoo:** en los últimos planes, media docena de fallos por su funcionamiento interno (rutas de
  solo lectura, facturas futuras en borrador, diferencia de caja en 0 antes del cierre, zona horaria, permisos de
  fabricación), 106 saltos de permisos (`sudo`) y 21 reglas de acceso para separar restaurantes.

## Decisión

- **Un solo sistema propio en Django** (el proyecto `experience`, que crece por apps de dominio), con **una sola base de
  datos** y cada organización separada por su identificador. Se actualiza una vez por versión.
- **Preparado para muchos dueños desde el primer día:** la plataforma de ProjectApp (dar de alta clientes, plan, estado,
  suspensión) es la primera fase, no un añadido.
- **La contabilidad y la factura DIAN van a un proveedor externo**, detrás de una interfaz nuestra; el sistema propio
  registra los documentos y los envía.
- **Burger House se migra de una sola vez** cuando el sistema propio cubra todo lo que hoy usa del POS y del menú.
- **El registro (`registry`) se funde en el sistema propio:** la organización y el restaurante viven allí.

## Por qué ahora

Hay un solo cliente. Cada semana sobre Odoo añade maquinaria que luego se tira. Si vamos a salir, el momento más barato
es este.

## Consecuencias

**A favor:**
- Una arquitectura, un lenguaje y un equipo de pruebas.
- Multiinquilino simple: una base, un identificador por fila, sin usuarios de servicio ni bases plantilla.
- Sin migraciones anuales de Odoo ni peleas con sus permisos.

**En contra (asumido):**
- **3,5 a 5 meses** sin funciones nuevas mientras se reconstruye.
- Se pierde lógica probada durante años (cierre de caja contable, plan de cuentas colombiano). La contabilidad pasa a
  un proveedor externo.
- Riesgo de reescritura: comportamientos implícitos que hay que redescubrir; las 272 pruebas de los addons son la red.

## Cómo se ejecuta

[Plan T](../planes/2026-10-01-plan-T-sistema-propio.md), por fases que entregan algo usable cada una, con Codex
(`gpt-6-astra`) construyendo el backend y Claude el POS, la consola y la verificación, contra un contrato escrito antes de
cada fase.
