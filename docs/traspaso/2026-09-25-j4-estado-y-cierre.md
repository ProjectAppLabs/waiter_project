# J4 · Estado y cierre para continuar con Codex o Claude

**Cerrado el 25 de septiembre de 2026 por Claude:** commit `74972fa` en `feat/24092026-plan-j4-borradores`, tras repetir
TypeScript, las pruebas focalizadas de diner y POS, las 108 de diseño/MCP, `makemigrations --check`, Ruff, `git diff --check`
y los enlaces de la documentación. J5 siguió en `feat/25092026-plan-j5-pagina-viva`
([revisión de J5](../revisiones/2026-09-25-plan-j5.md)). El resto de este archivo es el estado en el momento del traspaso.

El usuario pidió implementar J4 y después solicitó expresamente dejar la documentación para continuar con Claude.
Leer primero el [traspaso general](2026-09-24-traspaso-a-codex.md).

## Estado al entregar a Claude

- Rama: `feat/24092026-plan-j4-borradores`, creada sobre J3 (`436c602`). **J4 está sin commit**: código, pruebas y
  documentación permanecen en el árbol de trabajo. No hacer checkout, reset ni descartar archivos antes de revisar `git diff`.
- J2: `93929b0`; J3: `436c602`. Las ramas están encadenadas y son locales, sin publicación.
- J4 está implementado y validado; queda la revisión final y guardar el commit de cierre. No se ha empezado J5.
- No hay agentes paralelos ni trabajo ajeno conocido en el árbol.
- El sandbox cambió durante el trabajo: ahora `.git` es de solo lectura y la red está restringida; algunas acciones de
  cierre pueden necesitar autorización del entorno. No confundirlo con una autorización de producto pendiente.

## Implementado

- MCP: `leer_design_system`, `describir_pantalla`, `preparar_tema`, `restablecer_tema`; `confirmar_cambio` aplica temas.
- Mezcla recursiva de campos enviados, validación del tema completo, rechazo de derivados de solo lectura, restablecimiento
  de todo o de una capa. Esquema e inventario reales, sin un catálogo paralelo de opciones.
- `diseno/borradores.py`: instantánea validada de tema/plantilla, vigencia de 30 minutos, token público UUID distinto del
  token de confirmación. La sede viene de la clave MCP o la pasarela del POS. Confirmación de un solo uso, transaccional,
  con comprobación de tema base para rechazar borradores obsoletos y bloqueo por sede.
- `McpPendingChange` se reutiliza; migración **0026_borradores_tema**. Clave opcional para borradores del POS, sin crear
  claves ficticias. Los borradores antiguos permanecen sin enlace público.
- `GET /api/v1/<rest>/<sede>/borradores/<token>/`: solo plantilla y caducidad, `Cache-Control: no-store`, sin confirmación.
  Rechaza sede ajena, caducidad, clave revocada y borrador aplicado.
- `POST /internal/v1/<rest>/<sede>/menu/borradores/`: preparación del POS con clave interna; acepta contrato anterior o tema v2.
- Odoo: acción `preview` de `/waiter/admin/menu_settings`; conserva autorización de administrador, no acepta sede del navegador.
- POS: debounce de 400 ms, llamadas a `gateway('preview')`, iframe/enlace `?borrador=`, errores visibles y actualización manual.
- Diner: carga del borrador junto con la entrada, conserva token en enlaces y recargas, maneja fallo/caducidad/salida,
  ignora respuestas anteriores. Bloqueo en el store y en el cliente HTTP para evitar pedidos, pagos y escrituras directas.
  Los enlaces antiguos `vista_previa` siguen admitidos por compatibilidad; el POS ya no los genera.

## Verificaciones que ya pasaron

- Diner completo: **84 suites, 402 pruebas** (`test-reports/j4/diner-tests.log`).
- Experience completo sin addon: **410 pasan, 7 deseleccionadas** (`backend-tests.log`).
- Pruebas focalizadas del contrato/MCP: **108 pasan** (`backend-focused.log`).
- POS afectado: **2 suites, 9 pruebas** (`pos-focused.log`). No se repitió la suite completa del POS: tiene fallos heredados documentados.
- Odoo sobre copia desechable: **8 pruebas de TestMenuSettingsGateway, cero fallos/errores** (`odoo-tests.log`).
- TypeScript de ambos frontends, ESLint de archivos modificados, Ruff y comprobación de migraciones pasan.
- Builds de producción con Webpack de diner y POS, en copias aisladas. El build final del POS incluye `proxy.ts`.
- `verificar-borradores.cjs`: **5 escenarios en desarrollo y 5 en producción**, con el backend real en una base SQLite
  desechable. Lee/prepara, navega/recarga, bloquea escrituras, rechaza sede ajena, confirma, comprueba la entrada pública y
  restablece. El botón de login está deshabilitado en preview; la auditoría lo comprueba sin forzar un clic.
