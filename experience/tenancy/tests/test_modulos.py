"""Regresiones del catálogo comercial y sus excepciones."""
from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from tenancy.http import Problem
from tenancy.models import OrganizationModule, PlatformAudit
from tenancy.modules import active_modules, is_active, set_module
from .helpers import organization, restaurant

pytestmark = pytest.mark.django_db


# Falla si la plantilla completa pierde capacidades que ya existían.
def test_completo_conserva_capacidades():
    org = organization()
    assert org.plan == 'completo'
    assert len(active_modules(org)) == 11
    assert not is_active(org, 'datafono')


# Falla si una excepción local no gana, o se aplica antes de empezar o después de vencer.
def test_prioridad_y_vigencia():
    org = organization()
    local = restaurant(org)
    set_module(None, org, 'inventario', False)
    set_module(None, org, 'inventario', True, local)
    assert is_active(org, 'inventario', local) and not is_active(org, 'inventario')
    OrganizationModule.objects.filter(restaurant=local).update(ends=timezone.now() - timedelta(seconds=1))
    assert not is_active(org, 'inventario', local)
    OrganizationModule.objects.filter(restaurant=None).update(starts=timezone.now() + timedelta(days=1))
    assert is_active(org, 'inventario', local)


# Falla si apagar una dependencia rompe otros módulos o deja una modificación sin auditoría.
def test_dependencias_y_auditoria_atomicas():
    org = organization()
    with pytest.raises(Problem) as error:
        set_module(None, org, 'menu_comensal', False)
    assert error.value.body['error'] == 'module_dependency'
    assert not OrganizationModule.objects.exists() and not PlatformAudit.objects.exists()
    set_module(None, org, 'fidelizacion', False)
    set_module(None, org, 'asistente_menu', False)
    set_module(None, org, 'pagos_en_linea', False)
    set_module(None, org, 'menu_comensal', False)
    with pytest.raises(Problem):
        set_module(None, org, 'asistente_menu', True)
    assert PlatformAudit.objects.filter(action='module_change').count() == 4


# Falla si MySQL puede guardar dos excepciones de organización por tener local NULL.
def test_unicidad_sin_indices_parciales():
    org = organization()
    OrganizationModule.objects.create(organization=org, key='inventario')
    with pytest.raises(IntegrityError), transaction.atomic():
        OrganizationModule.objects.create(organization=org, key='inventario')


# Falla si una dependencia local o una vigencia futura quedan fuera de la validación.
def test_dependencias_por_local_y_vencimiento():
    org = organization()
    local = restaurant(org)
    set_module(None, org, 'asistente_menu', False)
    set_module(None, org, 'fidelizacion', False)
    set_module(None, org, 'asistente_menu', True, local)
    with pytest.raises(Problem):
        set_module(None, org, 'menu_comensal', False)
    set_module(None, org, 'asistente_menu', False, local, ends=timezone.now() + timedelta(days=1))
    set_module(None, org, 'pagos_en_linea', False)
    set_module(None, org, 'menu_comensal', False)
    with pytest.raises(Problem):
        set_module(None, org, 'fidelizacion', False, ends=timezone.now() + timedelta(days=1))


# Falla si la caché sobrevive a otra petición o queda obsoleta tras editar una excepción.
def test_cache_solo_durante_peticion(django_assert_num_queries):
    from tenancy.modules import ModuleCacheMiddleware
    org = organization()

    def consultar(request):
        with django_assert_num_queries(1):
            assert is_active(org, 'inventario')
            assert is_active(org, 'cocina')
        set_module(None, org, 'inventario', False)
        assert not is_active(org, 'inventario')

    ModuleCacheMiddleware(consultar)(None)
    OrganizationModule.objects.all().delete()
    assert is_active(org, 'inventario')


# Falla si la migración deja un plan histórico distinto de completo o divide el precio por local.
def test_migracion_normaliza_planes_sin_tocar_precio():
    import importlib
    from django.apps import apps
    org = organization(plan='basico', monthly_price=150000)
    importlib.import_module('tenancy.migrations.0007_catalogo_y_excepciones_de_modulos').normalizar_planes(apps, None)
    org.refresh_from_db()
    assert org.plan == 'completo' and org.monthly_price == 150000


# Falla si dueño y encargado eluden un módulo apagado o una reactivación pierde datos.
@pytest.mark.parametrize('rol', ['owner', 'admin'])
def test_vista_bloqueada_conserva_datos(rol):
    from catalog.models import Product
    from .helpers import account, pos_client
    org = organization()
    local = restaurant(org)
    persona = account(org, rol, restaurants=[local] if rol == 'admin' else [])
    cliente = pos_client(persona)
    plato = Product.objects.create(organization=org, name='Arroz', kind='ingredient')
    set_module(None, org, 'inventario', False, local)
    ruta = f'/api/pos/v1/inventory?restaurant_id={local.pk}'
    respuesta = cliente.get(ruta)
    assert respuesta.status_code == 403
    assert respuesta.json()['error'] == 'module_inactive'
    assert respuesta.json()['module_name'] == 'Inventario'
    assert Product.objects.filter(pk=plato.pk).exists()
    set_module(None, org, 'inventario', True, local)
    assert cliente.get(ruta).status_code == 200


