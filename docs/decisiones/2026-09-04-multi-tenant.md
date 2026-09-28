# Decisión: una base de datos por restaurante

- **Fecha:** 2026-09-04
- **Estado:** aceptada; **enmendada el 2026-09-28** por [una base por organización](2026-09-28-una-base-por-organizacion.md): el inquilino es la organización (el dueño) y cada restaurante es un `pos.config` dentro de su base.
- **Contexto previo:** [spike de Odoo Community](2026-09-04-spike-odoo-community.md)

## Decisión

Cada restaurante (tenant) tiene **su propia base de datos de Odoo**. Se descarta
el modelo de una base compartida con multiempresa de Odoo.

## Por qué

### El aislamiento multiempresa de Odoo no cubre las mesas

`point_of_sale` declara reglas de registro multiempresa para `pos.order`,
`pos.order.line`, `pos.session`, `pos.config`, `pos.payment` y
`pos.payment.method`. Pero `pos_restaurant` **solo trae un
`ir.model.access.csv`, sin ninguna `ir.rule`**, y sus modelos no tienen campo
`company_id`:

```python
class RestaurantTable(models.Model):
    _name = 'restaurant.table'
    floor_id, table_number, shape, position_h, position_v,
    width, height, seats, color, parent_id, active
    # no hay company_id
```

**Comprobado empíricamente**, no deducido del código. Se crearon dos compañías
en una misma base y un usuario perteneciente solo a la primera:

```text
MARK_VE_MESA_AJENA     True
MARK_FLOORS_VISIBLES   ['Main Floor', ..., 'Piso Secreto R2']
```

El usuario del Restaurante 1 ve el piso y las mesas del Restaurante 2.

Es el mismo patrón que el otro hallazgo del spike: el endpoint público de
self-order devuelve los `identifier` de las 25 mesas del local. **Odoo modela las
mesas como mobiliario de una empresa única, no como datos de un inquilino.**

### El costo de la alternativa es bajo

Medido en la instancia real:

| Métrica | Valor |
|---|---|
| Base limpia (sin datos demo, 69 módulos) | **54 MB** |
| Base con datos demo | 75 MB |
| RAM del contenedor Odoo | 472 MB |

A 54 MB por inquilino, **500 restaurantes son ~30 GB de Postgres**. Con el precio
objetivo ($399.000–$599.000 COP/mes/sede) el número de inquilinos se cuenta en
cientos, no en decenas de miles.

## Consecuencias

**A favor:**

- Aislamiento **físico**. No depende de que nadie escriba bien una `ir.rule`.
- Backup, restauración y migración independientes por cliente.
- Un cliente que se va se lleva su base; no hay que extraer sus filas de nada.
- No hay que auditar los 685 módulos buscando modelos sin `company_id`, ni
  repetir esa auditoría en cada actualización de Odoo.

**En contra (asumido conscientemente):**

- Las migraciones corren N veces. Hace falta orquestación de despliegues.
- Se necesita un script de aprovisionamiento de inquilinos.
- El arranque en frío de una base sin uso reciente tiene latencia (Odoo mantiene
  los registros en memoria con expulsión LRU).

## Base de referencia del inquilino

### 1. Crear con el mínimo

```bash
odoo -d <tenant> --db_host db -r odoo -w odoo \
  -i point_of_sale,pos_restaurant,l10n_co,l10n_co_pos,projectapp_pos_design,projectapp_kitchen,projectapp_ops \
  --without-demo=all --load-language=es_CO --stop-after-init
```

Solo cuatro módulos semilla. `pos_self_order` y las pasarelas de pago **no se
piden**: el bloque 3 habla con Odoo por su API externa y emite sus propios
tokens de mesa.

### 2. Limpiar el ruido auto-instalado

Odoo instala solo todos los módulos con `auto_install=True` cuyas dependencias
estén satisfechas. Son 24 que no aportan nada al producto y ensucian la interfaz:

```text
snailmail, snailmail_account, sms, stock_sms, google_gmail, microsoft_outlook,
web_unsplash, mail_bot, spreadsheet, spreadsheet_dashboard,
spreadsheet_account, spreadsheet_dashboard_account,
spreadsheet_dashboard_stock_account, privacy_lookup, auth_passkey,
auth_passkey_portal, auth_totp, auth_totp_mail, auth_totp_portal,
account_add_gln, account_edi_ubl_cii, base_install_request, resource_mail,
api_doc
```

