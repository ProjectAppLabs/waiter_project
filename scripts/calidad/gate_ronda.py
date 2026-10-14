"""Ejecuta el core canónico sobre el monorepo sin alterar sus reglas.

El core espera backend/ y frontend/. frontend/ ya es la app de Next (POS, comensal y landing); backend/ enlaza
experience/ durante la ejecución. Los tests no se copian ni se sustituyen y el alias se retira al salir.
"""
import os
import subprocess
import sys
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[2]
    aliases = {'backend': 'experience'}
    created = []
    try:
        for name, target in aliases.items():
            alias = root / name
            if not alias.exists() and not alias.is_symlink():
                alias.symlink_to(target, target_is_directory=True)
                created.append(alias)
            elif not alias.is_symlink() or alias.resolve() != root / target:
                raise SystemExit(f'{name}/ ya existe y no es el alias de calidad de {target}.')
        return subprocess.run([sys.executable, str(root / 'scripts/test_quality_gate.py'),
            '--repo-root', str(root), *sys.argv[1:]], cwd=root, check=False).returncode
    finally:
        for alias in reversed(created):
            if alias.is_symlink() and os.readlink(alias) == aliases[alias.name]:
                alias.unlink()


if __name__ == '__main__':
    raise SystemExit(main())