# Falla si settings o la sesión no distinguen los módulos de cada local.
def test_contrato_modulos_por_local():
    from .helpers import account, pos_client
    org = organization()
    local = restaurant(org)
    set_module(None, org, 'inventario', False, local)
    cliente = pos_client(account(org))
    sesion = cliente.get('/api/pos/v1/auth/me').json()
    assert 'inventario' in sesion['modules']
    assert 'inventario' not in sesion['restaurant_modules'][str(local.pk)]
    assert 'inventario' not in cliente.get(f'/api/pos/v1/settings?restaurant_id={local.pk}').json()['modules']


# Falla si can concede acciones del módulo apagado antes de comprobar el rol.
def test_modulo_antes_del_rol():
    from sales.policy import can
    from .helpers import account
    org = organization()
    persona = account(org)
    set_module(None, org, 'inventario', False)
    assert not can(persona, 'inventory') and not can(persona, 'edit_inventory')
    assert can(persona, 'refund_orders')


# Falla si crear el segundo local omite el módulo multisucursal.
def test_segundo_local_requiere_multisucursal():
    from .helpers import account, pos_client
    org = organization(max_restaurants=4)
    cliente = pos_client(account(org))
    set_module(None, org, 'multisucursal', False)
    assert cliente.post('/api/pos/v1/restaurants', {'name': 'Centro', 'slug': 'centro'}, format='json').status_code == 201
    respuesta = cliente.post('/api/pos/v1/restaurants', {'name': 'Norte', 'slug': 'norte'}, format='json')
    assert respuesta.status_code == 403 and respuesta.json()['module'] == 'multisucursal'


# Falla si el operador escribe módulos, un local ajeno entra en la excepción o quitarla pierde el origen.
def test_contrato_plataforma_y_permisos():
    from .helpers import platform_client, platform_user
    org = organization()
    local = restaurant(org)
    ajeno = restaurant(organization('ajena'))
    ruta = f'/api/platform/v1/organizations/{org.slug}/modules'
    operador = platform_client(platform_user('operator'))
    assert operador.get(ruta).status_code == 200
    assert operador.patch(ruta, {'key': 'inventario', 'active': False}, format='json').status_code == 403
    cliente = platform_client(platform_user(username='administrador'))
    assert cliente.patch(ruta, {'key': 'inventario', 'active': False, 'restaurant_id': ajeno.pk}, format='json').status_code == 404
    body = {'key': 'inventario', 'active': False, 'restaurant_id': local.pk, 'notes': 'Piloto'}
    resultado = cliente.patch(ruta, body, format='json')
    assert resultado.status_code == 200
    fila = next(r for r in resultado.json()['restaurants'][0]['modules'] if r['key'] == 'inventario')
    assert fila['source'] == 'restaurant' and not fila['active'] and fila['notes'] == 'Piloto'
    resultado = cliente.patch(ruta, {'key': 'inventario', 'restaurant_id': local.pk, 'clear': True}, format='json')
    fila = next(r for r in resultado.json()['restaurants'][0]['modules'] if r['key'] == 'inventario')
    assert fila['source'] == 'plan' and fila['active']
    assert PlatformAudit.objects.filter(action='module_change').count() == 2


# Falla si una app que no usa can devuelve datos de un módulo apagado.
@pytest.mark.parametrize('modulo,ruta', [
    ('salon', 'floors'), ('cocina', 'kitchen/tickets'), ('inventario', 'inventory'),
    ('inventario', 'reports/profitability'), ('facturacion', 'documents'),
    ('facturacion', 'billing/settings'), ('fidelizacion', 'customers'), ('reservas', 'reservations'),
])
def test_guardas_de_vistas_por_modulo(modulo, ruta):
    from .helpers import account, pos_client
    org = organization()
    local = restaurant(org)
    cliente = pos_client(account(org))
    set_module(None, org, modulo, False, local)
    resultado = cliente.get(f'/api/pos/v1/{ruta}?restaurant_id={local.pk}')
    assert resultado.status_code == 403
    assert resultado.json()['error'] == 'module_inactive' and resultado.json()['module'] == modulo


# Falla si los errores de dependencia omiten los nombres que espera la consola.
def test_contrato_errores_dependencias():
    from .helpers import platform_client, platform_user
    org = organization()
    cliente = platform_client(platform_user())
    ruta = f'/api/platform/v1/organizations/{org.slug}/modules'
    resultado = cliente.patch(ruta, {'key': 'menu_comensal', 'active': False}, format='json')
    assert resultado.status_code == 409
    assert set(resultado.json()) == {'error', 'message', 'dependents'}
    assert 'Fidelización' in resultado.json()['dependents']
    for key in ('asistente_menu', 'fidelizacion', 'pagos_en_linea', 'menu_comensal'):
        assert cliente.patch(ruta, {'key': key, 'active': False}, format='json').status_code == 200
    resultado = cliente.patch(ruta, {'key': 'fidelizacion', 'active': True}, format='json')
    assert resultado.status_code == 409 and resultado.json()['missing'] == ['Menú del comensal']


# Falla si borrar una excepción deja una dependencia local activa sin su módulo base.
def test_quitar_excepcion_valida_dependencias():
    from tenancy.modules import change_modules
    from .helpers import platform_user
    org = organization()
    local = restaurant(org)
    set_module(None, org, 'asistente_menu', False)
    set_module(None, org, 'fidelizacion', False)
    set_module(None, org, 'pagos_en_linea', False)
    set_module(None, org, 'menu_comensal', False)
    set_module(None, org, 'menu_comensal', True, local)
    set_module(None, org, 'asistente_menu', True, local)
    with pytest.raises(Problem):
        change_modules(platform_user(), org, {'key': 'menu_comensal', 'restaurant_id': local.pk, 'clear': True})
    assert is_active(org, 'menu_comensal', local)
