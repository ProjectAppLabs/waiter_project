---
name: limpieza
description: Revisión de higiene del repositorio de Waiter - pantallas y rutas que nada enlaza, código y exportes sin usar, dependencias sobrantes, avisos de lint, ramas ya fusionadas, árboles de trabajo viejos de Codex, archivos temporales y configuración muerta. Úsala cuando pidan «limpieza», «limpiar el proyecto», «quitar lo que sobra», al cerrar un plan grande o antes de una fusión importante. Primero propone; solo borra lo que la persona apruebe, con respaldo y verificando después.
---

# Limpieza del proyecto

Dos fases: **inventario** (solo lectura) y **ejecución** (solo lo aprobado). Nunca borres en la fase de inventario.

## 1. Inventario

Corre lo que aplique y anota cada hallazgo con evidencia (archivo, línea o comando que lo prueba):

- **Pantallas y rutas huérfanas (POS y comensal).** Lista `app/**/page.tsx` y busca quién enlaza cada ruta
  (`href`, `router.push/replace`, `TAB_ROUTES`, `ADMIN_SUBTABS`, grupos de `app/organizacion/layout.tsx` y
  `app/plataforma/layout.tsx`, `lib/domain/navigation.ts`, `lib/domain/modules.ts`, pruebas e2e). Una ruta sin
  enlaces puede ser una entrada directa a propósito (`/soporte`, `/login`, `/kit`): verifícalo antes de proponerla.
- **Código sin usar.** Exportes que nadie importa (`grep -rn "from '@/..."` del símbolo), componentes sin uso,
  funciones de `lib/services` sin llamadas, y en experience vistas sin ruta, servicios sin llamadas y modelos sin uso.
  Para TypeScript ayuda `npx tsc --noEmit -p . --noUnusedLocals --noUnusedParameters` (solo para listar; no cambies el
  tsconfig).
- **Lint.** `npx eslint .` en `pos/` y `diner/`: errores primero, luego avisos de variables sin usar. En experience,
  `venv/bin/ruff check .` si está instalado.
- **Dependencias.** Paquetes de `package.json` que no se importan en ningún lado; en experience, requisitos que nadie
  importa. Ojo con las que se usan por configuración (plugins de jest, eslint, postcss, Playwright).
- **Git.** `git branch --merged main` (locales y `git branch -r --merged origin/main` remotas), `git worktree list`
  (árboles `../waiter_project-codex-*` cuyo trabajo ya se integró) y `git stash list`.
- **Archivos sueltos.** Informes de cobertura y de Playwright fuera de `.gitignore`, `*.orig`, `*.rej`, parches
  viejos, temporales en la raíz, `git status --short` con archivos sin seguir.
- **Configuración muerta.** Variables de los `.env.example` que el código ya no lee, scripts de `package.json` o de
  `scripts/` que apuntan a cosas que no existen, rastros de la etapa con Odoo fuera de `docs/traspaso/` y de `odoo/`
  o `registry/` (que siguen en el repo a propósito).
- **Pruebas.** Pruebas omitidas (`it.skip`, `test.skip`, `@pytest.mark.skip`) sin motivo escrito, y pruebas que
  prueban código que ya no existe.

## 2. Propuesta

Presenta una tabla: hallazgo, evidencia, riesgo de quitarlo (bajo, medio, alto) y qué se haría. Agrupa por tipo.
Marca como **no tocar** lo que tenga dudas. Pide aprobación explícita; la persona puede aprobar todo, por grupos o
uno por uno.

## 3. Ejecución (solo lo aprobado)

- **Respaldo antes de borrar**: trabaja en una rama `chore/<DDMMYYYY>-limpieza` desde `main`. Para ramas y árboles
  de trabajo, anota el commit de cada uno antes de quitarlo (`git rev-parse`), así se pueden recuperar. Nunca toques
  `.wslconfig` ni leas los `.env`.
- Quita en tandas pequeñas y, después de cada tanda, verifica: `npx tsc --noEmit -p .` y `npx eslint` en el frente
  tocado, `npx jest` del POS o del comensal, y en experience `manage.py check` más pytest de las apps tocadas.
- Al terminar: suite completa (pytest en MySQL con `DJANGO_TEST_DB_NAME=test_waiter_dos`, jest de los dos frentes,
  e2e completa) y `python3 scripts/calidad/falla_si.py --resumen`.
- Commit en español (`chore(…): …`) con la línea de coautoría, push de la rama y resumen: qué se quitó, qué se dejó
  y por qué, y el resultado de las pruebas. Fusionar a `main` solo si la persona lo aprueba.
