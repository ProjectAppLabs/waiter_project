# Traspaso a Codex · Plan K, cierre (paquetes A y E)

Lee antes el [traspaso general](2026-09-24-traspaso-a-codex.md) (entorno, cómo probar) y el
[plan de cierre](../planes/2026-09-26-plan-K-cierre-verificador-obligatorio-y-cobertura.md), que define los paquetes.
Codex hace **A** (verificador obligatorio) y después **E** (verificación en segundo plano). Claude hace C y D al mismo
tiempo en otra rama; no toques `diner/components/`, `diner/components/design-system/`, `inventario.json` ni
`componentes/*.json`, que son suyos.

## Punto de partida

- Rama base: `feat/25092026-plan-k1-contrato-plantillas` (`87c86ee`, K1 a K5). Crea `feat/26092026-plan-k-a-verificador-obligatorio`
  sobre ella; al terminar A, crea la de E sobre la de A.
- Contexto que ya existe y hay que reutilizar, no rehacer:
  - `experience/experience_app/diseno/borradores.py`: `create`, `result`, `read`, `verify` (subprocess con
    `DESIGN_VERIFIER_CMD`, cerrojo por sede en caché, guarda `payload['verificacion']`), `introduces_templates`,
    `confirm` (puerta actual: solo con verificador configurado).
  - `experience/experience_app/diseno/views.py`: `prepare` (POST interno de borradores del POS, sin clave MCP) y `preview`.
  - `experience/experience_app/mcp/tools.py`: `verificar_borrador`, `confirmar_cambio`.
  - `experience/experience_app/plantillas/services.py`: `prepare`/`save` (PUT interno) y `venue_settings` en
    `plantillas/views.py`.
  - `odoo/addons/projectapp_ops/controllers/admin.py`: `menu_settings` (get/set/preview) y su prueba
    `tests/test_menu_settings.py` (`HttpCase`, `requests.request` parcheado).
  - `pos/lib/services/menuTemplates.ts`: `gateway('get'|'set'|'preview')`.
  - Pruebas de referencia: `experience/experience_app/tests/diseno/test_plantillas.py`
    (`test_component_tools_read_prepare_verify_and_gate_confirmation`, `test_verifier_infrastructure_failures_are_reported_as_errors`,
    `test_gate_applies_only_to_new_templates_and_uses_the_latest_verification`) y `test_drafts.py`.

## Paquete A: qué entregar

1. `DESIGN_VERIFIER_REQUIRED` en `settings.py` (por defecto `True`, `.env.example` documentado). Con él,
   `borradores.confirm` rechaza cualquier borrador que introduzca o cambie una plantilla propia si la última verificación
   no es `ok: true`, incluidos «verificador no configurado» y `estado: error`, con un mensaje que diga qué falta. Con
   `False` se conserva el comportamiento actual.
2. `POST /internal/v1/<rest>/<sede>/menu/borradores/<token>/verificar/` (clave interna): ejecuta `borradores.verify` sobre un
   borrador de esa sede (kind `preview` o `theme`) y devuelve el mismo resultado que la herramienta MCP.
3. `PUT /internal/v1/<rest>/<sede>/menu/`: si `tema.componentes` difiere de lo guardado, exige `borrador=<token público>`
   (en el cuerpo) de un borrador de la misma sede, vigente, no aplicado, con `verificacion.ok` verdadero y cuyo
   `payload['tema']` sea igual al tema que se guarda; si no, 400 con mensaje. Al guardar, marca el borrador como aplicado.
   Con `DESIGN_VERIFIER_REQUIRED=False` no se exige.
4. Odoo `menu_settings`: acción `verify {borrador}` → POST interno de verificar; `set` acepta `borrador` y lo reenvía.
   POS `menuTemplates.ts`: `gateway('verify', {borrador})` y `MenuSettings.borrador` opcional. No hace falta UI nueva.
5. Pruebas (comentario `// Falla si …` en cada una): modo estricto sin verificador, con error, con problemas y en verde;
   PUT que cambia plantillas sin borrador (400), con borrador ajeno, caducado, no verificado o de otro tema (400), y con
   borrador verificado (200 y aplicado); Odoo `verify` y `set` con `borrador`; POS `gateway('verify')`.
6. Documentación: `diseno/README.md` (sección K3 y borradores), `mcp/README.md` (flujo de la plantilla),
   README del addon (pasarela), plan de cierre (estado de A).

## Paquete E: qué entregar (después de A)

`verificar_borrador` lanza `borradores.verify` en un hilo (`threading.Thread`, daemon) y responde de inmediato
`{'estado': 'en_curso', 'borrador': …}`; mientras corre, nuevas llamadas devuelven `en_curso`; al terminar, el resultado
normal. Guarda un estado `en_curso` en `payload['verificacion']` con fecha de inicio para que `confirmar_cambio` lo trate
como «no verificado». Conserva el cerrojo por sede y `DESIGN_VERIFIER_TIMEOUT`. El POST interno de verificar hace lo mismo.
Pruebas con un verificador falso que duerme 2 s: primera llamada `en_curso`, confirmar bloqueado, tras esperar `ok`.

