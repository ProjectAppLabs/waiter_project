"""Contrato T1: catálogo, recetas, impuestos y permisos."""
import importlib
from decimal import Decimal

import pytest
from django.apps import apps
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from catalog.models import Product, Recipe, RecipeLine, RestaurantPrice, RestaurantUnavailable, Tax, Unit
from catalog.services import price_before_taxes
from inventory.models import Stock
from tenancy.tests.helpers import account, organization, platform_client, platform_user, pos_client

BASE = '/api/pos/v1'


def test_carta_precio_impuestos_y_receta_por_restaurante(setup):
    # Falla si se suma otra vez el INC incluido o se mezcla stock y precio de restaurantes.
    x = setup
    RestaurantPrice.objects.create(restaurant=x['r1'], product=x['dish'], price=21600)
    a = x['client'].get(f'{BASE}/catalog?restaurant_id={x["r1"].pk}')
    b = x['client'].get(f'{BASE}/catalog?restaurant_id={x["r2"].pk}')
    p, other = a.json()['products'][0], b.json()['products'][0]
    assert (p['price'], p['restaurant_price'], p['final_price'], p['servings'], p['sold_out']) == (10800, 21600, 21600, 12, False)
    assert (other['restaurant_price'], other['final_price'], other['servings'], other['sold_out']) == (None, 10800, 0, True)
    assert price_before_taxes(10800, [x['tax']]) == Decimal(10000)
    assert a['ETag'] != b['ETag']
    assert set(p) == {'id', 'name', 'kind', 'category_ids', 'tax_ids', 'price', 'restaurant_price', 'final_price', 'favorite',
                      'available_in_pos', 'sold_out', 'has_image', 'image_version', 'image_origin', 'description',
                      'diner_attributes', 'servings', 'preparation_minutes'}


def test_agotado_manual_combo_y_archivo(setup):
    # Falla si un combo ignora un componente agotado, desactivado o sin porciones.
    x = setup
    drink = Product.objects.create(organization=x['org'], name='Agua', kind='dish')
    combo = Product.objects.create(organization=x['org'], name='Combo', kind='dish', diner_attributes={'combo': [
        {'producto': x['dish'].pk, 'cantidad': 1}, {'producto': drink.pk, 'cantidad': 1}]})
    def row(r):
        return next(p for p in x['client'].get(f'{BASE}/catalog?restaurant_id={r.pk}').json()['products'] if p['id'] == combo.pk)
    assert row(x['r1'])['sold_out'] is False
    assert row(x['r2'])['sold_out'] is True
    RestaurantUnavailable.objects.create(restaurant=x['r1'], product=drink)
    assert row(x['r1'])['sold_out'] is True
    RestaurantUnavailable.objects.all().delete()
    x['client'].post(f'{BASE}/products/{drink.pk}/archive')
    assert row(x['r1'])['sold_out'] is True


def test_alta_plato_e_ingrediente(setup):
    # Falla si el alta pierde la receta, los umbrales o las existencias por restaurante.
    x = setup
    response = x['client'].post(f'{BASE}/products', {'kind': 'ingredient', 'name': 'Sal', 'unit_id': x['kg'].pk,
        'pantry_category': 'dry', 'cost': 40, 'supplier_id': x['supplier'].pk, 'min': 10, 'max': 8,
        'initial_stock': [{'restaurant_id': x['r1'].pk, 'qty': 2}, {'restaurant_id': x['r2'].pk, 'qty': 7}]}, format='json')
    assert response.status_code == 201, response.data
    pid = response.data['product']['id']
    assert list(Stock.objects.filter(ingredient_id=pid).order_by('restaurant_id').values_list('qty', 'min', 'max')) == [(2, 10, 25), (7, 10, 25)]
    response = x['client'].post(f'{BASE}/products', {'kind': 'dish', 'name': 'Plato nuevo', 'price': 5000,
        'category_ids': [x['category'].pk], 'tax_ids': [x['tax'].pk], 'recipe': {'yield_qty': 2, 'lines': [
            {'ingredient_id': pid, 'qty': 100, 'unit_id': x['gram'].pk}]}}, format='json')
    assert response.status_code == 201, response.data
    assert Recipe.objects.get(product_id=response.data['product']['id']).lines.get().ingredient_id == pid


