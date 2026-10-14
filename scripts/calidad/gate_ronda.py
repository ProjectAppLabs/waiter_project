"""Ejecuta el core canónico sobre el monorepo sin alterar sus reglas.

El core espera backend/ y un frontend/ que sea la app. El POS vive en frontend/pos (workspaces de npm) y su parser
de AST es el frontend/scripts/ast-parser.cjs real del repo; .testquality.yml declara frontend_unit_dir: pos. Lo que
el core no deja declarar se enlaza durante la ejecución: backend → experience y, dentro de frontend/, e2e y
eslint.config.mjs → los del POS. Los tests no se copian ni se sustituyen, y los alias se retiran al salir, también
cuando el proceso termina por una señal.
"""
import os
import signal
import subprocess
import sys
from pathlib import Path

# Alias (relativo a la raíz) → destino (relativo a la carpeta del alias).
ALIASES = {
    'backend': 'experience',
    'frontend/e2e': 'pos/e2e',
    'frontend/eslint.config.mjs': 'pos/eslint.config.mjs',
}


def interrumpido(signum, _frame):
    raise SystemExit(128 + signum)


def main():
    root = Path(__file__).resolve().parents[2]
    created = []
    signal.signal(signal.SIGTERM, interrumpido)
    signal.signal(signal.SIGHUP, interrumpido)
    try:
        for name, target in ALIASES.items():
            alias = root / name
            expected = (alias.parent / target).resolve()
            if not alias.exists() and not alias.is_symlink():
                alias.symlink_to(target, target_is_directory=expected.is_dir())
                created.append(alias)
            elif alias.is_symlink() and alias.resolve() == expected:
                # Resto de una corrida interrumpida: se reutiliza y se retira al salir.
                created.append(alias)
            else:
                raise SystemExit(f'{name} ya existe y no es el alias de calidad de {target}.')
        arguments = []
        for argument in sys.argv[1:]:
            # Los roots Python se normalizan a la ruta física por el core. El analizador JS conserva frontend/ como
            # raíz lógica y espera los e2e bajo frontend/e2e/.
            if argument.startswith('frontend/pos/e2e/'):
                argument = 'frontend/e2e/' + argument.removeprefix('frontend/pos/e2e/')
            arguments.append(argument)
        return subprocess.run([sys.executable, str(root / 'scripts/test_quality_gate.py'),
            '--repo-root', str(root), *arguments], cwd=root, check=False).returncode
    finally:
        for alias in reversed(created):
            if alias.is_symlink() and os.readlink(alias) == ALIASES[alias.relative_to(root).as_posix()]:
                alias.unlink()


if __name__ == '__main__':
    raise SystemExit(main())