## Cómo probar

```bash
cd experience
venv/bin/python -m pytest -q experience_app/tests/diseno experience_app/tests/mcp
venv/bin/python -m pytest -q --ignore=experience_app/tests/contract --ignore=experience_app/tests/addon
venv/bin/ruff check experience_app/diseno experience_app/mcp experience_app/tests/diseno experience_project
venv/bin/python manage.py makemigrations --check --dry-run
cd ..
sg docker -c "scripts/odoo-test.sh projectapp_ops TestMenuSettingsGateway"   # copia desechable de la base
cd pos && npx tsc --noEmit && npx jest --ci lib/services/__tests__/menuTemplates.test.ts
```

experience corre con `--noreload`: tras cambiar Python, reinícialo (`scripts/dev.sh down && scripts/dev.sh up`, o matar el
PID de `/tmp/waiter-dev/experience.pid` y `scripts/dev.sh up`). No publiques ramas ni fusiones sin pedido. Deja el
estado en este archivo al terminar cada paquete.

## Cierre de A · 2026-09-26

Implementado en `feat/26092026-plan-k-a-verificador-obligatorio`, sobre `f7824e3`, en el árbol separado
`/home/cerrotico/work/waiter_project-codex-a`. Solo A: E sigue pendiente. No se han reiniciado servicios ni modificado
archivos del árbol principal; no se han instalado dependencias, publicado ramas ni fusionado.

- `DESIGN_VERIFIER_REQUIRED=true` por defecto; MCP exige la última verificación en verde para introducir o cambiar
  una plantilla propia. `false` conserva el comportamiento anterior.
- POST interno de verificación compartido con MCP, con clave interna y aislamiento por sede; PUT con borrador
  vigente, sin aplicar, verificado y del mismo tema completo. El consumo del token y el guardado son atómicos.
- Odoo incorpora `verify` y reenvía `borrador` en `set`; el servicio del POS expone ambas operaciones sin UI nueva.
- Documentados los contratos en los README de diseño, MCP y addon. Pruebas de tokens ajenos, caducados, aplicados,
  revocados, de confirmación, otro tipo, otro tema, falta de verificación, error, problemas y verde sustituido por rojo;
  también publicación correcta, uso único, reversión ante error y compatibilidad con `false` y ediciones antiguas.

Verificación local:

| Comprobación | Resultado |
|---|---|
| experience: diseño + MCP | **234 pasaron** |
| experience: suite sin contract ni addon | **536 pasaron** |
| Ruff (incluye además plantillas y urls modificados) | **0 errores** |
| `makemigrations --check --dry-run` | **0 migraciones pendientes** |
| POS: `tsc --noEmit` | **0 errores** |
| POS: `menuTemplates.test.ts` | **7 pasaron** |
| POS: `odoo.test.ts` (cliente con espera opcional) | **3 pasaron** |
| ESLint de los tres archivos TypeScript modificados | **0 errores** |
| Odoo: `TestMenuSettingsGateway` | **11 pasaron, 0 fallos** (las corrió Claude fuera del sandbox, con `scripts/odoo-test.sh`) |

Odoo no pudo iniciarse en el sandbox de Codex: `sg docker` respondió `Cannot open audit interface - aborting.` y el acceso
directo a `/var/run/docker.sock` respondió `permission denied`. Claude corrió las pruebas después copiando los dos archivos
del addon al árbol principal (que es el que monta el contenedor) y restaurándolos: 11 pruebas, 0 fallos.

Decisiones de implementación: A conserva la ejecución síncrona; para que no la corten los límites anteriores,
`verify` tiene 190 s de espera en Odoo y 200 s en el POS, frente a los 180 s predeterminados de experience. Por eso
también cambia `pos/lib/services/odoo.ts` (espera opcional por petición). Un `ok` que no sea booleano o null en la salida
del verificador se trata como error, nunca como verde. Si el PUT recibe `borrador` aunque no cambien componentes,
también lo valida y consume; esto evita reutilizar un token aplicado. El regreso a fábrica sigue libre por MCP y
requiere borrador por PUT, tal como distingue el alcance de A.

**Commit.** Codex no pudo crearlo: `git add` no pudo escribir `index.lock` en
`/home/cerrotico/work/waiter_project/.git/worktrees/waiter_project-codex-a/` (los metadatos del worktree viven fuera de la
raíz que su sandbox permite escribir). Claude revisó el diff y lo confirmó desde fuera del sandbox. Para la próxima vez:
los worktrees que use Codex deben crearse con `git worktree add` y luego darle a Codex también permiso de escritura sobre
`.git/worktrees/<nombre>/`, o pedir a Claude que haga el commit.