**Dos que NUNCA se desinstalan**, pese a llegar por la misma vía:

- **`rpc`** — provee `/xmlrpc` y `/jsonrpc`. Es la API externa de la que depende
  todo el bloque 3. Quitarlo mata la integración.
- **`base_import`** — importación de CSV, necesaria para cargar la carta.

### 3. Reiniciar el worker

Obligatorio tras cargar el idioma: `env.lang` es un `cached_property` y el
proceso en marcha no ve el idioma nuevo, lo que hace fallar los pedidos con
`Invalid language code`.

### 4. Configurar la compañía

País Colombia, plan contable `co`, moneda COP, idioma `es_CO` en la compañía y
en el usuario administrador.

### 5. Ocultar los menús que no aportan

Los módulos estructurales no se pueden desinstalar, pero sus menús sí se
ocultan. Se desactivan estos `ir.ui.menu` raíz:

```python
OCULTAR = [
    'mail.menu_root_discuss',      # Conversaciones
    'contacts.menu_contacts',      # Contactos
    'utm.menu_link_tracker_root',  # Rastreador de enlaces
    'base.menu_tests',             # Pruebas
    'base.menu_management',        # Aplicaciones
    'account.menu_finance',        # Facturación
    'stock.menu_stock_root',       # Inventario
]
for xml_id in OCULTAR:
    env.ref(xml_id).active = False
```

Quedan visibles **dos: Punto de venta y Ajustes.** Dentro de Punto de venta:
Tablero, Órdenes, Productos, Reportes y Configuración.

**Odoo se usa solo como motor de POS.** Contabilidad, inventario, CRM y demás no
forman parte del producto; si más adelante hacen falta, se desarrollan o se
habilitan entonces.

Ocultar no es desinstalar: **la maquinaria de abajo sigue operando.** Verificado
tras ocultar los menús — 384 cuentas contables, 58 impuestos y 7 diarios siguen
vivos, de modo que cada pedido del POS calcula impuestos y genera sus asientos y
movimientos de inventario con normalidad. Simplemente no se ven.

Ocultar `base.menu_management` **elimina la instalación de módulos desde la
interfaz**. Es deliberado: en un SaaS el restaurante no debe instalar nada y el
aprovisionamiento va por script. Es reversible poniendo `active = True` desde el
shell.

### Resultado verificado

| | Antes | Después |
|---|---|---|
| Módulos instalados | 69 | **45** |
| Menús raíz visibles | 9 | **2** |
| Cuentas contables | — | 384 |
| Datos de demostración | ninguno | ninguno |

### Lo que no se puede quitar

Las 6 apps del menú son irreducibles en Community:

| App | Por qué se queda |
|---|---|
| Punto de Venta, Restaurante | Son el núcleo del producto |
| Facturación (`account`) | `point_of_sale` depende de `stock_account` |
| Inventario (`stock`) | Misma cadena |
| Conversaciones (`mail`) | Odoo entero está acoplado a `mail` |
| Contactos | Lo exige `l10n_latam_base`, que exige `l10n_co` |

Siete módulos vuelven solos por `auto_install` aunque no se pidan
(`pos_self_order`, `account_payment`, `payment`, `utm`, `link_tracker`,
`pos_online_payment`, `pos_online_payment_self_order`). **No aparecen en el menú
y no estorban**; pelearse con el `auto_install` de Odoo no compensa.

Si en el futuro hiciera falta reducir más lo que ve el personal, la herramienta
correcta son los grupos de acceso —ocultar menús—, no desinstalar módulos.

### Correo saliente

Tras crear la base: `odoo/provisioning/configure-mail.sh <db>` lee `SMTP_*` de
`compose/.env` y deja el servidor de correo y `mail.default.from` listos para
las invitaciones de usuarios.

## Pendiente

- Script de aprovisionamiento automatizado (crear base, configurar compañía,
  sembrar mesas y carta).
- Estrategia de migraciones sobre N bases.
- Medir cuántas bases activas aguanta un worker de Odoo antes de que la
  expulsión LRU empiece a doler.