@pytest.mark.parametrize('failure', ['root', 'duplicate', 'too_many', 'zero', 'foreign', 'non_object'])
def test_receta_invalida_no_reemplaza_anterior(setup, failure):
    # Falla si una receta inválida se acepta o borra la receta vigente antes de validar.
    x = setup
    line = {'ingredient_id': x['ingredient'].pk, 'qty': 1, 'unit_id': x['kg'].pk}
    lines = [line]
    if failure == 'root':
        line['unit_id'] = x['liter'].pk
    if failure == 'duplicate':
        lines = [line, line]
    if failure == 'too_many':
        lines = [line] * 101
    if failure == 'zero':
        line['qty'] = 0
    if failure == 'foreign':
        line['unit_id'] = Unit.objects.create(organization=organization('otra'), name='kg', root='weight').pk
    if failure == 'non_object':
        lines = [None]
    response = x['client'].put(f'{BASE}/products/{x["dish"].pk}/recipe', {'yield_qty': 1, 'lines': lines}, format='json')
    assert response.status_code in (400, 404), response.data
    assert RecipeLine.objects.get(recipe=x['recipe']).qty == 500


def test_porciones_limitantes_costo_y_overview(setup):
    # Falla si la conversión de gramos o el costo por porción difieren entre receta y resumen.
    x = setup
    response = x['client'].get(f'{BASE}/products/{x["dish"].pk}/recipe').json()
    assert response['recipe']['cost'] == 500
    assert response['by_restaurant'][0] == {'restaurant_id': x['r1'].pk, 'servings': 12, 'limiting': ['Papa'],
        'ingredients': [{'ingredient_id': x['ingredient'].pk, 'name': 'Papa', 'per_serving': 0.25, 'stock': 3,
                         'pending': 0, 'free': 3, 'servings': 12}]}
    x['ingredient'].cost = 0
    x['ingredient'].save()
    recipe = x['client'].get(f'{BASE}/products/{x["dish"].pk}/recipe').json()['recipe']
    assert recipe['cost'] is None and recipe['missing_costs'] == ['Papa']
    overview = x['client'].get(f'{BASE}/catalog/overview').json()
    assert overview['dishes'][0]['recipe_cost'] is None
    assert overview['dishes'][0]['missing_costs'] == ['Papa']
    assert overview['ingredients'][0]['used_in'] == 1
    assert overview['ingredients'][0]['unit'] == 'kg'


def test_eliminar_receta_y_archivar_ingrediente(setup):
    # Falla si se archiva un ingrediente usado o una receta vacía conserva sus limitantes.
    x = setup
    url = f'{BASE}/products/{x["ingredient"].pk}/archive'
    assert x['client'].post(url).json()['error'] == 'in_recipe'
    result = x['client'].put(f'{BASE}/products/{x["dish"].pk}/recipe', {'yield_qty': 1, 'lines': []}, format='json')
    assert result.json()['recipe'] == {'yield_qty': 1, 'lines': [], 'cost': None, 'missing_costs': []}
    assert result.json()['by_restaurant'][0]['servings'] is None
    assert x['client'].post(url).status_code == 200


@pytest.mark.parametrize('role', ['owner', 'admin', 'cashier', 'waiter'])
def test_precios_agotados_y_permisos(setup, role):
    # Falla si un encargado cambia precios o un empleado cambia agotados, o se opera otra sede.
    x = setup
    actor = account(x['org'], role=role, username='persona', restaurants=[] if role == 'owner' else [x['r1']])
    c = pos_client(actor)
    url = f'{BASE}/catalog/restaurants/{x["r1"].pk}/products/{x["dish"].pk}'
    assert c.put(url, {'price': 9000}, format='json').status_code == (200 if role == 'owner' else 403)
    assert c.put(url, {'unavailable': True}, format='json').status_code == (200 if role in ('owner', 'admin') else 403)
    other = f'{BASE}/catalog/restaurants/{x["r2"].pk}/products/{x["dish"].pk}'
    assert c.put(other, {'unavailable': True}, format='json').status_code == (200 if role == 'owner' else 404 if role == 'admin' else 403)
    assert c.get(f'{BASE}/catalog/restaurants').status_code == (200 if role in ('owner', 'admin') else 403)
    assert c.get(f'{BASE}/catalog/overview').status_code == (200 if role in ('owner', 'admin') else 403)


def test_precio_cero_restablecer_y_mapa(setup):
    # Falla si cero se interpreta como quitar el precio o las claves de los mapas no son ids.
    x = setup
    url = f'{BASE}/catalog/restaurants/{x["r1"].pk}/products/{x["dish"].pk}'
    assert x['client'].put(url, {'price': 0, 'unavailable': True}, format='json').status_code == 200
    body = x['client'].get(f'{BASE}/catalog/restaurants').json()
    assert body['prices'][str(x['r1'].pk)] == {str(x['dish'].pk): 0}
    assert body['unavailable'][str(x['r1'].pk)] == [x['dish'].pk]
    assert x['client'].put(url, {'price': None, 'unavailable': False}, format='json').status_code == 200
    assert not RestaurantPrice.objects.exists() and not RestaurantUnavailable.objects.exists()


