# Traspaso a Codex (2026-09-24)

Estado del trabajo hecho con Claude Code entre el 22 y el 24 de septiembre de 2026, y lo que falta. Léelo antes de tocar el
repo. El contexto del producto está en `docs/README.md`.

## 1. Ramas y orden de fusión

Hay tres ramas encadenadas, todas sin fusionar en `main`:

```
main (e5cdd63)
 └─ feat/23092026-caja-cerrada-plano-dashboard   PR 1 (en GitHub; falta abrir el PR)
     └─ feat/23092026-mcp-diseno-menu            PR 2 (en GitHub; falta abrir el PR)
         └─ feat/24092026-plan-j1-fundamentos    PR 3 (plan J y fase J1)
```

1. Fusionar primero el PR 1 en `main`.
2. Cambiar la base del PR 2 a `main` y fusionarlo.
3. Hacer lo mismo con el PR 3.

En esta máquina no hay `gh` ni credenciales HTTPS: se sube por SSH, con
`git push git@github.com:gustavop-dev/waiter_project.git <rama>`, y el PR se abre en la web.

### PR 1: `feat/23092026-caja-cerrada-plano-dashboard`

- **dev**: la IP ya no está fija (`WAITER_HOST`). `scripts/dev.sh` usa `192.168.56.10` si existe; si no, la IP de la LAN.
  También se corrigieron `down` y `launch` (guardaban el PID de un bash intermedio).
- **experience**: leer la carta ya no abre una caja (`catalog_session`). Antes, cada visita a la carta con la caja cerrada
  dejaba una sesión en `opening_control` y bloqueaba guardar el plano.
- **Mesas**:
  - Galería de 18 piezas de decoración en SVG (`pos/lib/domain/decor.ts`, `pos/components/tables/decor/DecorArt.tsx`),
    guardadas en `waiter_plan.decor` y validadas en Odoo (`floor_plan.py`, `checked_decor`).
  - El plano se arrastra con la mano o con la rueda (`PlanViewport` con desplazamiento `offset`).
  - El editor ya no desplaza toda la página.
- **POS**:
  - «Inicio» ahora se llama «Dashboard» y sigue disponible con la caja cerrada.
  - «Abrir caja» pasó a la barra superior; se quitó la franja de caja cerrada.
  - Perfil: «Cerrar sesión» en un renglón; el cronómetro se llama «En turno»; se quitó el selector de idioma, que era
    solo de maqueta.
  - «Nueva reserva» tiene el tamaño de la cabecera.
- **Restaurante**: la ubicación se da con un enlace de Google Maps (`pos/lib/domain/mapsLink.ts` y
  `pos/app/api/mapas/resolver/route.ts`).
  - Los enlaces cortos se resuelven en el servidor.
  - Los que solo traen `ftid` (compartidos desde el teléfono) usan `/maps/preview/place`. **Es un endpoint interno de
    Google, no una API pública**: si cambia, el formulario pide el enlace copiado desde el computador.

### PR 2: `feat/23092026-mcp-diseno-menu`

- **Servidor MCP** en `experience/experience_app/mcp/`; leer su `README.md`.
  - JSON-RPC 2.0 en «Streamable HTTP» sin estado.
  - Herramientas: `leer_diseno_menu`, `preparar_diseno_menu`, `leer_banners`, `preparar_banners`, `listar_catalogo`
    y `confirmar_cambio`.
  - Preparar valida con las reglas del POS y deja un `McpPendingChange`. Solo `confirmar_cambio` guarda: el token es de
    un solo uso, dura 30 minutos y solo sirve con la misma clave.
- **Claves por sede** (`McpKey`):
  - Formato `wtr_` + 256 bits; se guarda solo el sha256.
  - **La clave decide la sede**: nunca se aceptan slugs del cliente.
  - Se pueden enviar en la cabecera Bearer o en la URL `/mcp/<clave>/`.
- **Odoo**:
  - Pasarela `/waiter/admin/mcp_keys`.
  - Grupo `projectapp_ops.group_waiter_integration`.
  - `pos.config.waiter_banner_settings_integration(banners, dry_run, actor)`. La validación de banners es compartida
    (`_waiter_clean_banners`).
- **POS**: sección Configuración › Integraciones IA (`McpKeysForm.tsx`).
- **Arreglo**: el saludo y el logo de Diseño del menú ahora se guardan con `write_brand`. Antes usaban
  `res.company.write`, que el admin del POS no puede usar.

### PR 3: `feat/24092026-plan-j1-fundamentos`

- **Plan J** (`docs/planes/2026-09-24-plan-J-design-system-del-menu.md`): el menú del comensal pasa a ser un design
  system con esquema, editable por la IA a través del MCP. La IA nunca escribe HTML ni CSS; cambia un tema validado.
