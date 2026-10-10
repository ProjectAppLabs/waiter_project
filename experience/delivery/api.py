"""Contrato público de domicilios y ajustes del dueño."""
import re
from zoneinfo import ZoneInfo

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
from . import coverage, geocoding, services
from .models import DeliverySettings, MapsUsage, SearchUsage


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
    """Dirección escrita → lugares en el mapa (Google con clave; si no, Nominatim de OpenStreetMap)."""
    def post(self, request, rest):
        org = organization(rest)
        diner = self.diner(request, org)
        require(geocoding.provider(), 'El buscador no está disponible. Puede usar su ubicación o el mapa.', 'maps_not_configured', 503)
        data = payload(request.data, ('texto',), ('texto',))
        query = text(data['texto'], 250, True)
        count_search(org, diner, 'searches', 20)
        try:
            # En las zonas de todas las sedes con domicilio: si la dirección existe en dos ciudades con sede, salen ambas y
            # el cliente escoge; la cotización lleva el pedido a la sede que la cubre.
            areas = [(row.restaurant.latitude, row.restaurant.longitude) for row in coverage.candidates(org)]
            results = geocoding.search(query, areas or None)
            count_google(org, 'geocoding')
        except geocoding.Unavailable:
            require(False, 'No pudimos consultar el buscador. Intente de nuevo o use el mapa.', 'maps_unavailable', 502)
        return Response({'resultados': results})


class SuggestView(DinerView):
    """Sugerencias mientras el cliente escribe la dirección: calle y número arriba, barrio y ciudad abajo."""
    def post(self, request, rest):
        org = organization(rest)
        diner = self.diner(request, org)
        require(geocoding.provider(), 'Las sugerencias no están disponibles. Puede usar su ubicación o el mapa.', 'maps_not_configured', 503)
        data = payload(request.data, ('texto', 'sesion'), ('texto',))
        query = text(data['texto'], 120, True)
        session = session_token(data.get('sesion'))
        require(len(query) >= 3, 'Escriba al menos tres letras.', 'invalid_data', 400)
        count_search(org, diner, 'suggests', 300)
        first = coverage.candidates(org).first()
        try:
            found = geocoding.suggest(query, (first.restaurant.latitude, first.restaurant.longitude) if first else None, session)
            count_google(org, 'autocompletar')
        except geocoding.Unavailable:
            found = []
        return Response({'sugerencias': found})


class PlaceView(DinerView):
    """Las coordenadas de una sugerencia de Google (cierra la sesión de autocompletar: es lo único que se cobra)."""
    def post(self, request, rest):
        org = organization(rest)
        diner = self.diner(request, org)
        require(settings.GOOGLE_MAPS_API_KEY, 'Las sugerencias no están disponibles.', 'maps_not_configured', 503)
        data = payload(request.data, ('place_id', 'sesion'), ('place_id',))
        place_id = text(data['place_id'], 255, True)
        require(re.fullmatch(r'[A-Za-z0-9_-]{10,255}', place_id), 'El lugar no es válido.', 'invalid_data', 400)
        count_search(org, diner, 'searches', 40)
        try:
            found = geocoding.place(place_id, session_token(data.get('sesion')))
            count_google(org, 'lugar')
            return Response(found)
        except geocoding.Unavailable:
            require(False, 'No pudimos ubicar ese lugar. Mueva el mapa hasta la puerta de la entrega.', 'maps_unavailable', 502)


def count_google(org, kind):
    # Solo cuenta lo que va a Google (lo de OpenStreetMap es gratis): para ver el gasto real por día y organización.
    if not settings.GOOGLE_MAPS_API_KEY:
        return
    from django.db.models import F
    day = timezone.now().astimezone(ZoneInfo(org.timezone)).date()
    row, _ = MapsUsage.objects.get_or_create(organization=org, day=day, kind=kind)
    MapsUsage.objects.filter(pk=row.pk).update(count=F('count') + 1)


def session_token(value):
    # El token de sesión lo genera el comensal (un UUID por búsqueda); solo se aceptan caracteres seguros.
    return value if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9-]{8,64}', value) else ''


class ReverseView(DinerView):
    """Punto del mapa → dirección aproximada, para que el cliente confirme que el pin quedó bien puesto."""
    def post(self, request, rest):
        org = organization(rest)
        diner = self.diner(request, org)
        require(geocoding.provider(), 'El mapa no puede leer direcciones por ahora.', 'maps_not_configured', 503)
        data = payload(request.data, ('lat', 'lng'), ('lat', 'lng'))
        count_search(org, diner, 'reverses', 150)
        try:
            found = geocoding.reverse(data['lat'], data['lng'])
        except geocoding.Unavailable:
            found = ''
        return Response({'texto': found})


def count_search(org, diner, field, limit):
    with transaction.atomic():
        TableSession.objects.select_for_update().get(pk=diner.session_id)
        day = timezone.now().astimezone(ZoneInfo(org.timezone)).date()
        usage, _ = SearchUsage.objects.get_or_create(session=diner.session, day=day)
        require(getattr(usage, field) < limit, 'Llegó al límite de búsquedas de hoy. Puede seguir usando el mapa.', 'search_limit', 429)
        setattr(usage, field, getattr(usage, field) + 1)
        usage.save(update_fields=[field])


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
