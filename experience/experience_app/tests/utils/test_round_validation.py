"""La validación nunca entrega un verde omitiendo pruebas obligatorias."""
import runpy
from pathlib import Path

import pytest

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(('branch', 'missing'), [
    ('improve/cookie-y-correo', 'test_invitations.py'),
    ('improve/exportacion-clientes', 'test_customer_export_queries.py'),
    ('improve/consolas', 'consolas/ronda.spec.ts'),
    ('improve/contexto-y-validacion', 'test_access_logging.py'),
    ('queue/integration-r2', 'test_access_logging.py'),
    ('improve/mantenibilidad-08102026-r3', 'test_cart_price_contract.py'),
    ('improve/observabilidad-08102026-r3', 'OfflineBar.test.tsx'),
    ('improve/compartido-08102026-r3', 'test_round_validation.py'),
    ('queue/integration-r3', 'cartAmounts.test.ts'),
])
def test_runner_rechaza_la_ausencia_de_pruebas_obligatorias(monkeypatch, tmp_path, branch, missing):
    """Rechaza una rama o su tren cuando faltan pruebas obligatorias."""
    # Falla si una rama de la ronda o su combinación termina verde sin ejecutar sus pruebas obligatorias.
    script = Path(__file__).resolve().parents[4] / 'scripts/calidad/validar_ronda.py'
    commands = runpy.run_path(str(script))['commands']
    monkeypatch.setenv('GITHUB_HEAD_REF', branch)
    monkeypatch.setitem(commands.__globals__, 'ROOT', tmp_path)
    with pytest.raises(SystemExit, match=missing):
        commands('backend')


def test_runner_incluye_regresiones_de_la_ronda_en_el_backend(monkeypatch):
    """Incluye el contrato del logger y la regresión de caja en el plan."""
    # Falla si el runner del conductor omite la prueba del registro de acceso o la regresión de caja.
    script = Path(__file__).resolve().parents[4] / 'scripts/calidad/validar_ronda.py'
    commands = runpy.run_path(str(script))['commands']
    monkeypatch.setenv('GITHUB_HEAD_REF', 'improve/contexto-y-validacion')
    jobs = commands('backend')
    assert 'experience_app/tests/utils/test_access_logging.py' in jobs[0][1]
    assert 'sales/tests/views/test_cash_moves_idempotency.py' in jobs[0][1]


def test_gate_y_jest_incluyen_transporte_y_cola_obligatorios(monkeypatch):
    """La selección de calidad conserva las pruebas de escrituras inciertas."""
    # Falla si Jest ejecuta la cola o el transporte pero el gate deja esas pruebas sin revisar.
    script = Path(__file__).resolve().parents[4] / 'scripts/calidad/validar_ronda.py'
    commands = runpy.run_path(str(script))['commands']
    monkeypatch.setenv('GITHUB_HEAD_REF', 'improve/compartido-08102026-r3')
    jest_command = commands('pos')[0][1]
    gate_command = commands('gate')[0][1]
    assert 'lib/offline/__tests__/offline.test.ts' in jest_command
    assert 'lib/services/core/__tests__/http.test.ts' in jest_command
    assert 'pos/lib/offline/__tests__/offline.test.ts' in gate_command
    assert 'pos/lib/services/core/__tests__/http.test.ts' in gate_command


def test_runner_selecciona_pruebas_financieras_de_la_rama_y_su_gate(monkeypatch, tmp_path):
    """Las pruebas obligatorias presentes llegan a sus runners y al gate."""
    # Falla si una rama nueva publica un verde seleccionando solo las pruebas de una ronda anterior.
    script = Path(__file__).resolve().parents[4] / 'scripts/calidad/validar_ronda.py'
    commands = runpy.run_path(str(script))['commands']
    monkeypatch.setenv('GITHUB_HEAD_REF', 'improve/mantenibilidad-08102026-r3')
    monkeypatch.setitem(commands.__globals__, 'ROOT', tmp_path)
    for relative in commands.__globals__['NEW_TESTS']['improve/mantenibilidad-08102026-r3']:
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.touch()
    backend_command = commands('backend')[0][1]
    jest_command = commands('pos')[0][1]
    gate_command = commands('gate')[0][1]
    assert 'sales/tests/views/test_cart_price_contract.py' in backend_command
    assert 'lib/domain/__tests__/cartAmounts.test.ts' in jest_command
    assert 'experience/sales/tests/views/test_cart_price_contract.py' in gate_command
    assert 'pos/lib/domain/__tests__/cartAmounts.test.ts' in gate_command
    assert 'pos/e2e/pedidos/ronda.spec.ts' in gate_command


def preparar_combinacion(monkeypatch, tmp_path):
    """Simula el tren: todas las pruebas obligatorias de todas las ramas existen bajo una raíz temporal."""
    script = Path(__file__).resolve().parents[4] / 'scripts/calidad/validar_ronda.py'
    commands = runpy.run_path(str(script))['commands']
    monkeypatch.setenv('GITHUB_HEAD_REF', 'queue/integration-r4')
    monkeypatch.setitem(commands.__globals__, 'ROOT', tmp_path)
    for relative in (path for paths in commands.__globals__['NEW_TESTS'].values() for path in paths):
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.touch()
    return commands


def test_cada_pr_corre_las_redes_de_aislamiento_y_suspension(monkeypatch):
    """Cada PR ejecuta el inventario de aislamiento por ruta y la suspensión."""
    # Falla si un PR publica verde sin el inventario de aislamiento entre organizaciones ni la suspensión.
    script = Path(__file__).resolve().parents[4] / 'scripts/calidad/validar_ronda.py'
    commands = runpy.run_path(str(script))['commands']
    monkeypatch.setenv('GITHUB_HEAD_REF', 'improve/contexto-y-validacion')
    backend_command = commands('backend')[0][1]
    assert 'tenancy/tests/test_isolation_all_routes.py' in backend_command
    assert 'tenancy/tests/test_suspension_e2e.py' in backend_command


def test_la_combinacion_corre_las_matrices_de_permisos_completas(monkeypatch, tmp_path):
    """El tren ejecuta las tres matrices de permisos sin filtrar por turnos."""
    # Falla si el tren publica verde con la matriz de ventas filtrada o sin las de fidelización y contabilidad.
    permissions_command = preparar_combinacion(monkeypatch, tmp_path)('backend')[1][1]
    assert 'loyalty/tests/test_permissions.py' in permissions_command
    assert 'billing/tests/test_permissions_company.py' in permissions_command
    assert '-k' not in permissions_command


def test_la_combinacion_corre_la_suite_completa_de_jest(monkeypatch, tmp_path):
    """El tren ejecuta todo Jest del POS, no solo la selección de la ronda."""
    # Falla si el tren publica verde ejecutando solo la selección y deja fuera pruebas como paymentKit.test.ts.
    jest_command = preparar_combinacion(monkeypatch, tmp_path)('pos')[0][1]
    assert '--runTestsByPath' not in jest_command
    assert '--outputFile=../test-results/pos.json' in jest_command
