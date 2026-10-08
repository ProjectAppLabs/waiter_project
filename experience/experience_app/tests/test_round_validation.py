"""La validación nunca entrega un verde omitiendo pruebas obligatorias."""
import runpy
from pathlib import Path

import pytest

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize('branch,missing', [
    ('improve/cookie-y-correo', 'test_invitations.py'),
    ('improve/exportacion-clientes', 'test_customer_export_queries.py'),
    ('improve/consolas', 'consolas/ronda.spec.ts'),
    ('improve/contexto-y-validacion', 'test_access_logging.py'),
    ('queue/integration-r2', 'test_access_logging.py'),
])
def test_runner_rechaza_la_ausencia_de_pruebas_obligatorias(monkeypatch, tmp_path, branch, missing):
    # Falla si una rama de la ronda o su combinación termina verde sin ejecutar sus pruebas obligatorias.
    script = Path(__file__).resolve().parents[3] / 'scripts/calidad/validar_ronda.py'
    commands = runpy.run_path(str(script))['commands']
    monkeypatch.setenv('GITHUB_HEAD_REF', branch)
    monkeypatch.setitem(commands.__globals__, 'ROOT', tmp_path)
    with pytest.raises(SystemExit, match=missing):
        commands('backend')


def test_runner_incluye_regresiones_de_la_ronda_en_el_backend(monkeypatch):
    # Falla si el runner del conductor omite la prueba del registro de acceso o la regresión de caja.
    script = Path(__file__).resolve().parents[3] / 'scripts/calidad/validar_ronda.py'
    commands = runpy.run_path(str(script))['commands']
    monkeypatch.setenv('GITHUB_HEAD_REF', 'improve/contexto-y-validacion')
    jobs = commands('backend')
    assert 'experience_app/tests/test_access_logging.py' in jobs[0][1]
    assert 'sales/tests/views/test_cash_moves_idempotency.py' in jobs[0][1]
