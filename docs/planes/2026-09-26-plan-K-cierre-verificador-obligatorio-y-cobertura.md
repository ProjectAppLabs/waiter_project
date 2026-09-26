# Plan K · Cierre: verificador obligatorio, navegador permanente y cobertura de componentes

**Meta.** Que el MCP pueda personalizar el HTML de cada componente del menú (nunca el CSS libre: solo utilidades `ds-*`)
resguardando siempre los datos y variables del contrato, y que **un navegador Chromium verifique siempre** que el diseño no
se desborda antes de publicarse. K1–K5 dejaron el lenguaje, el validador, el renderizador, las herramientas MCP, la galería
y ocho componentes plantillables ([plan K](2026-09-25-plan-K-plantillas-por-componente.md)). Quedan cuatro huecos.

## Paquetes de trabajo

Cada paquete es una rama sobre `feat/25092026-plan-k1-contrato-plantillas`, con pruebas, documentación y un commit por
paquete. Tocan archivos distintos para que Codex y Claude avancen en paralelo sin conflictos.

| Paquete | Qué | Quién | Archivos |
|---|---|---|---|
| **A. Verificador obligatorio** | Modo estricto y camino del POS | Codex | experience `diseno/borradores.py`, `diseno/views.py`, `urls`, `mcp/tools.py`, `settings.py`, pruebas en `tests/diseno/`; addon `controllers/admin.py`; POS `lib/services/menuTemplates.ts` |
| **B. Navegador permanente** | Edge + puente como servicios y `.env` de experience | Dueño (Claude prepara los archivos) | `scripts/`, `~/.config/systemd/user/`, tarea de Windows, `experience/.env` |
| **C. Recorridos** | Componente `recorrido` plantillable en 9 pantallas | Claude | diner `components/smart/*.tsx` (SmartPassword, SmartEntry, SmartFeedback, SmartBenefits, SmartJourneys, FirstVisitIntro), `componentes/recorrido.json`, página viva, verificador |
| **D. Más componentes** | buscador, categorías, sección, resumen del pedido, cupón, perfil, saldo de puntos, banner de recompensa | Claude | diner `components/smart/*.tsx`, `componentes/<id>.json`, página viva |
| **E. Verificación en segundo plano** | `verificar_borrador` responde `en_curso`; el resultado llega solo | Codex | experience `diseno/borradores.py`, `mcp/tools.py`, `mcp/models.py` (+ migración), pruebas |

A y E son de backend Python y comparten `borradores.py`: Codex los hace en serie (A primero). C y D son de frontend y
comparten `samples.tsx` e `inventario.json`: Claude los hace en serie (C primero). Ningún archivo está en dos columnas.

### A. Verificador obligatorio (Codex)

Hoy, con `DESIGN_VERIFIER_CMD` vacío, `verificar_borrador` responde `no_disponible` y `confirmar_cambio` deja pasar la
plantilla. Y el POS puede guardar por `PUT /internal/v1/<rest>/<sede>/menu/` sin verificación.

1. `DESIGN_VERIFIER_REQUIRED` (por defecto `true`): con él, cualquier borrador que introduzca o cambie una plantilla propia
   solo se confirma con la última verificación `ok: true`. Sin verificador configurado o con `estado: error`, confirmar
   responde un error que lo explica. `false` conserva el comportamiento actual para desarrollo sin navegador.
2. El PUT interno rechaza cambios en `tema.componentes` (400 con mensaje) salvo que lleve `borrador=<token público>` de un
   borrador de la misma sede, vigente, con verificación en verde y cuyo tema coincida con lo que se guarda. Añadir
   `POST /internal/v1/<rest>/<sede>/menu/borradores/<token>/verificar/` (misma clave interna; ejecuta `borradores.verify`).
3. Odoo: acciones `verify {borrador}` y `set` con `borrador` en `/waiter/admin/menu_settings`. POS: `gateway('verify', …)`
   y enviar `borrador` al guardar cuando el tema trae plantillas (el POS aún no las edita; dejar el servicio listo).