- **50 escenarios publicados** de J2 pasan sin errores ni infracciones; consolidado en `publicado/resumen.json`.
- Revisión visual de ficha, formulario protegido y enlace aplicado. El enlace para salir del borrador tiene área mínima de 44 px;
  tras ese ajuste se repitieron TypeScript, ESLint, siete pruebas focalizadas y el build de diner (`diner-build-final.log`).

Toda la evidencia está en `test-reports/j4/` (ignorado por Git).

## Cierre local realizado

- Documentados contrato, MCP, revisión final y plan J. Ver [revisión de J4](../revisiones/2026-09-25-plan-j4.md).
- Copia SQLite previa en `test-reports/j4/experience-antes-0026.sqlite3` (permisos 600); migración **0026 aplicada**.
- El entorno se reinició entre las sesiones del 24 y 25: los servicios ya arrancaron con el código nuevo. Se comprobó
  `scripts/dev.sh status`: postgres, Odoo, registro, experience, POS y comensal responden.
- Comprobación en experience local: preparar devuelve 201, leer devuelve 200, la URL usa el origen público correcto y
  el tema publicado permanece intacto. El borrador temporal se retiró; resultado en `comprobacion-local.json`.
- `DINER_PUBLIC_URL` ya es `http://192.168.1.13:3001`; no se cambió.
- Las carpetas de auditoría antiguas de `/tmp` desaparecieron con el reinicio, incluidas la base aislada, la clave y las
  copias de build. La nueva copia de build final ya no contiene `.env.local`. Los artefactos útiles permanecen en el repo,
  bajo `test-reports/j4/`, sin versionar. No hace falta recuperar los temporales antiguos.
- Las 10 capturas de borradores son previas al último ajuste del área táctil del enlace de salida; ese ajuste pasó la
  compilación final y las pruebas focalizadas. No se repitió toda la matriz tras esa modificación de presentación.

## Pasos exactos que quedan para Claude

1. Leer este archivo y revisar `git status --short` / `git diff` sobre la rama actual. La implementación principal está
   hecha; no hay que rehacer MCP, borradores ni el cambio de vista previa del POS.
2. Revisar el último ajuste de los enlaces «Abrir menú publicado»: `inline-flex min-h-11 items-center underline` en
   `diner/app/[rest]/[sede]/[[...ruta]]/page.tsx`. TypeScript, lint, siete pruebas y build pasan. Se añadió una aserción de
   área táctil al runner `verificar-borradores.cjs`; esa aserción nueva **no se ejecutó en navegador** porque el entorno
   perdió los temporales. Si se quiere renovar esa evidencia, recrear la base aislada con las instrucciones siguientes.
   Las diez capturas anteriores y sus `resultado.json` sí pasaron y siguen guardados.
3. Comprobar `git diff --check` y los enlaces locales de la documentación. Revisar cualquier hallazgo real antes de cerrar;
   no hace falta repetir todas las suites si no se cambia código funcional.
4. Guardar código, pruebas y documentación en un commit, por ejemplo
   `feat(menu): completar herramientas MCP y borradores de J4`. **No está hecho todavía**. `.git` es de solo lectura
   dentro del sandbox actual: puede hacer falta permiso del entorno para `git add` / `git commit`.
5. Actualizar este traspaso y el estado del plan a «cerrado» una vez guardado. No publicar ni fusionar ramas sin pedido.

Después viene **J5**, la página viva `/<rest>/<sede>/design-system`: componentes y variantes con el tema de la sede.
Leer el plan J antes de empezar; el usuario pidió ahora el traspaso, no implementar J5.

Las ramas J2, J3 y J4 siguen sin publicar/fusionar. Conservar el orden J1 → J2 → J3 → J4 y una fase por PR.
Los fallos heredados de la suite completa del POS y las decisiones de producto ajenas a J4 siguen en el traspaso general.

## Repetir la auditoría de borradores

Los procesos temporales de la primera corrida ya no existen. Para repetirla, crear una base SQLite desechable fuera de
`experience/db.sqlite3`, ejecutar migraciones con `DJANGO_DB_NAME=<base-de-prueba>` y crear allí una clave MCP para
`burger-house/poblado` mediante `experience_app.mcp.keys.create`. Guardar su valor en un JSON local de permisos 600,
con forma `{"key":"<clave>"}`. Iniciar ese experience en `127.0.0.1:8003` con la misma variable de base.
No copiar ni imprimir una clave real del restaurante.

Con diner y Edge CDP disponibles (instrucciones de navegador/puente en el traspaso general):

```bash
DRAFT_API_URL=http://127.0.0.1:8003 \
  DRAFT_KEY_FILE=/ruta/clave-de-la-base-de-prueba.json \
  DINER_URL=http://localhost:3001 \
  node diner/scripts/design-system/verificar-borradores.cjs
```

Este script **confirma y restablece temas**: usar exclusivamente la base desechable, nunca el backend operativo.
Para producción se usó `DINER_URL=http://localhost:3002` y `DRAFT_EVIDENCE=test-reports/j4/produccion`.
