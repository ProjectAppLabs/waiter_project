"""Administración del menú con sesión del POS y sede validada en el servidor."""
from django.conf import settings
from rest_framework.response import Response

from accounts.authentication import pos_session
from catalog.services import restaurant_for, valid
from tenancy.http import ContractView, payload, require
from experience_app.adapters.core.pos import resolve
from experience_app.diseno import borradores, decoraciones, plantillas
from experience_app.mcp import keys
from experience_app.models import PaymentGateway
from experience_app.payments import PROVIDERS
from experience_app.plantillas import services as templates
from experience_app.services import payment_settings


class MenuAdminView(ContractView):
    section = None

    def post(self, request):
        session = pos_session(request)
        account = session.account
        require(account.role in ('owner', 'admin'))
        fields = {
            'menu_settings': ('plantilla', 'paleta', 'tipografia', 'tema', 'borrador'),
            'menu_decorations': ('nombre', 'imagen', 'decoracion_id'),
            'mcp_keys': ('nombre', 'key_id'),
            'payment_gateways': ('configuration', 'environment'),
        }
        data = payload(request.data, ('action', 'restaurant_id', 'config_id', *fields[self.section]))
        rid = data.get('restaurant_id', data.get('config_id', session.restaurant_id))
        valid(rid is not None, 'Selecciona un restaurante.')
        if data.get('config_id') is not None and data.get('restaurant_id') is not None:
            valid(data['config_id'] == data['restaurant_id'])
        restaurant = restaurant_for(account, rid)
        org, venue = account.organization.slug, restaurant.slug
        tenant = resolve(org, venue)
        action = data.get('action', 'get' if self.section in ('menu_settings', 'payment_gateways') else 'list')
        base = settings.PAYMENTS_PUBLIC_URL or request.build_absolute_uri('/').rstrip('/')
        try:
            if self.section == 'menu_settings':
                if action == 'get':
                    result = {'restaurante': org, 'sede': venue, 'experienceUrl': base,
                              'dinerUrl': settings.DINER_PUBLIC_URL, 'ajustes': templates.settings_view(org, venue)}
                elif action == 'verify':
                    change = borradores.get(org, venue, data.get('borrador'))
                    result = borradores.verification_result(change, borradores.start_verification(change))
                else:
                    valid(action in ('set', 'preview'), 'Acción de menú inválida.')
                    valid(data.get('tema') is None or data.get('paleta') is None and data.get('tipografia') is None,
                          'Envía tema o paleta/tipografia; no ambos contratos a la vez.')
                    body = {'plantilla': data.get('plantilla'), 'tema': data['tema']} if data.get('tema') is not None else {
                        'plantilla': data.get('plantilla'), 'paleta': data.get('paleta') or {}, 'tipografia': data.get('tipografia') or {}}
                    if action == 'preview':
                        _, _, _, theme = templates.prepare(org, venue, body)
                        result = borradores.result(borradores.create(tenant, theme))
                    else:
                        if data.get('borrador') is not None:
                            body['borrador'] = data['borrador']
                        templates.prepare(org, venue, body)
                        templates.save_verified(org, venue, body)
                        result = {'plantilla': templates.resolve_template(tenant)}
            elif self.section == 'menu_decorations':
                if action == 'list':
                    result = {'decoraciones': decoraciones.listing(org, venue), 'fabrica': plantillas.DECORATIONS['fabrica'],
                        'limites': {'peso': decoraciones.MAX_BYTES, 'lado': decoraciones.MAX_SIDE, 'cantidad': decoraciones.MAX_PER_VENUE},
                        'experienceUrl': base}
                elif action == 'add':
                    result = decoraciones.view(decoraciones.create(org, venue, data.get('nombre'), data.get('imagen'), account.name))
                else:
                    valid(action == 'remove' and isinstance(data.get('decoracion_id'), str), 'Acción de decoración inválida.')
                    require(decoraciones.remove(org, venue, data['decoracion_id']), 'La decoración no existe.', 'not_found', 404)
                    templates.invalidate(org, venue)
                    result = {'eliminada': data['decoracion_id']}
            elif self.section == 'mcp_keys':
                if action == 'list':
                    result = {'claves': keys.listing(org, venue), 'mcpUrl': base + '/mcp/'}
                elif action == 'create':
                    valid(isinstance(data.get('nombre'), str) and bool(data['nombre'].strip()), 'Ponle un nombre a la clave.')
                    key, raw = keys.create(org, venue, data['nombre'], account.name)
                    result = {'clave': raw, **keys.view(key), 'mcpUrl': base + '/mcp/'}
                else:
                    valid(action == 'revoke' and type(data.get('key_id')) is int, 'Acción de clave inválida.')
                    require(keys.revoke(org, venue, data['key_id']), 'La clave no existe o ya estaba revocada.', 'not_found', 404)
                    result = {'revocada': data['key_id']}
            else:
                valid(action in ('get', 'set', 'test'), 'Acción de pasarela inválida.')
                if action != 'get':
                    require(account.role == 'owner')
                if action == 'get':
                    result = payment_settings.view(org, venue)
                elif action == 'set':
                    result = payment_settings.save(org, venue, data.get('configuration'))
                else:
                    environment = data.get('environment', 'test')
                    valid(environment in ('test', 'prod'), 'Ambiente inválido.')
                    config = PaymentGateway.objects.filter(restaurant_slug=org, venue_slug=venue, provider='wompi', environment=environment).first()
                    require(config, 'No encontramos la pasarela.', 'not_found', 404)
                    merchant = PROVIDERS[config.provider].merchant(environment, config.public_key)
                    result = {'ok': True, 'name': merchant.get('name', ''), 'methods': merchant.get('accepted_payment_methods', []),
                        'detail': 'La llave pública identifica el comercio. Los secretos se verifican al crear y confirmar una transacción.'}
        except (templates.InvalidSettings, borradores.InvalidDraft, decoraciones.InvalidDecoration, keys.KeyLimit) as exc:
            return Response({'error': 'invalid_data', 'message': str(exc)}, status=400)
        return Response(result, headers={'Cache-Control': 'no-store'})