def test_categorias_proveedores_unidades_y_regimen(setup):
    # Falla si el régimen no reasigna todos los platos o no detecta una carta mixta.
    x = setup
    c = x['client']
    category = c.post(f'{BASE}/categories', {'name': 'Bebidas', 'sequence': 2, 'station': 'Barra'}, format='json')
    assert category.status_code == 201
    pk = category.json()['category']['id']
    assert c.patch(f'{BASE}/categories/{pk}', {'station': ''}, format='json').json()['category']['station'] == ''
    assert c.post(f'{BASE}/suppliers', {'name': 'Proveedor', 'email': 'ventas@ejemplo.co'}, format='json').status_code == 201
    assert len(c.get(f'{BASE}/suppliers').json()['suppliers']) == 2
    assert len(c.get(f'{BASE}/units').json()['units']) == 8
    assert c.get(f'{BASE}/taxes').json()['regime'] == 'inc'
    Product.objects.create(organization=x['org'], name='Sin impuesto', kind='dish')
    assert c.get(f'{BASE}/taxes').json()['regime'] == 'mixed'
    for regime, amount in [('iva', 19), ('none', None), ('inc', 8)]:
        response = c.put(f'{BASE}/taxes/regime', {'regime': regime}, format='json')
        assert response.status_code == 200
        assert c.get(f'{BASE}/taxes').json()['regime'] == regime
        assert all(list(p.taxes.values_list('amount', flat=True)) == ([] if amount is None else [amount]) for p in Product.objects.filter(kind='dish'))


@pytest.mark.parametrize('role', ['admin', 'cashier', 'waiter'])
def test_solo_dueno_escribe_catalogo(setup, role):
    # Falla si un rol operativo modifica la carta compartida, impuestos, recetas o proveedores.
    x = setup
    c = pos_client(account(x['org'], role=role, username='operador', restaurants=[x['r1']]))
    for method, url, body in [('post', '/products', {}), ('patch', f'/products/{x["dish"].pk}', {'price': 1}),
                             ('post', '/categories', {'name': 'Otra'}), ('post', '/suppliers', {'name': 'Otro'}),
                             ('put', '/taxes/regime', {'regime': 'none'}),
                             ('put', f'/products/{x["dish"].pk}/recipe', {'yield_qty': 1, 'lines': []}),
                             ('put', f'/products/{x["dish"].pk}/photos', []), ('post', f'/products/{x["dish"].pk}/archive', {})]:
        response = getattr(c, method)(BASE + url, body, format='json')
        assert response.status_code == 403, (url, response.data)
    assert c.get(f'{BASE}/products').status_code == 200


def test_etag_cambia_por_escritura_y_revalida(setup):
    # Falla si un cambio sin efecto visible en la carta conserva la revisión anterior.
    x = setup
    url = f'{BASE}/catalog?restaurant_id={x["r1"].pk}'
    old = x['client'].get(url)['ETag']
    assert x['client'].get(url, HTTP_IF_NONE_MATCH=old).status_code == 304
    x['client'].post(f'{BASE}/suppliers', {'name': 'Nuevo'}, format='json')
    assert x['client'].get(url)['ETag'] != old


def test_aislamiento_y_sesion(setup):
    # Falla si otro inquilino puede leer o enlazar productos, unidades o restaurantes ajenos.
    x = setup
    other = organization('otra')
    c = pos_client(account(other))
    assert c.get(f'{BASE}/products').json() == {'products': []}
    assert c.get(f'{BASE}/products/{x["dish"].pk}/recipe').status_code == 404
    assert c.get(f'{BASE}/catalog?restaurant_id={x["r1"].pk}').status_code == 404
    response = c.post(f'{BASE}/products', {'kind': 'ingredient', 'name': 'Ajeno', 'unit_id': x['kg'].pk, 'pantry_category': 'dry'}, format='json')
    assert response.status_code == 404
    public = APIClient()
    public.credentials(HTTP_X_WAITER_ORG=x['org'].slug)
    assert public.get(f'{BASE}/products').status_code == 401
    x['client'].credentials(HTTP_X_WAITER_ORG=other.slug)
    assert x['client'].get(f'{BASE}/products').status_code == 401


