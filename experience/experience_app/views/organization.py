"""Portada pública de una organización y sus restaurantes activos."""
from experience_app.adapters.backend import backend_for, client_for
from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.adapters.registry.client import list_restaurants, resolve, TenantNotFound
from experience_app.adapters.odoo.client import OdooClient
from experience_app.adapters.odoo.pos import read_restaurant_location
from experience_app.services.brand import brand_view


@api_view(['GET'])
def entry(request, organization):
    backend = backend_for(organization)
    if hasattr(backend, 'Client'):
        from tenancy.models import Restaurant
        owner = backend.organization(organization)
        restaurants = list(Restaurant.objects.filter(organization=owner, active=True).order_by('id'))
        if not restaurants:
            raise TenantNotFound(organization)
        tenant = backend.resolve(organization, restaurants[0].slug)
        return Response({'organizacion': {'slug': organization, 'nombre': owner.name, 'marca': brand_view(tenant)},
            'restaurantes': [{'slug': row.slug, 'nombre': row.name, 'direccion': ', '.join(v for v in (row.street, row.city) if v)}
                             for row in restaurants]})
    restaurants = list_restaurants(organization)
    if not restaurants:
        raise TenantNotFound(organization)
    tenants = [resolve(organization, row['slug']) for row in restaurants]
    return Response({
        'organizacion': {'slug': organization, 'nombre': tenants[0].organization_name,
                         'marca': brand_view(tenants[0])},
        'restaurantes': [{'slug': tenant.venue_slug, 'nombre': tenant.venue_name,
                          'direccion': read_restaurant_location(client_for(tenant, OdooClient))['direccion']}
                         for tenant in tenants],
    })