4. Pruebas: modo estricto bloquea sin verificador, con error y con problemas, y confirma en verde; el PUT sin `borrador`
   rechaza plantillas y las acepta con un borrador verificado; el POS reenvía `borrador`. Prueba de Odoo con `requests`
   parcheado como en `test_menu_settings.py`.
5. Documentar en `diseno/README.md`, `mcp/README.md` y el README del addon.

Criterio de aceptación: con `DESIGN_VERIFIER_REQUIRED=true` no existe ningún camino (MCP ni POS) que publique una
plantilla propia sin una verificación en verde de ese mismo borrador.

### B. Navegador permanente en esta máquina (dueño; Claude prepara)

En WSL no arranca Chrome de Linux y no hay sudo, así que el Chromium es el Edge de Windows por CDP más un puente TCP.
Para que esté siempre:

1. `scripts/verificador/puente.js` (127.0.0.1:3001 → `WAITER_HOST`:3001) y unidad `waiter-puente.service` de systemd de
   usuario, con `Linger` como `waiter-dev`.
2. Tarea de Windows «WSL Waiter Edge» (Programador de tareas, al iniciar sesión) que lance
   `msedge.exe --headless=new --remote-debugging-port=9333 --remote-debugging-address=127.0.0.1 --user-data-dir=C:\Users\Public\waiter-edge-test about:blank`.
3. En `experience/.env`: `DESIGN_VERIFIER_CMD=node /home/cerrotico/work/waiter_project/diner/scripts/design-system/verificar-borrador.cjs`,
   `CDP_URL=http://127.0.0.1:9333`, `DINER_URL=http://localhost:3001`, y reiniciar `waiter-dev`.
4. En producción (Linux): `npx playwright install --with-deps chromium` en la imagen de experience y el mismo comando sin
   `CDP_URL`; el script lanza Chromium solo.

Criterio: `verificar_borrador` por MCP devuelve `ok`/`problemas` sin intervención manual, también tras reiniciar el equipo.

**Estado de B (2026-09-26).** Hecho: `scripts/verificador/puente.js` y la unidad `scripts/verificador/waiter-puente.service`
(instalación en su cabecera: copiar a `~/.config/systemd/user/` y `systemctl --user enable --now waiter-puente`); la tarea
de Windows «WSL Waiter Edge» registrada (Programador de tareas, al iniciar sesión, estado Ready); `DESIGN_VERIFIER_CMD`,
`CDP_URL`, `DINER_URL` y `DESIGN_EVIDENCE` en `experience/.env`. La unidad está instalada y activa (`systemctl --user status waiter-puente`; systemd
no carga nvm, por eso lleva la ruta absoluta de node). Queda para el dueño `hostAddressLoopback=true` bajo `[wsl2]` en
`%USERPROFILE%\.wslconfig` seguido de `wsl --shutdown` (cierra todas las sesiones de WSL; hacerlo con calma).

Ojo con la IP: los `.env` locales (`experience/.env`, `registry/.env`, `diner/.env.local`, `pos/.env.local`) fijan la IP de la
máquina en la LAN (`REGISTRY_URL`, `EXPERIENCE_ORIGIN`, `ODOO_ORIGIN`, `ALLOWED_HOSTS`, `CORS`). El 2026-09-26 el DHCP cambió
192.168.1.13 por 192.168.1.8 y los servicios dejaron de encontrarse (503 en experience, comensal sin API). Reserva la IP en
el router o, tras un cambio, actualiza esas líneas y reinicia con `scripts/dev.sh down && scripts/dev.sh up`.

### C. Recorridos (Claude)

