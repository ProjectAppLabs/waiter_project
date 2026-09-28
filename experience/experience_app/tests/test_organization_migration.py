"""La migración conserva la organización actual, su cuenta y sus recursos del menú."""
import hashlib

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


@pytest.mark.django_db(transaction=True)
def test_existing_poblado_data_migrates_without_resetting_accounts_or_design():
    # Falla si migrar Poblado pierde el diseño, las claves, los premios o la protección del descuento ya utilizado.
    previous = [('experience_app', '0028_diner_reward')]
    latest = [('experience_app', '0029_organization_scope')]
    executor = MigrationExecutor(connection)
    executor.migrate(previous)
    old = executor.loader.project_state(previous).apps
    def model(name):
        return old.get_model('experience_app', name)
    try:
        account = model('DinerAccount').objects.create(name='Ana', email='Ana@example.com', verified=True)
        session = model('TableSession').objects.create(restaurant_slug='burger-house', venue_slug='poblado')
        diner = model('Diner').objects.create(session=session, account=account)
        order = model('Order').objects.create(session=session)
        old_key = hashlib.sha256(f'cookie:{diner.benefit_key}'.encode()).hexdigest()
        model('SignupDiscountClaim').objects.create(key=old_key, order=order)
        template, _ = model('MenuTemplate').objects.get_or_create(code='S1', defaults={'family': 'S', 'name': 'Menú'})
        model('VenueMenuSettings').objects.create(restaurant_slug='burger-house', venue_slug='', template=template,
                                                 theme={'version': 1})
        model('VenueMenuSettings').objects.create(restaurant_slug='burger-house', venue_slug='poblado', template=template,
                                                 theme={'version': 2, 'fundamentos': {'densidad': .9}})
        key = model('McpKey').objects.create(restaurant_slug='burger-house', venue_slug='poblado', name='Diseño', prefix='wtr_prueba', key_hash='a' * 64)
        draft = model('McpPendingChange').objects.create(key=key, kind='design', payload={})
        model('DinerFavorite').objects.create(account=account, restaurant_slug='burger-house', venue_slug='poblado', product_id=3)
        model('DinerFavorite').objects.create(account=account, restaurant_slug='burger-house', venue_slug='', product_id=3)
        model('DinerReward').objects.create(account=account, restaurant_slug='burger-house', venue_slug='', action='opinion', reward='descuento', state='disponible')
        model('DinerReward').objects.create(account=account, restaurant_slug='burger-house', venue_slug='poblado', action='opinion', reward='descuento', state='usado')
        executor = MigrationExecutor(connection)
        executor.migrate(latest)
        apps = executor.loader.project_state(latest).apps
        migrated = apps.get_model('experience_app', 'DinerAccount').objects.get(pk=account.pk)
        assert migrated.organization_slug == 'burger-house' and migrated.email == 'ana@example.com' and migrated.verified
        for name in ('VenueMenuSettings', 'McpKey', 'McpPendingChange', 'DinerFavorite', 'DinerReward'):
            assert apps.get_model('experience_app', name).objects.get().venue_slug == ''
        change = apps.get_model('experience_app', 'McpPendingChange').objects.get(pk=draft.pk)
        assert change.restaurant_slug == 'burger-house' and change.payload['preview_venue_slug'] == 'poblado'
        claim = apps.get_model('experience_app', 'SignupDiscountClaim').objects.get()
        assert claim.organization_slug == 'burger-house'
        assert claim.key == hashlib.sha256(f'burger-house:{old_key}'.encode()).hexdigest()
        assert apps.get_model('experience_app', 'DinerReward').objects.get().state == 'usado'
        assert apps.get_model('experience_app', 'VenueMenuSettings').objects.get().theme['version'] == 2
    finally:
        MigrationExecutor(connection).migrate(latest)
