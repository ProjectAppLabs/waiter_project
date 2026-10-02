"""Portada pública de una organización y sus restaurantes activos."""
from experience_app.adapters.core import pos
from rest_framework.decorators import api_view
from rest_framework.response import Response

from experience_app.adapters.core.context import RestaurantNotFound
from experience_app.services.brand import brand_view


@api_view(['GET'])
def entry(request, organization):
    from tenancy.models import Restaurant
    owner = pos.organization(organization)
    restaurants = list(Restaurant.objects.filter(organization=owner, active=True).order_by('id'))
    if not restaurants:
        raise RestaurantNotFound(organization)
    tenant = pos.resolve(organization, restaurants[0].slug)
    return Response({'organizacion': {'slug': organization, 'nombre': owner.name, 'marca': brand_view(tenant)},
        'restaurantes': [{'slug': row.slug, 'nombre': row.name, 'direccion': ', '.join(v for v in (row.street, row.city) if v)}
                         for row in restaurants]})
