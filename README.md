# waiter_project — ProjectApp Smart Restaurant

SaaS para restaurantes que automatiza la atención en mesa: el comensal toca
un NFC, consulta la carta, conversa con un Mesero IA, pide, paga y recibe su
factura electrónica sin depender permanentemente de un mesero.

> **Opera más mesas con menos carga operativa.**

La descripción completa del producto está en
[`docs/producto/vision.md`](docs/producto/vision.md).

## Estado

> **Desde el 2 de octubre de 2026 Waiter no usa Odoo ni el registro** (plan T): el sistema propio en `experience/`
> (Django y PostgreSQL) sirve el POS, la consola del dueño, la consola de ProjectApp y el menú del comensal. Lo que sigue
> en esta sección describe la etapa anterior; el estado vigente está en
> [`docs/planes/2026-10-01-plan-T-sistema-propio.md`](docs/planes/2026-10-01-plan-T-sistema-propio.md).

- **Odoo Community 19** evaluado y adoptado como motor operativo *headless*
  (POS, catálogo, impuestos, contabilidad). Una base por restaurante. Nadie
  usa su interfaz.
- **`pos/`**: app Next.js del operador. Plano de salón y toma de pedido
  funcionan de punta a punta contra Odoo real (login, catálogo, pedido en
  mesa, envío a cocina, cobro), con contratos y E2E verdes.
- **KDS de cocina** (`/kds` en `pos/`) sobre los cursos de Odoo con el addon
  propio `projectapp_kitchen` (listo / entregado / estación). Plan B.
- **`registry/`**: registro central mínimo (restaurantes, sedes, tokens de
  mesa únicos, credenciales cifradas) con resolución interna.
- **`experience/`**: backend del bloque 3. Carta desde caché, sesión de mesa
  con comensales por cookie, carrito compartido con atribución por persona,
  confirmación idempotente hacia Odoo y estado del pedido. Plan D.
- **Backoffice del operador** en `pos/`: operación en vivo (1e), ROI (1d),
  ventas, catálogo, inventario, clientes, facturación normal y configuración.
  Plan C. Sonidos del sistema Waiter sintetizados en el navegador.
  **Configuración › Marca** (Plan G, solo administradores): logo, color de
  acción, tipografía, redondeo, lema, saludo, nombre del mesero IA y
  bienvenida; se guarda en Odoo (`res.company`, addon `projectapp_ops`) y el
  registro conserva el valor inicial del onboarding como fallback.
- **`diner/`**: la app del comensal (PWA móvil, marca del restaurante). Solo
  habla con `experience/`; nada suyo toca Odoo ni `pos/`. Plan F. La marca
  que pinta la sirve `experience/` (Odoo > registro, caché
  `BRAND_CACHE_SECONDS`, 60 s por defecto en `experience/.env`).
- **Plan H / PR #14**: 30 plantillas con catálogo y ajustes por sede en `experience/`,
  galería y personalización desde el POS, motor del comensal y pago/registro demo.
  La revisión añade verificación ligada a cookie, reserva atómica del descuento,
  subtotales coherentes en Odoo y confirmación antes del pago con importe del servidor.
  [Estado y evidencia del cierre](docs/revisiones/2026-09-05-cierre-H-pr14.md).
- [Índice y contexto de documentación](docs/README.md); planes en `docs/planes/`.

## Estructura del repositorio

| Carpeta | Qué contiene |
|---|---|
| `pos/` | App Next.js del operador (salón, pedidos, cocina, caja, backoffice). |
| `diner/` | App Next.js del comensal (Smart Menu). |
| `experience/` | Backend Django del comensal (API `/api/v1/`). |
| `registry/` | Registro central Django (restaurantes, sedes, tokens, credenciales). |
| `odoo/` | Addons propios, compose y aprovisionamiento de Odoo 19. |
| `tools/` | Utilidades de diseño e imágenes (generador y cargador de fotos demo). |
| `assets/demo/` | Fotos del menú demo. |
| `scripts/` | `dev.sh` (levantar/revisar/detener todo), pruebas de Odoo y demo por curl. |
| `docs/` | Visión, arquitectura, ADR (`decisiones/`), planes, diseño y revisiones. Índice en [`docs/README.md`](docs/README.md). |

Las capturas y referencias visuales viven en `docs/diseno/`, no en `public/`, para
no publicarlas con las apps.

## Flujo de ramas

`main` es la única rama de larga vida. Cada trabajo sale de `main` en
`feat/DDMMYYYY-tema`, entra por PR y la rama se borra al fusionarse. No se
encadenan ramas de funcionalidad unas sobre otras.

## Levantar el entorno de desarrollo

