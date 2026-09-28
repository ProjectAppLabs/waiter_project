# Decisión: una base de Odoo por organización y un `pos.config` por restaurante

- **Fecha:** 2026-09-28
- **Estado:** aceptada
- **Enmienda:** [una base de datos por restaurante](2026-09-04-multi-tenant.md), que sigue vigente **entre
  organizaciones**.
- **Inventario que la sustenta:** [inventario multirrestaurante](../inventario/2026-09-28-inventario-multirrestaurante.md)

## Contexto

ProjectApp vende Waiter como licencia al **dueño** (una organización, p. ej. KFC), que administra **todos sus
restaurantes**. La decisión de 2026-09-04 llamaba «inquilino» al restaurante y le daba a cada uno su base de Odoo.
Con un dueño de muchos restaurantes, eso obligaría a sincronizar el catálogo, los premios y los clientes entre
bases. Además, el dueño quiere **un catálogo maestro**, **un diseño del menú**, **premios que valen en todo el
grupo** y **un mismo NIT** para todos sus restaurantes.

## Decisión

- El **inquilino es la organización**. Cada organización tiene **su propia base de Odoo** con **una sola empresa**
  (`res.company`), y así conserva el aislamiento físico de la decisión anterior entre dueños distintos.
- Cada **restaurante** de la organización es **un `pos.config`**, con su almacén, sus pisos y mesas, su caja, sus
  métodos de pago, su numeración y su lista de empleados.
- El **catálogo, los impuestos, la marca, el programa de puntos y los clientes son de la empresa**, es decir, de la
  organización, y se comparten de forma nativa.
- El **registro** se lee así: `Restaurant` es la organización y `Venue` es el restaurante. Todas las `Venue` de una
  organización apuntan a la misma base, cada una con su `pos_config_id`. Las URL del menú `/<org>/<restaurante>/`
  no cambian.

## Por qué

Se comprobó en el código de Odoo 19 del contenedor que, dentro de **una sola empresa**, cada `pos.config` tiene de
forma nativa:
- **Pisos y mesas.** `pos.config.floor_ids`, y el POS solo carga los suyos (`pos_restaurant/models/pos_restaurant.py:25-26,116-117`).
- **Empleados.** `basic/advanced/minimal_employee_ids` (`pos_hr/models/pos_config.py:11-19`).
- **Almacén e inventario.** `picking_type_id` → `warehouse_id` (`point_of_sale/models/pos_config.py:76-82,180`).
- **Caja, sesiones, pedidos y secuencias.** `pos.session.config_id` es obligatorio y las secuencias son del config
  (`pos_config.py:97-100,572-601`).
- **Métodos de pago.** Un método de efectivo no se puede compartir entre configs (`pos_payment_method.py:220-228`).
- **Listas de precios y posiciones fiscales.** `pos_config.py:139-157`.
- **Programas de puntos y cupones.** Se limitan a algunos configs; si la lista está vacía, valen en todos
  (`pos_loyalty/models/loyalty_program.py:11-13`).
- **Informes por punto de venta.** `report/pos_order_report.py:36-38`.

La fuga que motivó la decisión anterior aparecía **entre empresas**: `restaurant.table` no tiene `company_id`. Entre
restaurantes de una misma empresa no hay fuga, porque cada `pos.config` tiene sus pisos.

## Consecuencias

**A favor:**
- El catálogo maestro es el catálogo normal de la empresa. Cada restaurante ajusta categorías visibles y precio.
- Los puntos y clientes del grupo son los de la empresa, sin sincronizar nada.
- El dueño ve todo con los informes nativos por punto de venta.

**En contra (asumido):**
- **Odoo no restringe a un usuario a un solo `pos.config`.** Sus reglas son solo multiempresa
  (`point_of_sale/security/point_of_sale_security.xml:46-79`). Hay que añadir un campo usuario ↔ config y `ir.rule`
  sobre `pos.config`, `pos.session`, `pos.order`, `report.pos.order` y los modelos propios.
- Meseros y cajeros pertenecen a **un solo restaurante**: el empleado gana su config y una regla lo impone.
- `pos_hr` deja entrar a todos los empleados de la empresa si `basic_employee_ids` está vacío, y añade a los gerentes
  del POS en todos los configs (`pos_hr/models/pos_config.py:22-34,78-85`). Hay que llenar siempre la lista y
  vigilar el rol de gerente.
- `available_in_pos` es global: «agotado en un restaurante» necesita un campo propio.
- Los impuestos son de la empresa: el régimen tributario se decide para toda la organización.
- Hay que corregir el código que hoy supone un solo `pos.config` por base. Está listado en el inventario.

## Fuera de esta decisión

La plataforma con muchas organizaciones: alta de bases, licencias y usuario de servicio con clave por organización
en el registro. Queda para la fase 2.