Extraer un componente `Recorrido` (ilustración `sm-orbit-hero`, título, texto, pie con una o dos acciones, puntos de
diapositiva opcionales) de las 9 pantallas que hoy lo arman a mano: cuenta lista, canal, correo, éxito al restablecer,
ubicación (pasos manual, detalle y rescan), éxito de la opinión, celebración de pago e introducción. Contrato
`recorrido.json`: datos `recorrido.titulo`, `recorrido.texto`, `recorrido.paso` (numero), `recorrido.pasos` (numero);
ranuras `ilustracion` (obligatoria), `titulo`, `texto`, `acciones` (obligatoria), `puntos`. La plantilla de fábrica
reproduce el diseño actual en las 9 pantallas (prueba por pantalla). Muestra en la página viva, `data-componente`,
verificador (la página viva basta: no requiere sesión).

### D. Más componentes (Claude)

En este orden, cada uno con contrato, cuerpo extraído, plantilla de fábrica idéntica, muestra y pruebas: `buscador`,
`categorias`, `seccion` (encabezado de sección), `resumen` (totales del pedido), `cupon`, `perfil`, `saldo-puntos`,
`banner-recompensa`. Los que no tienen sesión se verifican en la página viva; el resumen y el cupón también.

### E. Verificación en segundo plano (Codex, después de A)

`verificar_borrador` lanza la verificación en un hilo del proceso (o una cola si la hay) y responde `estado: en_curso`
con `borrador`; el resultado se guarda en `McpPendingChange.payload['verificacion']` como hoy. Llamadas repetidas mientras
corre devuelven `en_curso`; al terminar, `ok`/`problemas`/`error`. Conserva el cerrojo por sede y el tiempo máximo.
Pruebas con un verificador falso que tarda.

## Orden y estado

1. A y C en paralelo → 2. B (dueño) y D → 3. E.

**Estado (2026-09-26):** plan escrito. **C hecho** (rama `feat/26092026-plan-k-c-recorridos`): componente `Recorrido`
(`diner/components/smart/Recorrido.tsx`) en las nueve pantallas, contrato `componentes/recorrido.json` (datos
`recorrido.titulo/texto/paso/pasos/ilustrado`; ranuras `ilustracion`, `cuerpo` y `acciones` obligatorias, `puntos`, `titulo`,
`texto`), muestra en la página viva, inventario, verificador (excluye la ilustración orbital y los puntos de diapositiva) y
pruebas: la genérica de plantillas y una por pantalla. Cambio visual mínimo: los enlaces del pie del recorrido pasan a 44 px de
alto. Medido en Edge con un borrador de plantilla propia: sin problemas en la página viva (375 y 1024) ni en la carta
(320, 375 y 1024). A corre con Codex (plugin `openai/codex-plugin-cc`, árbol `../waiter_project-codex-a`, rama
`feat/26092026-plan-k-a-verificador-obligatorio`) con el [traspaso](../traspaso/2026-09-26-traspaso-codex-plan-k-cierre.md).
**D hecho** (misma rama que C): `buscador`, `categorias`, `seccion`, `resumen`, `cupon`, `perfil`, `saldo-puntos` y
`banner-recompensa`, cada uno con contrato, componente extraído (`SearchBox`, `CategoryNav`, `SectionHeading`, `OrderSummary`,
`CouponField`, `ProfileSection`, `PointsBalanceView`, `RewardBanner`), plantilla de fábrica idéntica, muestra en la página viva,
inventario y caso en la prueba genérica. Con C suman diecisiete componentes plantillables. Medido en Edge junto con el
recorrido: un borrador con plantillas propias de los nueve, 25 raíces en cinco anchos, cero problemas, y la verificación
lanzada desde el propio experience con `DESIGN_VERIFIER_CMD` devuelve `ok`. La medición afinó tres cosas: el verificador no
cuenta como desborde un carril con desplazamiento horizontal (categorías) ni los adornos recortados de una raíz con
`overflow: hidden` (banner de recompensa), y oculta la barra de desplazamiento del Edge de Windows (15 px) para medir el
ancho de un teléfono; la página viva sangra las muestras hasta el borde en anchos de teléfono (375 px de ventana = 327 px
de contenido, como la pantalla real); y la ilustración de los puntos conserva sus 96 px aunque una plantilla la anide.