- **J1, hecho y verificado**:
  - `diner/components/smart/smart-tokens.css` define:
    - `--ds-espacio-N`: pasos de 2 px × `--ds-densidad`.
    - `--ds-texto` y `--ds-titulo`: multiplican el tamaño y el interlineado.
    - `--ds-forma-<rol>`: tarjeta, boton, chip, campo, imagen y hoja.
  - `diner/scripts/design-system/tokenizar.py` convirtió el CSS (1.356 usos de variable). Es idempotente.
  - `diner/components/smart/__tests__/designTokens.test.ts` falla si vuelve una medida fija.
  - Verificación con 68 pantallas: 42 quedan idénticas, 18 cambian por un espaciado impar redondeado (+1 px por lado) y
    8 tienen ruido de animaciones. Ningún tamaño de texto cambió.

## 2. Lo que falta

### Plan J, fases J2 a J5 (el trabajo principal)

Detalle en el plan. Resumen accionable:

- **J2: tema v2 por sede** en experience.
  - Esquema e inventario en `experience/experience_app/diseno/`. Hoy los tokens viven en `plantillas/` (`final_tokens`,
    `validate`, `VenueMenuSettings.palette/typography`); reutilizarlos.
  - Fundamentos con rango y valor por defecto: densidad (factor), `texto`, `titulo`, forma por rol, los 9 colores y la
    fuente de cuerpo.
  - Reglas: contraste de al menos 4,5, cuerpo de texto de al menos 14 px efectivos y zonas táctiles de al menos 44 px.
  - Migrar los ajustes actuales al tema nuevo.
  - En el diner, extender `diner/lib/domain/template.ts` (`templateVars`) para que emita las `--ds-*` del tema.
  - Hoy los `--t-radio-*` se emiten pero no se usan; el radio sale de `--ds-forma-*`.
- **J3: variantes de componente** con atributos `data-ds-*` en `<main>` y selectores CSS:
  - botón: relleno, contorno o suave;
  - tarjeta: con sombra, con borde o plana;
  - categorías: chips, pestañas o subrayado;
  - carta: cuadrícula, lista o foto grande;
  - ficha del plato;
  - cabecera.

  Mantener en `inventario.json` qué componente usa qué variable y sus variantes, con una prueba que cruce el inventario
  con el CSS.
- **J4: herramientas del MCP** `leer_design_system`, `describir_pantalla`, `preparar_tema` y `restablecer_tema`
  (el patrón de `mcp/tools.py`).
  - Borrador visible en `<diner>/<rest>/<sede>/carta?borrador=<token>`, leído desde un endpoint público de solo lectura
    por token.
  - Pasar la vista previa del POS a ese mismo mecanismo; hoy `previewUrl` manda la paleta por la URL.
- **J5**: página viva `/<rest>/<sede>/design-system` con todos los componentes y variantes.

**Cómo verificar cada fase sin romper el menú.** Se hace con capturas antes/después (ver la sección 4). Con el tema por
defecto, el menú debe verse igual que después de J1.

### Tareas pendientes del dueño

- Abrir los PR 1 a 3 (sección 1).
- Crear la regla del firewall de Hyper-V para que otros equipos de la LAN lleguen al POS. Va en PowerShell **como
  administrador** en la máquina Windows:
  `New-NetFirewallHyperVRule -Name WSL-Waiter -DisplayName "WSL Waiter dev" -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts 3000,3001,8001,8002,8069 -Action Allow`
- Para usar el MCP desde claude.ai, publicar `experience` `/mcp/` por HTTPS. Hoy solo está en la LAN,
  `http://192.168.1.13:8001/mcp/`.

### Decisiones abiertas

- Si un comensal puede pedir con la caja cerrada. Hoy `experience` `orders.py` → `ensure_open_session` abre una.
- Poner `res.users.waiter_role = 'admin'` al usuario admin en la siembra del kit. En una base nueva quedó en `waiter`, y
  el POS usa el menor de dos roles, así que la empleada administradora se veía como mesera.
- El encabezado «Información del empleado» sale dos veces en el perfil.
- Usuario de servicio por inquilino en vez de `admin`: riesgo documentado en
  `docs/arquitectura/2026-09-21-odoo-headless-y-django-orquestador.md`, aplazado por el dueño.

### Pruebas que ya fallaban (no las rompió este trabajo)

- POS: 3 pruebas. `lib/domain/__tests__/roi.test.ts` (depende de la fecha), `lib/services/__tests__/openOrderFromKit.test.ts`
  y `components/kit/__tests__/KitShell.test.tsx` (`MISSING_MESSAGE: account.settings`).
- experience: 11 pruebas en `experience_app/tests/plantillas/`. Esperan la plantilla `B1` y hoy la predeterminada es
  `S1`.
- Lint del POS: `KitchenPaymentPolicyForm.tsx` y `PaymentGatewayForm.tsx` (`set-state-in-effect`).

## 3. Entorno de desarrollo (esta máquina)

- **Máquina**: WSL2 (Ubuntu 24.04) en Windows, con red en modo *mirrored*. La IP de la LAN es `192.168.1.13`.
  - El dueño entra por SSH en el puerto 2222 desde otros equipos.
  - Una tarea de Windows («WSL Ubuntu siempre encendido») mantiene WSL arriba.
