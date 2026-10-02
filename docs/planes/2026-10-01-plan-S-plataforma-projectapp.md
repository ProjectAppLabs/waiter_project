# Plan S · La plataforma de ProjectApp: muchos dueños, cada uno con su organización

**Qué.** Hoy Waiter sirve a una sola organización (Burger House, base `projectapp`) y crearla fue a mano. Este plan da a
ProjectApp su propio espacio para:

- dar de alta a un dueño nuevo;
- crear su organización sin tocar scripts ni DNS;
- registrar su plan, su precio y su estado;
- suspenderla si deja de pagar.

Los cobros y el panel de ventas de ProjectApp van en otra etapa. Las integraciones de pago siguen al final.

Decisiones del dueño (2026-10-01):

- **Una dirección por organización** (`burger-house.waiter.projectapp.co`), lo estándar en SaaS.
  - **No hay un Odoo por cliente.** Un solo Odoo atiende muchas bases, una por organización, en el mismo PostgreSQL;
    cada base pesa unos 54 MB (medido el 2026-09-04). Odoo elige la base por el subdominio.
  - **El DNS se configura una sola vez:** un registro comodín `*.waiter.projectapp.co` y un certificado comodín. Crear
    una organización no toca el DNS; los dominios propios por cliente quedan para después.
- **ProjectApp propone el usuario del dueño** desde su nombre. El dueño recibe el código y pone su contraseña, igual que
  hoy hace el dueño con su equipo.
- **Datos de la cuenta del cliente desde ya:**
  - plan y precio mensual;
  - estado (en prueba, activa o suspendida), y la suspensión bloquea la entrada;
  - límite de restaurantes;
  - datos legales (razón social, NIT y contacto de facturación).
- **Usuario de servicio por organización, ahora.** Se acaba el `admin` compartido entre servicios.

## Cómo está hoy (inventario del 2026-10-01)

- **Registro (`registry/`):**
  - `Restaurant` es la organización y solo guarda slug, nombre y marca: no hay plan, estado ni datos legales.
  - `Venue` es el restaurante y guarda `odoo_url`, `odoo_db`, `odoo_login` y `odoo_secret` (cifrado con Fernet).
  - `resolve` entrega esas credenciales con una sola clave compartida (`REGISTRY_INTERNAL_KEY`). En desarrollo el
    usuario es `admin`.
  - No hay admin de Django ni usuarios de ProjectApp.
- **Alta de una organización:** siete pasos a mano.
  1. Crear la base e instalar los addons.
  2. Sembrar el kit (`seed-kit.sh`), que deja a `admin` como dueño.
  3. Configurar el correo.
  4. Configurar impuestos y facturación de Colombia.
  5. Cargar los parámetros (`seed-menu-params.sh`).
  6. Registrar la organización y su primer restaurante (`seed_demo`).
  7. Por cada restaurante nuevo, `add_venue`: el que crea el dueño desde la consola no llega solo al registro.
- **POS:** fijado a una base al compilar (`NEXT_PUBLIC_ODOO_DB`) y a un solo `ODOO_ORIGIN`.
- **Odoo:** `dbfilter = ^projectapp$` y `list_db = False`. Solo atiende esa base.
- **Menú del comensal:** ya es por ruta (`/<org>/<restaurante>/`) y resuelve cada organización con el registro. No
  cambia.

## Fases

- **S1 · El registro como plano de control.**
  - `Restaurant` (la organización) gana:
    - `legal_name`, `tax_id` (NIT), `billing_email` y `billing_contact`;
    - `plan` y `monthly_price` (COP);
    - `status`: `provisioning`, `trial`, `active`, `suspended` o `failed`;
    - `trial_ends`, `max_restaurants`, `owner_name`, `owner_email` y `owner_username`.
  - **`PlatformUser`:** la gente de ProjectApp.
    - Entra con usuario o correo y contraseña, y se invita con un código de un solo uso, como en el plan P.
    - Roles: `admin` (todo) y `operador` (ve y da de alta, no suspende).
  - **API de la plataforma**, con sesión de `PlatformUser`, solo desde la consola de ProjectApp:
    - lista de clientes;
    - alta, edición de plan y datos;
    - suspender y reactivar;
    - reenviar la invitación del dueño;
    - restaurantes usados frente al límite.
  - **`PlatformAudit`:** quién hizo qué y cuándo.
- **S2 · Alta automática de una organización** (botón «Crear cliente»). Pasos idempotentes, cada uno con su estado, para
  reintentar desde donde falló:
  1. **Copiar la base plantilla** (`waiter_template`) a una base con el slug. La plantilla trae los addons instalados, el
     kit sembrado, impuestos y facturación de Colombia y el correo; se prepara una vez con un script.
  2. **Ajustar la empresa:** nombre, razón social y NIT.
  3. **Crear el usuario de servicio** (S3), con su clave cifrada en el registro.
  4. **Crear al dueño** (`owner`), con usuario propuesto y correo, y **enviarle la invitación** con el código.
  5. **Cargar los parámetros** de la organización: slugs, URL del menú y `projectapp.max_restaurants`.
  6. **Marcarla `trial` o `active`.**

  Además:
  - Los restaurantes que el dueño crea desde su consola se registran solos: Odoo avisa al registro con la clave de su
    organización. Se acaba el `add_venue` a mano.
  - **Límite de restaurantes:** Odoo no deja crear más de `projectapp.max_restaurants`; el registro lo actualiza si
    cambia el plan.
  - **Suspensión:**
    - Odoo rechaza la entrada a la organización («La cuenta de tu organización está suspendida; escribe a ProjectApp»).
    - `resolve` deja de entregar sus credenciales, así que el menú del comensal muestra «Este restaurante no está
      disponible».
    - Reactivar lo devuelve todo.
  - **`scripts/odoo-upgrade-all.sh`:** actualiza los addons en todas las bases de organización. Con muchas, actualizar a
    mano no escala.
