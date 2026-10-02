"""Invalida las vistas del menú al cambiar los datos de sus dominios locales."""
from django.db import transaction
from django.db.models.signals import m2m_changed, post_delete, post_save


def invalidate(slug):
    clear(slug)
    transaction.on_commit(lambda: clear(slug))


def clear(slug):
    from django.core.cache import cache
    from tenancy.models import Restaurant
    from experience_app.services import brand, catalog
    from experience_app.plantillas import services as templates
    brand.invalidate(slug, '')
    for venue in Restaurant.objects.filter(organization__slug=slug).values_list('slug', flat=True):
        catalog.invalidate(slug, venue)
        templates.invalidate(slug, venue)
        cache.delete(f'benefit-actions:{slug}/{venue}')


def changed(sender, instance, **kwargs):
    if sender._meta.app_label not in ('catalog', 'tenancy', 'inventory', 'sales', 'loyalty'):
        return
    from tenancy.models import Organization
    org_id = getattr(instance, 'organization_id', None)
    if isinstance(instance, Organization):
        invalidate(instance.slug)
        return
    if org_id is None:
        if hasattr(instance, 'restaurant_id'):
            org_id = instance.restaurant.organization_id
        elif hasattr(instance, 'product_id'):
            org_id = instance.product.organization_id
        elif hasattr(instance, 'recipe_id'):
            org_id = instance.recipe.product.organization_id
        elif hasattr(instance, 'order_id'):
            org_id = instance.order.organization_id
    if org_id:
        slug = Organization.objects.filter(pk=org_id).values_list('slug', flat=True).first()
        if slug:
            invalidate(slug)


def relations_changed(sender, instance, action, **kwargs):
    if action.startswith('post_'):
        changed(type(instance), instance)


def connect():
    post_save.connect(changed, dispatch_uid='experience.core.saved')
    post_delete.connect(changed, dispatch_uid='experience.core.deleted')
    m2m_changed.connect(relations_changed, dispatch_uid='experience.core.relations')
