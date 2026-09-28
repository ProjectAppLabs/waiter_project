"""Alta e índice de restaurantes dentro de una organización."""
from unittest.mock import patch

import pytest
from django.core.exceptions import ValidationError
from django.core.management import call_command, CommandError
from django.test import override_settings

from registry_app.models import Venue, TableToken
from registry_app.management.commands.seed_demo import _odoo_tables


@pytest.mark.django_db
@override_settings(REGISTRY_INTERNAL_KEY='interna')
def test_internal_restaurants_requires_key_and_never_releases_credentials(api_client, venue):
    # Falla si el índice interno expone credenciales, locales inactivos o acepta otra clave.
    url = '/internal/v1/organizaciones/burger-house/restaurantes/'
    assert api_client.get(url).status_code == 401
    Venue.objects.create(restaurant=venue.restaurant, slug='cerrado', name='Cerrado', active=False,
                         odoo_url=venue.odoo_url, odoo_db=venue.odoo_db, odoo_login=venue.odoo_login,
                         odoo_secret=venue.odoo_secret, pos_config_id=2)
    response = api_client.get(url, HTTP_X_INTERNAL_KEY='interna')
    assert response.json() == [{'slug': 'poblado', 'name': 'Poblado'}]
    assert venue.credential_releases.count() == 0
    assert api_client.get(url.replace('burger-house', 'desconocida'), HTTP_X_INTERNAL_KEY='interna').status_code == 404


@pytest.mark.django_db
def test_add_venue_copies_database_and_creates_only_its_table_tokens(venue):
    # Falla si añadir un local crea otra base, pierde sus credenciales o duplica los tokens al reintentar.
    with patch('registry_app.management.commands.add_venue._odoo_tables', return_value=[{'id': 20, 'table_number': 1}]) as read:
        call_command('add_venue', 'burger-house', 'laureles', 'Laureles', pos_config_id=2)
        call_command('add_venue', 'burger-house', 'laureles', 'Laureles', pos_config_id=2)
    new = Venue.objects.get(slug='laureles')
    assert (new.odoo_url, new.odoo_db, new.odoo_login, new.odoo_password) == (
        venue.odoo_url, venue.odoo_db, venue.odoo_login, venue.odoo_password)
    assert new.pos_config_id == 2
    assert list(TableToken.objects.filter(venue=new).values_list('odoo_table_id', flat=True)) == [20]
    assert read.call_args.args[-1] == 2


@pytest.mark.django_db
def test_organization_rejects_another_database(venue):
    # Falla si dos restaurantes de la misma organización terminan con catálogos en bases distintas.
    with pytest.raises(ValidationError):
        Venue.objects.create(restaurant=venue.restaurant, slug='otro', name='Otro', odoo_url=venue.odoo_url,
                             odoo_db='otra_base', odoo_login='svc', odoo_secret=venue.odoo_secret, pos_config_id=2)


def test_table_provisioning_validates_config_and_filters_its_floor():
    # Falla si el aprovisionamiento copia mesas ajenas o acepta un config inexistente.
    with patch('registry_app.management.commands.seed_demo.requests.Session') as session:
        post = session.return_value.post
        post.return_value.json.side_effect = [{'result': {'uid': 2}}, {'result': [{'id': 7}]},
                                             {'result': [{'id': 20, 'table_number': 1}]}]
        assert _odoo_tables('http://odoo', 'demo', 'svc', 'clave', 7) == [{'id': 20, 'table_number': 1}]
        assert post.call_args_list[1].kwargs['json']['params']['args'][0] == [['id', '=', 7]]
        assert post.call_args_list[2].kwargs['json']['params']['args'][0] == [
            ['active', '=', True], ['floor_id.pos_config_ids', 'in', [7]]]
        post.return_value.json.side_effect = [{'result': {'uid': 2}}, {'result': []}]
        with pytest.raises(CommandError, match='config indicado'):
            _odoo_tables('http://odoo', 'demo', 'svc', 'clave', 99)
