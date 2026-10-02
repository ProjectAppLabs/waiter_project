# waiter_project — ProjectApp Smart Restaurant

SaaS para restaurantes que automatiza la atención en mesa: el comensal toca
un NFC, consulta la carta, conversa con un Mesero IA, pide, paga y recibe su
factura electrónica sin depender permanentemente de un mesero.

> **Opera más mesas con menos carga operativa.**

La descripción completa del producto está en
[`docs/producto/vision.md`](docs/producto/vision.md).

## Estado

Desde el 2 de octubre de 2026 Waiter corre sobre un sistema propio, sin Odoo ni el registro central (plan T). El
backend es `experience/` (Django 6 y DRF sobre MySQL 8.4, el estándar de los servidores de ProjectApp) y sirve:

- el POS del operador en `pos/` (salón, pedidos, cocina, caja, inventario, reservas e informes);
- la consola del dueño y la consola de ProjectApp (clientes, métricas, cobros y suspensión);
- el menú del comensal en `diner/` (carta, carrito compartido, pago demo y seguimiento).

Burger House se migró desde Odoo con `migrate_from_odoo` y se concilió con `reconcile_odoo`. El respaldo de la base y
los archivos de Odoo está fuera del repositorio. El estado vigente y la historia de cada fase están en
[`docs/planes/2026-10-01-plan-T-sistema-propio.md`](docs/planes/2026-10-01-plan-T-sistema-propio.md). Los planes y
revisiones anteriores describen la etapa con Odoo y quedan como historia.

- [Índice y contexto de documentación](docs/README.md); planes en `docs/planes/`.

## Estructura del repositorio

| Carpeta | Qué contiene |
|---|---|
| `pos/` | App Next.js del operador, la consola del dueño y la de ProjectApp. |
| `diner/` | App Next.js del comensal (Smart Menu). |
| `experience/` | Backend Django del sistema propio: API del POS (`/api/pos/v1/`), de la plataforma (`/api/platform/v1/`) y del comensal (`/api/v1/`). |
| `deploy/` | Despliegue de producción preparado (compose, Caddy con certificado comodín), sin aplicar. |
| `tools/` | Utilidades de diseño e imágenes (generador y cargador de fotos demo). |
| `assets/demo/` | Fotos del menú demo. |
| `scripts/` | `dev.sh` (levantar, revisar y detener todo) y demo del comensal por curl. |
| `docs/` | Visión, arquitectura, ADR (`decisiones/`), planes, diseño, QA y revisiones. Índice en [`docs/README.md`](docs/README.md). |

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
scripts/dev.sh down     # detiene todo (el contenedor de MySQL queda detenido, los datos intactos)
```

Es idempotente: lo que ya responde no se vuelve a lanzar. Registros y PID en `/tmp/waiter-dev/`. Los pasos manuales
de abajo son lo que hace el script, por si hace falta uno solo.

```bash
# MySQL del sistema propio (contenedor waiter-mysql, :3307; lo crea scripts/dev.sh, ver experience/.env.example)
# mysqlclient se compila: necesita build-essential, pkg-config y default-libmysqlclient-dev (o la rueda ya compilada)

# Backend (Python 3.12+)
cd experience && python3 -m venv venv && venv/bin/pip install -r requirements.txt \
  && cp .env.example .env && venv/bin/python manage.py migrate \
  && venv/bin/python manage.py runserver 192.168.56.10:8001 --noreload

# App del operador
cd pos && npm ci && npx next dev --hostname 192.168.56.10 --port 3000        # :3000

# App del comensal
cd diner && npm ci && npm run dev                                          # :3001 · /burger-house/poblado/t/<token>

# Recorrido del comensal por curl
scripts/demo-comensal.sh
```

**Pruebas:**

```bash
cd experience && venv/bin/pytest -q                                      # backend, sobre MySQL (test_waiter_core)
cd pos && npx tsc --noEmit && npx jest                                   # POS
cd pos && PLAYWRIGHT_CDP=http://127.0.0.1:9333 npx playwright test --project="Desktop Chrome"   # recorridos e2e
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
   registrar el pago en el sistema propio y emitir el evento para facturación. Verificación real
   del registro del comensal: demo solo verifica cuentas pendientes creadas desde la
   misma cookie, con caducidad y uso único; no recupera cuentas por correo. Registro,
   verificación y pago simulados se rechazan en producción.
2. Mesero IA sobre la API del bloque 3 (la PWA del comensal ya existe, Plan F;
   la marca se edita desde el POS, Plan G; las 30 plantillas de menú, pago y cuenta
   con almacén propio en el módulo 3, Plan H).
3. Fotos de portada del restaurante y varios idiomas del comensal (fuera del
   Plan G a propósito).
