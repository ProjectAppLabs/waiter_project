"""Conserva los datos de Poblado al compartir identidad y diseño por organización."""
import hashlib

from django.db import migrations, models
from django.db.models.functions import Lower


def organization_scope(apps, schema_editor):
    alias = schema_editor.connection.alias
    def rows(name):
        return apps.get_model('experience_app', name).objects.using(alias)

    for account in rows('DinerAccount').all():
        organizations = set(rows('Diner').filter(account_id=account.pk).values_list('session__restaurant_slug', flat=True))
        organizations.update(rows('DinerFavorite').filter(account_id=account.pk).values_list('restaurant_slug', flat=True))
        organizations.update(rows('DinerReward').filter(account_id=account.pk).values_list('restaurant_slug', flat=True))
        if len(organizations) > 1:
            raise RuntimeError('Hay una cuenta histórica usada en varias organizaciones; separa sus vínculos antes de migrar.')
        organization = next(iter(organizations), 'burger-house')
        rows('DinerAccount').filter(pk=account.pk).update(organization_slug=organization, email=account.email.strip().lower())
    for claim in rows('SignupDiscountClaim').select_related('order__session'):
        organization = claim.order.session.restaurant_slug
        rows('SignupDiscountClaim').filter(pk=claim.pk).update(
            organization_slug=organization,
            key=hashlib.sha256(f'{organization}:{claim.key}'.encode()).hexdigest())

    # Una organización conserva sus ajustes más recientes. En la base actual solo existe Poblado.
    selected = {}
    for row in rows('VenueMenuSettings').order_by('-updated_at', '-id'):
        selected.setdefault(row.restaurant_slug, row.pk)
    rows('VenueMenuSettings').exclude(pk__in=selected.values()).delete()
    rows('VenueMenuSettings').update(venue_slug='')
    seen = {}
    discarded = []
    for row in rows('MenuDecoration').order_by('id'):
        key = (row.restaurant_slug, row.slug)
        if key in seen:
            if bytes(row.data) != seen[key]:
                raise RuntimeError('Hay decoraciones distintas con el mismo nombre dentro de una organización.')
            discarded.append(row.pk)
        else:
            seen[key] = bytes(row.data)
    rows('MenuDecoration').filter(pk__in=discarded).delete()
    rows('MenuDecoration').update(venue_slug='')
    for change in rows('McpPendingChange').select_related('key'):
        organization = change.restaurant_slug or (change.key.restaurant_slug if change.key_id else '')
        venue = change.venue_slug or (change.key.venue_slug if change.key_id else '')
        payload = {**change.payload, 'preview_venue_slug': change.payload.get('preview_venue_slug') or venue}
        rows('McpPendingChange').filter(pk=change.pk).update(restaurant_slug=organization, venue_slug='', payload=payload)
    rows('McpKey').update(venue_slug='')
    for name, keys in [('DinerFavorite', ('account_id', 'restaurant_slug', 'product_id')),
                       ('DinerReward', ('account_id', 'restaurant_slug', 'action', 'reference'))]:
        seen = set()
        # Un premio consumido prevalece: migrar nunca devuelve un beneficio gastado.
        ordered = list(rows(name).all())
        if name == 'DinerReward':
            priority = {'usado': 0, 'acreditado': 1, 'reservado': 2, 'pendiente': 3, 'disponible': 4}
            ordered.sort(key=lambda row: (priority[row.state], row.pk))
        discarded = []
        for row in ordered:
            key = tuple(getattr(row, field) for field in keys)
            if key in seen:
                discarded.append(row.pk)
            else:
                seen.add(key)
        # Elimina duplicados antes de ocupar la clave canónica; podría existir ya una fila sin sede.
        rows(name).filter(pk__in=discarded).delete()
        rows(name).update(venue_slug='')


class Migration(migrations.Migration):
    dependencies = [('experience_app', '0028_diner_reward')]

    operations = [
        migrations.AddField(model_name='dineraccount', name='organization_slug',
                            field=models.SlugField(default='', max_length=60, db_index=True), preserve_default=False),
        migrations.AddField(model_name='signupdiscountclaim', name='organization_slug',
                            field=models.SlugField(default='', max_length=60, db_index=True), preserve_default=False),
        *[migrations.AlterField(model_name=name, name='venue_slug',
                                field=models.SlugField(max_length=60, blank=True, default=''))
          for name in ('venuemenusettings', 'menudecoration', 'mcpkey', 'dinerfavorite', 'dinerreward')],
        migrations.RunPython(organization_scope, migrations.RunPython.noop),
        migrations.AddConstraint(model_name='dineraccount', constraint=models.UniqueConstraint(
            Lower('email'), models.F('organization_slug'), name='unique_account_email_per_org')),
    ]
