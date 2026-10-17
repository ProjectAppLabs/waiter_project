"""Ejecuta las regresiones y las pruebas presentes de la ronda sin inventar un verde.

Cada PR exige sus archivos de prueba. El tren exige la unión completa mediante
WAITER_REQUIRE_ROUND_TESTS=1; el PR del conductor puede preparar el CI antes de recibirlos.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NEW_TESTS = {
    'improve/seguridad-observabilidad': [
        'frontend/lib/offline/__tests__/cache.test.ts',
        'frontend/lib/services/core/__tests__/realtime.test.ts',
        'frontend/e2e/acceso/ronda.spec.ts',
    ],
    'improve/rendimiento': ['experience/sales/tests/views/test_shift_list_queries.py'],
    'improve/responsividad': ['frontend/e2e/pedidos/ronda.spec.ts'],
    'improve/contexto-y-validacion': [
        'experience/experience_app/tests/utils/test_access_logging.py',
        'experience/experience_app/tests/utils/test_round_validation.py',
    ],
    'improve/cookie-y-correo': [
        'experience/experience_app/tests/views/test_entry_and_sessions.py',
        'experience/accounts/tests/views/test_invitations.py',
    ],
    'improve/exportacion-clientes': [
        'experience/reports/tests/views/test_customer_export_queries.py',
        'experience/reports/tests/views/test_exportes_historial_equipo.py',
    ],
    'improve/consolas': [
        'frontend/components/console/__tests__/ConsoleNavigation.test.tsx',
        'frontend/components/console/__tests__/ConsoleLayouts.test.tsx',
        'frontend/e2e/consolas/ronda.spec.ts',
    ],
    'improve/mantenibilidad-08102026-r3': [
        'experience/sales/tests/views/test_cart_price_contract.py',
        'frontend/lib/domain/__tests__/cartAmounts.test.ts',
        'frontend/lib/domain/__tests__/orderWizard.test.ts',
        'frontend/lib/domain/__tests__/orderState.test.ts',
        'frontend/components/orders/__tests__/steps.test.tsx',
        'frontend/components/orders/__tests__/OrderDetailsPanel.test.tsx',
        'frontend/components/orders/__tests__/AddRoundScreen.test.tsx',
        'frontend/lib/stores/__tests__/orderWizardStore.test.ts',
        'frontend/lib/services/__tests__/orderCreate.test.ts',
        'frontend/lib/services/__tests__/ordersKit.test.ts',
        'frontend/e2e/pedidos/ronda.spec.ts',
    ],
    'improve/observabilidad-08102026-r3': [
        'experience/sales/tests/views/test_payment_review.py',
        'frontend/lib/services/core/__tests__/http.test.ts',
        'frontend/lib/offline/__tests__/offline.test.ts',
        'frontend/components/offline/__tests__/OfflineBar.test.tsx',
        'frontend/e2e/pago/ronda.spec.ts',
    ],
    'improve/compartido-08102026-r3': [
        'experience/experience_app/tests/utils/test_round_validation.py',
    ],
    # r4: cada frente exige sus pruebas; el tren exige la unión de todas.
    'improve/seguridad-09102026-r4': [
        'experience/catalog/tests/views/test_imagenes_no_raster.py',
        'experience/billing/tests/views/test_logo_no_raster.py',
        'experience/loyalty/tests/views/test_banner_no_raster.py',
        'experience/catalog/tests/views/test_agotados_encargado.py',
        'frontend/lib/domain/__tests__/navigation_r4.test.ts',
        'frontend/app/(waiter)/caja/__tests__/page.test.tsx',
    ],
    'improve/mantenibilidad-09102026-r4': [
        'frontend/lib/services/__tests__/paymentKit.test.ts',
        'frontend/lib/stores/__tests__/orderStore.test.ts',
        'frontend/components/payment/__tests__/PaymentModal.test.tsx',
        'frontend/components/billing/__tests__/AccountingDetail.test.tsx',
        'frontend/lib/domain/__tests__/roles.test.ts',
        'frontend/components/business/__tests__/SalesView.test.tsx',
        'frontend/lib/services/__tests__/team.test.ts',
        'frontend/components/settings/__tests__/UsersAndPermissions.test.tsx',
        'frontend/lib/services/__tests__/reservations_r4.test.ts',
        'frontend/lib/services/__tests__/sales.test.ts',
        'frontend/lib/services/__tests__/floorPlan_r4.test.ts',
        'frontend/e2e/pago/ronda.spec.ts',
    ],
    'improve/observabilidad-09102026-r4': [
        'experience/tenancy/tests/services/test_subscriptions_concurrencia.py',
        'experience/tenancy/tests/views/test_cuerpo_demasiado_grande.py',
        'frontend/components/catalog/__tests__/ProductForm.test.tsx',
        'frontend/lib/services/__tests__/posData.test.ts',
    ],
    'improve/rendimiento-09102026-r4': [
        'experience/sales/tests/views/test_insights_queries.py',
        'experience/sales/tests/views/test_kitchen_tickets_queries.py',
        'frontend/lib/stores/__tests__/kitchenStore.test.ts',
        'experience/billing/tests/views/test_fecha_documento_r4.py',
        'experience/tenancy/tests/services/test_metricas_plataforma_r4.py',
    ],
    'improve/responsividad-09102026-r4': [
        'frontend/e2e/cocina/ronda.spec.ts',
        'frontend/e2e/inventario/ronda.spec.ts',
        'frontend/e2e/pedidos/operacion.spec.ts',
        'frontend/app/(waiter)/(pos)/inventario/__tests__/ingredientes_r4.test.tsx',
    ],
    'improve/qa-09102026-r4': [
        'frontend/components/settings/__tests__/RestaurantInfoForm.test.tsx',
        'frontend/components/platform/__tests__/platform_r4.test.tsx',
        'experience/reservations/tests/views/test_cierre_medianoche_r4.py',
    ],
    'improve/compartido-09102026-r4': [
        'experience/experience_app/tests/utils/test_round_validation.py',
        'experience/experience_app/tests/utils/test_correo_produccion.py',
    ],
    # Un run manual sobre main (workflow_dispatch) corre la combinación: la rama sale de GITHUB_REF_NAME.
    'fix/14102026-ronda-en-main': [
        'experience/experience_app/tests/utils/test_round_validation.py',
    ],
    # Alta en staging: una sola app de Next en frontend/ (POS, comensal y landing por host) y el modo staging seguro.
    'refactor/14102026-frontend-una-app': [
        'experience/experience_app/tests/utils/test_entorno_staging.py',
        'experience/experience_app/tests/views/test_entry_and_sessions.py',
        'experience/experience_app/tests/utils/test_correo_produccion.py',
        'experience/experience_app/tests/utils/test_round_validation.py',
        'frontend/__tests__/proxy.test.ts',
        'frontend/e2e/hosts/ronda.spec.ts',
    ],
    # La IP del cliente detrás de nginx y de Next, y la dirección del MCP sin PAYMENTS_PUBLIC_URL.
    'fix/14102026-ip-cliente': [
        'experience/experience_app/tests/views/test_detras_del_proxy.py',
        'frontend/components/settings/__tests__/McpKeysForm.test.tsx',
    ],
    # La consola de ProjectApp en inglés: platform.waiter.projectapp.co/platform, con /plataforma redirigida.
    'fix/17102026-subdominio-platform': [
        'experience/experience_app/tests/utils/test_round_validation.py',
        'experience/accounts/tests/views/test_invitations.py',
        'frontend/__tests__/proxy.test.ts',
        'frontend/lib/domain/__tests__/tenant.test.ts',
        'frontend/app/(waiter)/login/__tests__/page.test.tsx',
        'frontend/app/(waiter)/entrar/__tests__/page.test.tsx',
        'frontend/components/business/__tests__/huecos.test.tsx',
        'frontend/components/console/__tests__/ConsoleLayouts.test.tsx',
        'frontend/components/platform/__tests__/platform.test.tsx',
        'frontend/components/platform/__tests__/platform_r4.test.tsx',
        'frontend/e2e/consolas/ronda.spec.ts',
        'frontend/e2e/hosts/ronda.spec.ts',
    ],
}
BACKEND = [
    'sales/tests/views/test_cash_moves_idempotency.py',
    'sales/tests/test_operations.py::test_seed_and_unique_shift',
    'sales/tests/test_operations.py::test_payment_change_tip_and_cash',
    'sales/tests/test_operations.py::test_closing_note_tolerance_and_recipients',
    'sales/tests/test_operations.py::test_nobody_closes_with_drafts',
    'sales/tests/test_operations.py::test_database_unique_open_shift',
    'sales/tests/test_operations.py::test_closings_manager_scope',
    'tenancy/tests/test_platform.py::test_creation_survives_mail_failure',
    # r4: las redes de aislamiento entre organizaciones y de suspensión corren en cada PR.
    'tenancy/tests/test_isolation_all_routes.py',
    'tenancy/tests/test_suspension_e2e.py',
    # r4: regresiones legadas que la ronda modificó o vuelve a ejercitar; se ejecutan sin entrar en la puerta
    # (viven fuera de las carpetas de área y su deuda previa no es de esta ronda).
    'catalog/tests/test_images.py',
    'catalog/tests/test_contract.py::test_precios_agotados_y_permisos',
    'tenancy/tests/test_subscriptions.py',
    'tenancy/tests/test_metrics.py',
    'billing/tests/test_documents.py',
    'reservations/tests/test_reservations.py',
    'sales/tests/test_tables_reports_events.py::test_insights_local_days_and_previous_window',
    'sales/tests/test_operations.py::test_kitchen_only_shows_the_open_shift',
    'sales/tests/test_operations.py::test_kitchen_ticket_carries_the_chosen_options',
    'sales/tests/test_operations.py::test_kitchen_line_and_course_workflow',
    # La consola en platform.: los slugs reservados y la invitación de ProjectApp, en archivos con deuda previa de la puerta.
    'tenancy/tests/test_platform.py::test_invalid_slug',
    'accounts/tests/test_inicio_universal.py::test_la_invitacion_de_projectapp_lleva_al_inicio_universal',
]
# r4: las matrices completas de permisos por rol corren en la combinación (tren y main).
PERMISSION_MATRICES = [
    'sales/tests/test_permissions.py',
    'loyalty/tests/test_permissions.py',
    'billing/tests/test_permissions_company.py',
]
POS = [
    'lib/services/__tests__/cashRegister.test.ts',
    'lib/offline/__tests__/cashMoves.test.ts',
    'lib/offline/__tests__/offline.test.ts',
    'lib/offline/__tests__/emergency.test.ts',
    'lib/services/core/__tests__/http.test.ts',
    'components/payment/__tests__/PaymentModal.test.tsx',
    'app/(waiter)/(pos)/historial/__tests__/page.test.tsx',
    'components/history/__tests__/BillInfo.test.tsx',
    # La consola en platform.: el service worker de su host y la ruta de cobros, con deuda previa de la puerta.
    'components/app/__tests__/ServiceWorkerSetup.test.ts',
    'components/platform/__tests__/billing.test.tsx',
]
LEGACY_GATE = [
    'experience/sales/tests/views/test_cash_moves_idempotency.py',
    'frontend/lib/services/__tests__/cashRegister.test.ts',
    'frontend/lib/offline/__tests__/cashMoves.test.ts',
    'frontend/lib/offline/__tests__/emergency.test.ts',
    'frontend/lib/offline/__tests__/offline.test.ts',
    'frontend/lib/services/core/__tests__/http.test.ts',
    'frontend/e2e/pago/ronda.spec.ts',
    'frontend/e2e/historial/ronda.spec.ts',
]


def commands(layer):
    # En un PR la rama es GITHUB_HEAD_REF. En un workflow_dispatch o un push no existe, y el checkout por SHA deja el
    # HEAD separado (git no ve ninguna rama): ahí vale GITHUB_REF_NAME, así un run manual sobre main corre la combinación.
    branch = os.environ.get('GITHUB_HEAD_REF') or os.environ.get('GITHUB_REF_NAME') or subprocess.check_output(
        ['git', 'branch', '--show-current'], cwd=ROOT, text=True).strip()
    combined = os.environ.get('WAITER_REQUIRE_ROUND_TESTS') == '1' or branch.startswith('queue/integration-') or branch == 'main'
    required = [path for paths in NEW_TESTS.values() for path in paths] if combined else NEW_TESTS.get(branch, [])
    missing = [path for path in required if not (ROOT / path).is_file()]
    if missing:
        raise SystemExit('Faltan pruebas obligatorias de esta rama: ' + ', '.join(missing))
    # Cada PR valida su entrega y la regresión anterior; el tren exige la unión completa.
    previous = ('improve/seguridad-observabilidad', 'improve/rendimiento', 'improve/responsividad')
    legacy = [path for branch in previous for path in NEW_TESTS[branch] if (ROOT / path).is_file()]
    present = list(dict.fromkeys(legacy + required))
    # Las pruebas existentes del transporte y del store pertenecen también al cambio de seguridad.
    if 'frontend/lib/offline/__tests__/cache.test.ts' in present:
        present += ['frontend/lib/stores/__tests__/authStore.test.ts', 'frontend/lib/services/core/__tests__/http.test.ts']
    if layer == 'backend':
        paths = list(dict.fromkeys(BACKEND + [path.removeprefix('experience/') for path in present if path.startswith('experience/')]))
        permissions = PERMISSION_MATRICES if combined else ['sales/tests/test_permissions.py', '-k', 'shifts']
        return [
            (ROOT / 'experience', [sys.executable, '-m', 'pytest', *paths, '--junitxml=../test-results/backend.xml', '-q']),
            (ROOT / 'experience', [sys.executable, '-m', 'pytest', *permissions,
                                  '--reuse-db', '--junitxml=../test-results/backend-permissions.xml', '-q']),
        ]
    if layer == 'pos':
        paths = list(dict.fromkeys(POS + [path.removeprefix('frontend/') for path in present if path.startswith('frontend/') and '/e2e/' not in path]))
        # r4: la combinación corre la suite completa de Jest; #23 y #29 rompieron pruebas fuera de la selección con CI verde.
        selection = [] if combined else ['--runTestsByPath', *paths]
        return [(ROOT / 'frontend', ['npm', 'run', 'test:ci', '--', '--runInBand', *selection,
                               '--json', '--outputFile=../test-results/pos.json', '--reporters=default',
                               '--reporters=../test-results/junit/node_modules/jest-junit'])]
    includes = [argument for path in dict.fromkeys(LEGACY_GATE + present) for argument in ['--include-file', path]]
    return [(ROOT, [sys.executable, 'scripts/calidad/gate_ronda.py', *includes, '--semantic-rules', 'strict',
                   '--junk-severity', 'error', '--external-lint', 'run',
                   '--report-path', 'test-results/gate.json', '--json-only'])]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('layer', choices=['backend', 'pos', 'gate'])
    parser.add_argument('--plan', action='store_true')
    args = parser.parse_args()
    jobs = commands(args.layer)
    if args.plan:
        print(json.dumps([{'cwd': str(cwd), 'command': command} for cwd, command in jobs], ensure_ascii=False))
        return 0
    (ROOT / 'test-results').mkdir(exist_ok=True)
    for cwd, command in jobs:
        print(json.dumps({'cwd': str(cwd), 'command': command}, ensure_ascii=False), flush=True)
        result = subprocess.run(command, cwd=cwd, check=False)
        if result.returncode:
            return result.returncode
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
