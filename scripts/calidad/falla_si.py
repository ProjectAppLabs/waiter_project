#!/usr/bin/env python3
"""Lista las pruebas sin su comentario «Falla si …» (regla de AGENTS.md).

Mira jest y Playwright (`it(` / `test(` en pos/ y diner/) y pytest (`def test_` en experience/). El comentario puede
ir en las líneas de arriba (con decoradores o comentarios de por medio) o en la primera línea del cuerpo.
Uso: python3 scripts/calidad/falla_si.py [--resumen]
"""
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
JS = re.compile(r"^\s*(it|test)(\.(only|skip|each\([^)]*\)))?\(\s*['\"`]")
PY = re.compile(r"^\s*(async\s+)?def\s+test_\w+")
FALLA = re.compile(r"Falla si", re.IGNORECASE)


def archivos():
    for carpeta in ("pos", "diner"):
        base = RAIZ / carpeta
        for patron in ("**/*.test.ts", "**/*.test.tsx", "e2e/**/*.spec.ts"):
            for f in base.glob(patron):
                if "node_modules" not in f.parts:
                    yield f, JS
    for f in (RAIZ / "experience").glob("**/test*.py"):
        if "venv" not in f.parts and f.name.startswith("test"):
            yield f, PY


def tiene_falla(lineas, i):
    # Hacia arriba: comentarios, decoradores y líneas en blanco, hasta 12 líneas.
    j = i - 1
    while j >= 0 and i - j <= 12:
        texto = lineas[j].strip()
        if FALLA.search(texto):
            return True
        if not texto or texto.startswith(("//", "#", "*", "/*", "@")) or texto.endswith("*/"):
            j -= 1
            continue
        break
    # Hacia abajo: la primera línea con contenido del cuerpo.
    return any(FALLA.search(l) for l in lineas[i : i + 4])


def main():
    faltan = []
    total = 0
    for f, patron in sorted(archivos()):
        lineas = f.read_text(encoding="utf-8", errors="replace").splitlines()
        for i, linea in enumerate(lineas):
            if patron.match(linea):
                total += 1
                if not tiene_falla(lineas, i):
                    faltan.append(f"{f.relative_to(RAIZ)}:{i + 1}: {linea.strip()[:90]}")
    if "--resumen" not in sys.argv:
        print("\n".join(faltan))
    print(f"\n{len(faltan)} de {total} pruebas sin «Falla si».")
    return 1 if faltan else 0


if __name__ == "__main__":
    sys.exit(main())
