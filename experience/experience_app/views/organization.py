"""Portada pública de una organización y sus restaurantes activos."""
from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.adapters.registry.client import list_restaurants, resolve, TenantNotFound
from experience_app.adapters.odoo.client import OdooClient
from experience_app.adapters.odoo.pos import read_restaurant_location
from experience_app.services.brand import brand_view


@api_view(['GET'])
def entry(request, organization):
    restaurants = list_restaurants(organization)
    if not restaurants:
        raise TenantNotFound(organization)
    tenants = [resolve(organization, row['slug']) for row in restaurants]
    return Response({
        'organizacion': {'slug': organization, 'nombre': tenants[0].organization_name,
                         'marca': brand_view(tenants[0])},
        'restaurantes': [{'slug': tenant.venue_slug, 'nombre': tenant.venue_name,
                          'direccion': read_restaurant_location(OdooClient(tenant.odoo))['direccion']}
                         for tenant in tenants],
    })