Todo escucha en la interfaz host-only `192.168.56.10` (el navegador corre en
la anfitriona).

**Un solo comando** (con las dependencias ya instaladas):

```bash
scripts/dev.sh up       # arranca lo que falte, en orden, y espera a que cada servicio responda
scripts/dev.sh status   # qué está arriba, con un chequeo real de cada uno
scripts/dev.sh down     # detiene todo (los contenedores quedan detenidos, los datos intactos)
```

**Pruebas de los addons de Odoo**, sobre una copia desechable de la base de desarrollo:

```bash
scripts/odoo-test.sh projectapp_ops,projectapp_reservations   # todas
scripts/odoo-test.sh projectapp_ops TestFloorPlan              # una clase
```

No las corras a mano con `odoo --test-enable` sobre la copia: sin `--db-filter` el Odoo de desarrollo cierra la sesión
de las pruebas HTTP y fallan por eso, no por el código. El script lo encapsula, borra la copia al terminar, revisa el
disco antes y falla si no corrió ninguna prueba.

Es idempotente: lo que ya responde no se vuelve a lanzar. Lanza cada Django desde
su carpeta (su base sqlite es una ruta relativa) y avisa si encuentra un
`db.sqlite3` en la raíz. Registros y PID en `/tmp/waiter-dev/`. Los pasos
manuales de abajo son lo que hace el script, por si hace falta uno solo.

```bash
# Odoo (motor POS) — addons propios: projectapp_pos_design, projectapp_kitchen, projectapp_ops
docker compose -p odoo-spike -f odoo/compose/docker-compose.yml up -d        # :8069

# App del operador (salón, pedido, KDS)
cd pos && npm ci && npx next dev --hostname 192.168.56.10 --port 3000        # :3000

# Registro central y bloque 3 (Python 3.12+, venv por servicio)
cd registry && python3 -m venv venv && venv/bin/pip install -r requirements.txt \
  && cp .env.example .env && venv/bin/python manage.py migrate && venv/bin/python manage.py seed_demo \
  && venv/bin/python manage.py runserver 192.168.56.10:8002
cd experience && python3 -m venv venv && venv/bin/pip install -r requirements.txt \
  && cp .env.example .env && venv/bin/python manage.py migrate \
  && venv/bin/python manage.py runserver 192.168.56.10:8001

# App del comensal
cd diner && npm ci && npm run dev                                          # :3001 · /burger-house/poblado/t/<token>

# Recorrido del comensal por curl (mesa 8 de la demo)
scripts/demo-comensal.sh
```

- **POS cerrado (Plan E)**: cobro completo (pagos mixtos, datáfono manual, propina,
  dividir, recibo), caja con arqueo, roles (mesero / cajero / administrador),
  buscar plato, nota a cocina, fotos, buscar mesa. `pos/` es PWA instalable.

## Menú actual · Smart Menu

La carta pública usa un único diseño adaptado del kit Figma entregado: menú, detalle, carrito, seguimiento, perfil, favoritos personales e historial. En el POS se personaliza desde **Configuración → Diseño del menú**: colores, tipografía y logo. La galería de 30 plantillas queda como antecedente del Plan H.

[Alcance, activación y pruebas](docs/decisiones/2026-09-12-smart-menu.md). Registro por código y pago en línea continúan en modo demo; los pedidos sí llegan al POS real.

## Próximos pasos

Ya está disponible la [primera integración de WhatsApp al POS](docs/planes/2026-09-14-whatsapp-pos.md):
API interna para cotizar pedidos para recoger y confirmarlos en cocina sin cobrar,
con referencia idempotente. En desarrollo hay una comanda `WhatsApp · Demo WhatsApp`
para revisar en Pedidos. La conexión a Meta y el agente conversacional son el siguiente corte;
la pasarela se incorporará después.

1. Pasarela de pago en el bloque 3: hoy el pago del comensal está maquetado
   (`pago/simulado/`, insignia «Demo · sin cobro real»); al `pago aprobado`,
   registrar el pago en Odoo y emitir el evento para facturación. Verificación real
   del registro del comensal: demo solo verifica cuentas pendientes creadas desde la
   misma cookie, con caducidad y uso único; no recupera cuentas por correo. Registro,
   verificación y pago simulados se rechazan en producción.
2. Mesero IA sobre la API del bloque 3 (la PWA del comensal ya existe, Plan F;
   la marca se edita desde el POS, Plan G; las 30 plantillas de menú, pago y cuenta
   con almacén propio en el módulo 3, Plan H).
3. Fotos de portada del restaurante y varios idiomas del comensal (fuera del
   Plan G a propósito).