def test_consultas_no_crecen_por_producto(setup):
    # Falla si la carta o el inventario consultan recetas, categorías o existencias por producto.
    x = setup
    for url in [f'{BASE}/catalog?restaurant_id={x["r1"].pk}', f'{BASE}/inventory?restaurant_id={x["r1"].pk}&dishes=1']:
        with CaptureQueriesContext(connection) as first:
            assert x['client'].get(url).status_code == 200
        for i in range(20):
            p = Product.objects.create(organization=x['org'], name=f'Plato {i}', kind='dish')
            p.categories.add(x['category'])
            p.taxes.add(x['tax'])
            recipe = Recipe.objects.create(product=p)
            RecipeLine.objects.create(recipe=recipe, ingredient=x['ingredient'], qty=1, unit=x['kg'])
        with CaptureQueriesContext(connection) as second:
            assert x['client'].get(url).status_code == 200
        assert len(second) <= len(first), [q['sql'] for q in second]


def test_siembra_alta_y_migracion_idempotente(setup):
    # Falla si nuevas organizaciones o las anteriores a T1 quedan sin las ocho unidades o los impuestos.
    c = platform_client(platform_user())
    response = c.post('/api/platform/v1/organizations', {'name': 'Nueva', 'slug': 'nueva',
        'owner': {'name': 'Dueña', 'email': 'duena@ejemplo.co'}}, format='json')
    assert response.status_code == 201, response.data
    assert Unit.objects.filter(organization__slug='nueva').count() == 8
    assert set(Tax.objects.filter(organization__slug='nueva').values_list('name', 'amount', 'included')) == {('INC 8 %', 8, True), ('IVA 19 %', 19, True)}
    old = organization('anterior')
    migration = importlib.import_module('catalog.migrations.0002_seed_organizations')
    editor = connection.schema_editor()
    migration.seed(apps, editor)
    migration.seed(apps, editor)
    assert Unit.objects.filter(organization=old).count() == 8
    assert Tax.objects.filter(organization=old).count() == 2


def test_alta_combo_y_costos_agregados(setup):
    # Falla si el alta de combo consulta una receta de un producto aún sin id o no suma ingredientes compartidos.
    x = setup
    other = Product.objects.create(organization=x['org'], kind='dish', name='Otra papa')
    recipe = Recipe.objects.create(product=other)
    RecipeLine.objects.create(recipe=recipe, ingredient=x['ingredient'], unit=x['kg'], qty=1)
    response = x['client'].post(f'{BASE}/products', {'kind': 'dish', 'name': 'Combo', 'price': 14000,
        'category_ids': [x['category'].pk], 'tax_ids': [x['tax'].pk], 'diner_attributes': {'combo': [
            {'producto': x['dish'].pk, 'cantidad': 2}, {'producto': other.pk, 'cantidad': 1}]}}, format='json')
    assert response.status_code == 201, response.data
    pk = response.json()['product']['id']
    combo = next(p for p in x['client'].get(f'{BASE}/catalog?restaurant_id={x["r1"].pk}').json()['products'] if p['id'] == pk)
    assert combo['servings'] == 2 and combo['sold_out'] is False
    overview = next(p for p in x['client'].get(f'{BASE}/catalog/overview').json()['dishes'] if p['id'] == pk)
    assert overview['recipe_cost'] == 3000 and overview['ingredients_count'] == 1
    assert x['client'].put(f'{BASE}/products/{pk}/recipe', {'yield_qty': 1, 'lines': []}, format='json').status_code == 400
    assert x['client'].patch(f'{BASE}/products/{x["dish"].pk}', {'diner_attributes': combo['diner_attributes']}, format='json').status_code == 400


@pytest.mark.parametrize('failure', ['one', 'many', 'duplicate', 'quantity', 'nested', 'ingredient', 'foreign', 'self', 'unavailable'])
def test_combo_invalido(setup, failure):
    # Falla si se aceptan combos anidados, componentes ajenos o cantidades fuera del contrato.
    x = setup
    a = Product.objects.create(organization=x['org'], kind='dish', name='Agua')
    b = Product.objects.create(organization=x['org'], kind='dish', name='Jugo')
    target = Product.objects.create(organization=x['org'], kind='dish', name='Combo')
    items = [{'producto': a.pk, 'cantidad': 1}, {'producto': b.pk, 'cantidad': 1}]
    if failure == 'one':
        items = items[:1]
    elif failure == 'many':
        items *= 7
    elif failure == 'duplicate':
        items[1]['producto'] = a.pk
    elif failure == 'quantity':
        items[0]['cantidad'] = 21
    elif failure == 'nested':
        a.diner_attributes = {'combo': [{'producto': x['dish'].pk, 'cantidad': 1}, {'producto': b.pk, 'cantidad': 1}]}
        a.save()
    elif failure == 'ingredient':
        items[0]['producto'] = x['ingredient'].pk
    elif failure == 'foreign':
        items[0]['producto'] = Product.objects.create(organization=organization('otra'), kind='dish', name='Ajeno').pk
    elif failure == 'self':
        items[0]['producto'] = target.pk
    else:
        a.available_in_pos = False
        a.save()
    response = x['client'].patch(f'{BASE}/products/{target.pk}', {'diner_attributes': {'combo': items}}, format='json')
    assert response.status_code in (400, 404), response.data
    target.refresh_from_db()
    assert target.diner_attributes == {}


