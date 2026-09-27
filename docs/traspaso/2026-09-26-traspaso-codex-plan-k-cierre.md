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