- **Servicios**: el servicio systemd de usuario `waiter-dev` (`~/.config/systemd/user/waiter-dev.service`) levanta todo
  al arrancar (`Linger=yes`).
  - `systemctl --user status|restart waiter-dev`, registros con `journalctl --user -u waiter-dev`.
  - A mano: `scripts/dev.sh up|status|down` (con `sg docker -c` si el grupo docker no se ha cargado en la sesión).

| Servicio | Dirección |
|---|---|
| POS | `http://192.168.1.13:3000` |
| Comensal | `http://192.168.1.13:3001/burger-house/poblado` |
| experience | `http://192.168.1.13:8001` |
| registry | `:8002` |
| Odoo | `:8069`, `admin` / `admin`, base `projectapp` |

- **Credenciales demo**: PIN de empleado Laura Encargada `112233` (administradora), Carlos Cajero `654321` y
  Sofía Mesera `123456`.
- **Configuración local**: los `.env` de `registry`, `experience`, `odoo/compose`, `pos/.env.local` y `diner/.env.local`
  no se versionan.
  - La base de Odoo se armó desde cero con los scripts de `odoo/provisioning` y la carta demo
    (`tools/imagenes/subir_odoo.py --crear`).
  - El escenario «restaurant» de Odoo trae productos en inglés; se archivaron (26).
- **Cambios en Odoo**: los de Python necesitan reiniciar el contenedor, `docker restart odoo-spike-odoo-1`. Los de datos
  o grupos necesitan `-u projectapp_ops`. Al usuario de servicio se le asignó el grupo de integraciones:
  `env['res.users'].search([('login','=','admin')]).group_ids |= env.ref('projectapp_ops.group_waiter_integration')`.
- **experience** corre con `runserver --noreload`: después de cambiar Python hay que reiniciar el servicio.

## 4. Cómo probar

- **POS y comensal**: `npx tsc --noEmit`, `npx jest --ci` y `npx eslint <archivos>`, dentro de `pos/` o `diner/`.
- **experience**:
  `venv/bin/python -m pytest -q --ignore=experience_app/tests/contract --ignore=experience_app/tests/addon`.
- **Odoo**: `sg docker -c "scripts/odoo-test.sh projectapp_ops [Clase]"`. Corre sobre una copia desechable de la base.
- **Capturas del comensal (antes/después)**: `diner/scripts/exporty-audit/capture.cjs`; ver su `README.md`, sección
  «Comparar capturas».
  - Chrome de Linux no arranca en WSL (le faltan bibliotecas y no hay sudo). Se usa **Edge de Windows por CDP**:
    ```bash
    "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars \
      --remote-debugging-port=9333 --remote-debugging-address=127.0.0.1 --user-data-dir='C:\Users\Public\waiter-edge-test' about:blank &
    ```
  - Edge no llega a `192.168.1.13` porque lo bloquea el firewall de Hyper-V. Hace falta un puente TCP temporal
    `127.0.0.1:3001 → 192.168.1.13:3001` (unas líneas de `net` en Node) y `DINER_URL=http://localhost:3001`.
  - Lanzar la captura:
    `AUDIT_TIMEOUT=5000 AUDIT_CONTINUE=1 CDP_URL=http://127.0.0.1:9333 EXPORTY_SOURCE=<dir con assets/images/*.png> EXPORTY_OUTPUT=<dir> node scripts/exporty-audit/capture.cjs`.
    Unos 9 minutos. 37 escenarios viejos fallan siempre porque sus pasos ya no existen en la interfaz. Hay que actualizarlos
    algún día.
  - Para el «antes» de un cambio de CSS, guarda el cambio con `git stash push -u -- diner/components/smart`, captura y
    haz `git stash pop`. No guardes las capturas en `/tmp`: en un reinicio se borró todo `/tmp`.
  - Para saber qué regla movió algo: `AUDIT_BOXES=1` guarda la geometría de cada elemento en `evidence.json`.
  - Las pantallas que cambian entre dos capturas con el mismo CSS son ruido de animaciones (p. ej. `wallet-add`,
    `password-recover`, `feedback-2`, `points-earned`, `failed-order`, `paid-order`, `signup-invalid` y `rewards`).
- Para cerrar Edge de prueba, desde PowerShell: detener los `msedge.exe` cuya línea de comandos contenga
  `waiter-edge-test`.

## 5. Convenciones del repo

- Comentarios, textos de interfaz y mensajes de commit en español. Commits con el formato `tipo(ámbito): qué cambia`.
- Cada prueba lleva un comentario `// Falla si …` que dice qué error atrapa.
- Los textos del POS están en `pos/lib/i18n/messages/es.json` y `modules/*.json`. Ojo: las secciones de Configuración
  leen `admin.settings.sections` (en `modules/admin.json`), no `pos.settings.sections`.
- Las decisiones van en `docs/decisiones/`, los planes en `docs/planes/`, y cada addon o servicio tiene su README.
- `pos/` y `diner/` usan una versión nueva de Next (ver `AGENTS.md` de cada uno); consulta `node_modules/next/dist/docs/`
  antes de usar APIs de Next.