@pytest.mark.parametrize('body', [{'price': True}, {'price': -1}, {'favorite': 'false'}, {'available_in_pos': 1},
                                 {'diner_attributes': {'desconocida': 1}}, {'diner_attributes': {'picante': 4}},
                                 {'diner_attributes': {'soloHoy': 'true'}}, {'diner_attributes': {'tamanos': [None]}},
                                 {'diner_attributes': {'nutricion': {'calorias': -1}}}, {'category_ids': [True]},
                                 {'preparation_minutes': -1}, {'name': ''}, {'kind': 'ingredient'}, {'unknown': 1}])
def test_validacion_campos_no_deja_cambios_parciales(setup, body):
    # Falla si se convierten booleanos a dinero o se guardan atributos fuera del esquema del comensal.
    x = setup
    response = x['client'].patch(f'{BASE}/products/{x["dish"].pk}', body, format='json')
    assert response.status_code == 400, response.data
    x['dish'].refresh_from_db()
    assert x['dish'].price == 10800 and x['dish'].name == 'Papas'


def test_cambiar_unidad_conserva_cantidades_costo_e_historial(setup):
    # Falla si editar kg a g cambia las porciones, pierde costo o reinterpreta el historial de movimientos.
    x = setup
    response = x['client'].post(f'{BASE}/inventory/{x["ingredient"].pk}/moves', {'restaurant_id': x['r1'].pk,
        'kind': 'receipt', 'qty': 1, 'reason': 'Entrega', 'request_key': 'cambiar-unidad-recibo'}, format='json')
    assert response.status_code == 200
    result = x['client'].patch(f'{BASE}/products/{x["ingredient"].pk}', {'unit_id': x['gram'].pk}, format='json')
    assert result.status_code == 200, result.data
    assert result.json()['product']['cost'] == 2
    detail = x['client'].get(f'{BASE}/inventory/{x["ingredient"].pk}?restaurant_id={x["r1"].pk}').json()
    assert (detail['stock'], detail['min'], detail['max'], detail['unit']) == (4000, 5000, 20000, 'g')
    assert detail['history'][0]['qty'] == 1000
    recipe = x['client'].get(f'{BASE}/products/{x["dish"].pk}/recipe').json()
    assert recipe['recipe']['cost'] == 500 and recipe['by_restaurant'][0]['servings'] == 16
    assert x['client'].patch(f'{BASE}/products/{x["ingredient"].pk}', {'unit_id': x['liter'].pk}, format='json').status_code == 400


def test_campos_opcionales_y_busqueda(setup):
    # Falla si la ficha pierde atributos válidos o el filtro devuelve ingredientes como platos.
    x = setup
    attrs = {'ingredientes': ['Papa'], 'extras': [], 'acompanamientos': [], 'nutricion': {'calorias': 120},
             'piezas': 2, 'picante': 1, 'etiquetas': ['casero'], 'alergenos': [], 'abv': 0, 'ibu': 0,
             'tamanos': [{'nombre': 'Grande', 'precio': 18000}], 'soloHoy': True, 'tiempoPreparacion': 10, 'precioAntes': 12000}
    response = x['client'].patch(f'{BASE}/products/{x["dish"].pk}', {'diner_attributes': attrs, 'image_origin': 'ai',
        'preparation_minutes': 10, 'favorite': True, 'description': 'Con sal'}, format='json')
    assert response.status_code == 200, response.data
    p = x['client'].get(f'{BASE}/products?kind=dish&q=PAPAS').json()['products'][0]
    assert p['diner_attributes'] == attrs and p['image_origin'] == 'ai' and p['preparation_minutes'] == 10
    assert 'sold_out' not in p
    assert x['client'].get(f'{BASE}/products?kind=ingredient&q=Inexistente').json() == {'products': []}
