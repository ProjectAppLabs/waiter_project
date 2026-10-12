# Plan IU · Inicio de sesión universal

**Fecha:** 2026-10-12 · **Rama:** `feat/12102026-inicio-universal` (sobre `feat/11102026-landing-legal-nav`) ·
**Pedido del dueño:** un solo inicio de sesión por donde entren todos (mesero, cajero, encargado, dueño o gente de
ProjectApp), que redirija al subdominio del cliente ya con la sesión iniciada.

## Decisiones

- **Dónde vive:** en el dominio base, `https://waiter.projectapp.co/login` (en desarrollo `http://localhost:3000/login`).
  La consola de ProjectApp sigue en `plataforma.waiter.projectapp.co` y cada organización en `<org>.waiter.projectapp.co`.
  Caddy deja de redirigir el dominio base a la consola.
- **La landing en la raíz del mismo dominio** (pedido del dueño): `waiter.projectapp.co` es la landing y
  `waiter.projectapp.co/login` el inicio universal. Son dos aplicaciones de Next («zonas»): la landing lleva
  `assetPrefix: '/_landing'` y Caddy le manda sus rutas (`/`, `/privacy`, `/terms`, `/data-deletion`, `/icon.svg`,
  `/img/*`, `/_landing/*`); lo demás va al POS. El service worker del POS no se registra en el dominio base (con
  alcance «/» tomaría las páginas de la landing) y quita el que hubiera.
- **Las sesiones siguen siendo de cada dirección** (cookies sin dominio compartido): lo que viaja entre direcciones es
  un **pase de un solo uso** (`accounts.LoginPass`, 2 minutos, solo su huella en la base). Va en el fragmento de la URL
  (`/entrar#pase=…&destino=pos|plataforma`), que el navegador no manda al servidor, y la página lo quita de la barra.
- **La misma persona en varias organizaciones** (el usuario y el correo son únicos por organización): el inicio busca
  la credencial en todas (hasta 10 identidades) y en ProjectApp, y pregunta a cuál entrar. Si viene del subdominio de
  una organización o del enlace de su invitación (`?org=`), entra directo a esa.
- **Lo que impide entrar se dice en el inicio común**, sin cambiar de dirección: organización suspendida y fuera de
  turno (con el aviso al dueño y los encargados, como antes).
- **Doble factor de ProjectApp** antes del pase: el desafío se resuelve en el inicio común.
- **Límite de intentos** (no existía): 10 fallos por usuario e IP, 30 por usuario y 50 por IP en 15 minutos → 429
  `too_many_attempts`. Aplica también a los inicios directos del POS y de la consola. La IP sale del primer valor de
  `X-Forwarded-For` (Caddy lo fija) o de la conexión.
- **Invitaciones y códigos** llevan al inicio universal (`POS_URL/login?codigo=<usuario>&org=<org>`). Con el mismo
  usuario en varias organizaciones, a cada una le llega su código y vale el de la cuenta cuyo código coincide; un código
  malo cuenta contra todas.
- **Desarrollo:** en una IP o en `localhost` a secas, la organización por omisión (`NEXT_PUBLIC_DEFAULT_ORG`) y la
  consola se abren en la misma dirección; las demás organizaciones, en `<org>.localhost:3000`.
- **Fuera de alcance:** volver a la pantalla que se estaba viendo antes de iniciar sesión.

## Contrato

- `POST /api/access/v1/login {login, password}` → `{destinations: [{kind: "pos", organization: {slug, name}, role,
  name, pass | error: {code, message, window?}} | {kind: "platform", role, name, pass | two_factor, challenge}]}`.
  Credencial mala (exista o no la cuenta): 401 `invalid_credentials`.
- `POST /api/access/v1/2fa {challenge, code}` → `{pass}`.
- `POST /api/access/v1/request_code {login}` y `POST /api/access/v1/activate {login, code, password}`.
- `POST /api/pos/v1/auth/pass {pass}` (con `X-Waiter-Org`) → la sesión del POS, como `auth/login`. 401 `invalid_pass`
  si venció, ya se usó o es de otra organización.
- `POST /api/platform/v1/auth/pass {pass}` → la sesión de la consola.

## POS

- `lib/domain/tenant.ts`: `centralHost`, `isCentralHost`, `isLocalHost`, `destinationOrigin`, `here` y `leaveTo`.
- `/login`: en el dominio base, el inicio universal (formulario, selector de destino, doble factor, código). En el
  subdominio de una organización o en la consola: con sesión lleva a su pantalla; sin ella, al inicio universal con el
  código de invitación, la organización (`org`) y el motivo del cierre (`motivo`).
- `/entrar`: cambia el pase con `authStore.enterPass` o `platformStore.enterPass` y sigue a `/login` (que lleva a cada
  quien a su pantalla o a elegir restaurante) o a `/plataforma`.
- La landing enlaza «Iniciar sesión» (navegación y pie) al inicio universal (`NEXT_PUBLIC_LOGIN_URL`).

## Estado

- **Hecho** (2026-10-12).
  - Django: 16 pruebas nuevas en `accounts/tests/test_inicio_universal.py`. POS: pruebas del login, de `/entrar`, de
    `tenant` y del `authStore`.
  - **Recorrido en Edge:** desde `frisby-74312.localhost:3000/login` sin sesión pasa al inicio universal con
    `?org=frisby-74312` y, al entrar, a `frisby-74312.localhost:3000/organizacion`; con la misma cuenta en Burger House
    y Frisby muestra el selector y entra a la elegida; `ana.projectapp` pasa el doble factor y llega a `/plataforma`;
    un pase inventado muestra el aviso y el botón para volver.
  - **Encontrado al probar:** en MySQL, Django borra en cascada poniendo antes la llave en NULL; la restricción del pase
    es «nunca las dos identidades» (no «exactamente una») para poder borrar personas con un pase pendiente.
  - Guías de QA 0, 1 (A-11 … A-13), 6 y 8 actualizadas.
  - **Landing en la raíz:** probado con la landing compilada para producción detrás de un Caddy local con el mismo
    bloque del `Caddyfile`: la raíz y las páginas legales salen de la landing con sus archivos en `/_landing`; `/login`,
    `/entrar` y `/_next` salen del POS; en Edge, «Iniciar sesión» de la landing abre el inicio universal en el mismo
    dominio.
