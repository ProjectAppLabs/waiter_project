"""Contrato público de domicilios y ajustes del dueño."""
from zoneinfo import ZoneInfo

import requests
from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response

from catalog.api import PosView
from catalog.services import owner, restaurant_for, writing
from experience_app.models import Diner, TableSession
from experience_app.views.sessions import COOKIE, diner_for, cart_of
from experience_app.adapters.core.pos import organization
from loyalty import delivery as crm
from sales.services import text
from tenancy.http import ContractView, require, payload
from . import coverage, services
from .models import DeliverySettings, SearchUsage


class SettingsView(PosView):
    def get(self, request):
        owner(self.account)
        return Response({'restaurants': [{'restaurant_id': r.pk, 'name': r.name,
            'has_location': r.latitude is not None and r.longitude is not None,
            'settings': services.settings_dict(DeliverySettings.objects.filter(restaurant=r).first() or DeliverySettings(restaurant=r))}
            for r in self.org.restaurants.filter(active=True).order_by('id')]})

    def put(self, request, restaurant_id):
        owner(self.account)
        restaurant = restaurant_for(self.account, restaurant_id)
        with writing(self.org, operational=True):
            row = services.save_settings(restaurant, request.data)
        return Response({'settings': services.settings_dict(row)})


class DinerView(ContractView):
    def initial(self, request, *args, **kwargs):
        # Las rutas del comensal solo admiten el origen del menú, como su API de pagos.
        from rest_framework.views import APIView
        APIView.initial(self, request, *args, **kwargs)
        origin = request.headers.get('Origin')
        require(not origin or origin.rstrip('/') == settings.DINER_PUBLIC_URL, 'El origen de la petición no está permitido.', 'invalid_origin', 403)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        return response

    def diner(self, request, org):
        return get_object_or_404(Diner.objects.select_related('account', 'session'), key=request.COOKIES.get(COOKIE, ''), session__restaurant_slug=org.slug)


class QuoteView(DinerView):
    def post(self, request, rest):
        org = organization(rest)
        data = payload(request.data, ('lat', 'lng'), ('lat', 'lng'))
        return Response(coverage.quote(org, data['lat'], data['lng']))


class SearchView(DinerView):
    def post(self, request, rest):
        org = organization(rest)
        diner = self.diner(request, org)
        require(settings.GOOGLE_MAPS_API_KEY, 'El buscador no está disponible. Puede usar su ubicación o el mapa.', 'maps_not_configured', 503)
        data = payload(request.data, ('texto',), ('texto',))
        query = text(data['texto'], 250, True)
        with transaction.atomic():
            TableSession.objects.select_for_update().get(pk=diner.session_id)
            day = timezone.now().astimezone(ZoneInfo(org.timezone)).date()
            usage, _ = SearchUsage.objects.get_or_create(session=diner.session, day=day)
            require(usage.searches < 20, 'Llegó al límite de búsquedas de hoy. Puede seguir usando el mapa.', 'search_limit', 429)
            usage.searches += 1
            usage.save(update_fields=['searches'])
        try:
            response = requests.get('https://maps.googleapis.com/maps/api/geocode/json', params={
                'address': query, 'components': 'country:CO', 'region': 'co', 'language': 'es', 'key': settings.GOOGLE_MAPS_API_KEY}, timeout=(3, 5), allow_redirects=False)
            data = response.json()
            require(response.status_code == 200 and isinstance(data, dict) and data.get('status') in ('OK', 'ZERO_RESULTS'),
                    'No pudimos consultar el buscador. Intente de nuevo o use el mapa.', 'maps_unavailable', 502)
            results = []
            for row in data.get('results', [])[:5]:
                lat, lng = coverage.coordinates(row['geometry']['location']['lat'], row['geometry']['location']['lng'])
                results.append({'texto': row['formatted_address'], 'lat': float(lat), 'lng': float(lng)})
        except (requests.RequestException, ValueError, TypeError, KeyError, AttributeError):
            require(False, 'No pudimos consultar el buscador. Intente de nuevo o use el mapa.', 'maps_unavailable', 502)
        return Response({'resultados': results})


class SessionView(DinerView):
    def put(self, request, session_id):
        session = get_object_or_404(TableSession, pk=session_id)
        diner = diner_for(request, session)
        row, quote = services.set_delivery(session, diner, request.data)
        return Response({'domicilio': services.delivery_dict(row, quote), 'carrito': cart_of(session, diner)})


class AddressesView(DinerView):
    def get(self, request, rest):
        org = organization(rest)
        customer = crm.customer_for_diner(org, self.diner(request, org))
        return Response({'direcciones': [crm.address_dict(a) for a in customer.addresses.order_by('-last_used_at', 'id')] if crm.consented(customer) else []})

    def delete(self, request, rest, address_id):
        org = organization(rest)
        customer = crm.customer_for_diner(org, self.diner(request, org))
        require(crm.consented(customer), 'No encontramos la dirección.', 'not_found', 404)
        get_object_or_404(customer.addresses, pk=address_id).delete()
        return Response({'ok': True})


class DataView(DinerView):
    def delete(self, request, rest):
        org = organization(rest)
        diner = self.diner(request, org)
        customer = crm.customer_for_diner(org, diner)
        if customer:
            crm.revoke(customer)
        return Response({'ok': True})
