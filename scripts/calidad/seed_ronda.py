"""Prepara datos sintéticos en una base de pruebas, nunca en la base del servicio.

El runner de Django crea y migra su base de pruebas; no ejecuta manage.py migrate.
Se usa para el navegador local y el CI de la ronda, con MySQL aislado.
"""
import json
import os
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'experience'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'experience_project.settings')

import django

django.setup()

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import connection
from django.test.utils import setup_databases
from rest_framework.test import APIClient

from accounts.models import Account
from catalog.models import Category, Product, Tax
from catalog.services import seed_organization
from sales.models import PaymentMethod
from tables.models import Floor, Table
from tenancy.models import Organization, PlatformUser, Restaurant

USERNAME = 'operador.qa'
PASSWORD = 'Waiter-X0-QA-2026!'


def main():
    db = connection.settings_dict
    test_name = db.get('TEST', {}).get('NAME', '')
    if (settings.IS_PRODUCTION or db['ENGINE'] != 'django.db.backends.mysql'
            or db['NAME'] != 'waiter_qa_source' or db['HOST'] != '127.0.0.1'
            or not test_name.startswith('test_waiter_qa_')):
        raise SystemExit('La fixture exige desarrollo, MySQL local y nombres explícitos de pruebas.')
    setup_databases(verbosity=0, interactive=False, keepdb=True)
    org, _ = Organization.objects.get_or_create(slug='qa-x0', defaults={'name': 'Waiter QA x0', 'status': 'active'})
    seed_organization(org)
    restaurant, _ = Restaurant.objects.get_or_create(
        organization=org, slug='local-qa', defaults={'name': 'Local QA'})
    floor, _ = Floor.objects.get_or_create(
        restaurant=restaurant, name='Salón QA r3', defaults={'sequence': 0, 'active': True})
    table, _ = Table.objects.update_or_create(
        floor=floor, number=931,
        defaults={'active': True, 'seats': 4, 'x': 40, 'y': 40})
    person, _ = Account.objects.get_or_create(organization=org, username=USERNAME, defaults={
        'name': 'Operador QA', 'role': 'owner', 'email': 'operador.qa@example.test',
        'activated': True, 'password': make_password(PASSWORD)})
    person.restaurants.set([restaurant])
    PlatformUser.objects.update_or_create(username='plataforma.r2.qa', defaults={
        'name': 'Operador plataforma QA', 'role': 'operator', 'email': 'plataforma.r2.qa@example.test',
        'active': True, 'activated': True, 'password': make_password('Waiter-R2-QA-2026!'),
    })
    dish, _ = Product.objects.get_or_create(organization=org, name='Hamburguesa QA',
                                           defaults={'kind': 'dish', 'price': 38900})
    excluded_tax, _ = Tax.objects.update_or_create(
        organization=org, name='IVA excluido QA r3',
        defaults={'amount': 19, 'included': False, 'active': True})
    taxed_dish, _ = Product.objects.update_or_create(
        organization=org, name='Plato gravado QA r3',
        defaults={'kind': 'dish', 'price': 10000, 'active': True, 'available_in_pos': True})
    taxed_dish.taxes.set([excluded_tax])
    round_category, _ = Category.objects.update_or_create(
        organization=org, name='Platos QA r3',
        defaults={'active': True, 'sequence': 0})
    taxed_dish.categories.set([round_category])
    client = APIClient()
    client.credentials(HTTP_X_WAITER_ORG=org.slug, HTTP_HOST='127.0.0.1')

    def call(method, path, data=None, status=200):
        response = getattr(client, method)('/api/pos/v1/' + path, data or {}, format='json')
        if response.status_code != status:
            raise RuntimeError(f'La fixture no pudo completar {path}: {response.status_code}.')
        return response.data

    call('post', 'auth/login', {'login': USERNAME, 'password': PASSWORD})
    shift = call('get', f'shifts/open?restaurant_id={restaurant.pk}')['shift']
    if not shift:
        shift = call('post', 'shifts', {'restaurant_id': restaurant.pk, 'opening_cash': 100000,
                                       'notes': 'Fixture aislada de la ronda'}, 201)['shift']

    def order(name):
        return call('post', 'orders', {'restaurant_id': restaurant.pk, 'uuid': str(uuid4()),
            'service': 'takeout', 'customer_name': name, 'fire': False,
            'lines': [{'uuid': str(uuid4()), 'product_id': dish.pk, 'qty': 1}]}, 201)['order']

    pending = order('Pago QA x0')
    paid = order('Historial QA x0')
    method = PaymentMethod.objects.get(type='cash', restaurants=restaurant)
    call('post', f"orders/{paid['id']}/payments", {'method_id': method.pk,
         'amount': paid['total'], 'request_key': str(uuid4())})
    call('post', f"orders/{paid['id']}/pay")
    print(json.dumps({'organization': org.slug, 'restaurant_id': restaurant.pk,
         'shift_id': shift['id'], 'pending_id': pending['id'], 'paid_id': paid['id'],
         'product_id': dish.pk, 'total': pending['total'],
         'taxed_product_id': taxed_dish.pk, 'taxed_total': 11900,
         'round_category_id': round_category.pk,
         'round_table_id': table.pk, 'round_table_number': table.number}, ensure_ascii=False))


if __name__ == '__main__':
    main()