- **S3 · Usuario de servicio por organización.**
  - Grupo `projectapp_ops.group_waiter_service` con exactamente lo que experience necesita: las 36 operaciones del
    inventario de 2026-09-21, más `waiter_deposit_paid` acotado.
  - Sin acceso al backend de Odoo, a la contabilidad ni a la gestión de usuarios.
  - Una clave distinta por organización. `resolve` entrega la del servicio, nunca la de `admin`.
  - Migración de Burger House al usuario de servicio.
- **S4 · Una entrada por organización.**
  - **Odoo:** `dbfilter = ^%d$` con `proxy_mode`; la base es el subdominio.
  - **El POS:**
    - lee el subdominio, busca la organización en el registro (con caché) y habla con su base;
    - el inicio muestra el nombre y la marca de la organización;
    - desaparece `NEXT_PUBLIC_ODOO_DB`.
  - **Subdominios reservados:** `plataforma`, `www`, `api`, `menu` y `admin`.
  - **Desarrollo:** `burger-house.localhost:3000` en el navegador de la máquina; los navegadores resuelven
    `*.localhost` solos. Para las tabletas de la LAN, una organización por omisión (`DEFAULT_ORG`), solo en desarrollo.
  - **Infraestructura** (documentada, una vez): el registro DNS comodín, el certificado comodín y el proxy, que bloquea
    `/web/database/*` y la interfaz de Odoo desde fuera.
- **S5 · Consola de ProjectApp** (`plataforma.waiter.projectapp.co`), con el mismo sistema de diseño de Waiter:
  - **Clientes:** tabla con organización, dueño, plan, precio mensual, estado, restaurantes usados frente al límite y
    fecha de alta. Ordenar y buscar como en las demás tablas.
  - **Nuevo cliente:** asistente con organización (nombre y slug, con la dirección que tendrá), datos legales, dueño
    (nombre, correo y usuario propuesto) y plan (precio, límite, prueba hasta). Muestra el avance del alta paso a paso.
  - **Ficha del cliente:** editar plan y datos, suspender o reactivar, reenviar la invitación, sus restaurantes y su
    historial de auditoría.
  - **Equipo de ProjectApp:** invitar y desactivar `PlatformUser`.
- **S6 · Verificación.**
  - Pruebas de registry, Odoo y POS.
  - **Recorrido en Chromium:**
    - ProjectApp da de alta «Frisby (demo)» desde la consola;
    - al dueño le llega el código, pone su contraseña y entra por `frisby.localhost:3000` a su consola vacía;
    - crea un restaurante, y el registro lo ve;
    - el tercero que pase su límite se rechaza.
  - **Aislamiento:**
    - con la clave de Frisby no se lee Burger House;
    - el POS de una organización no llega a la base de la otra;
    - un mesero de Burger House no entra por `frisby…`.
  - **Suspensión:** suspendida, nadie entra a su POS y su menú dice que no está disponible; al reactivar, vuelve.

## Fuera de este plan

- Cobrar a los clientes (Wompi o Bold para la suscripción de ProjectApp), facturarles y el panel de métricas del negocio.
- Dominios propios por cliente.
- Varios servidores de Odoo y réplicas.
- Pruebas de capacidad con cientos de bases.

## Reparto

| Parte | Quién |
|---|---|
| S1–S2 en el registro: modelos, API de la plataforma, auditoría y orquestador del alta, con pruebas | Codex (árbol aparte) |
| S2–S3 en Odoo: grupo y usuario de servicio, suspensión, límite de restaurantes, aviso al registro de restaurantes nuevos, migración, pruebas | Codex (en el mismo trabajo, después del registro) |
| Script de la base plantilla, `odoo-upgrade-all.sh`, configuración de Odoo (`dbfilter`, `proxy_mode`) | Claude |
| S4 en el POS: organización por subdominio, inicio con la marca de la organización | Claude |
| S5: consola de ProjectApp | Claude |
| S6: verificación en Docker y Chromium | Claude |

El contrato común (modelos, endpoints de la plataforma con sus JSON y métodos de Odoo) se escribe antes de lanzar a
Codex, como en los planes Q y R, para que el POS y la consola avancen en paralelo sin pisarse.

## Estado (2026-10-01)

**Superado.** El dueño decidió reemplazar Odoo por un sistema propio
([decisión](../decisiones/2026-10-01-sistema-propio-sin-odoo.md)). La plataforma de ProjectApp se construye en la
primera fase del [Plan T](2026-10-01-plan-T-sistema-propio.md), sin bases de Odoo por cliente ni usuarios de servicio.
