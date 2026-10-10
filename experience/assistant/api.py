"""Consola del dueño y memoria privada del comensal."""
from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.response import Response

from accounts.authentication import pos_session
from catalog.models import Product
from experience_app.views.account import _diner
from tenancy.http import ContractView, model_dict, payload, require
from tenancy.models import Organization, Restaurant
from tenancy.modules import is_active
from .models import (AssistantConversationState, AssistantDailyUsage, AssistantDecisionCache,
                     AssistantProfile, AssistantStanding, AssistantTurn)
from .profiles import identity, profile_data
from .selection import VOCABULARY
from .voice import propose_tags
from . import tones


def product_dict(product):
    return {'id': product.pk, 'name': product.name, 'tags': product.diner_attributes.get('etiquetas', []),
            'reviewed': product.diner_attributes.get('etiquetas_revisadas') is True}


def standing_dict(row):
    return {**model_dict(row, ('id', 'channel', 'reason', 'until')), 'status': row.level,
            'participant': row.participant}


class AssistantView(ContractView):
    action = ''

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        session = pos_session(request)
        self.actor, self.org = session.account, session.account.organization
        require(self.actor.role == 'owner' and not session.support_grant_id)
        require(is_active(self.org, 'asistente_menu') or is_active(self.org, 'asistente_whatsapp'),
                'El asistente no está activo en tu plan.', 'module_inactive', 403)

    def products(self):
        return Product.objects.filter(organization=self.org, kind='dish', active=True).order_by('id')

    def get(self, request, **kwargs):
        require(self.action in ('tags', 'participants', 'status'), 'El método no está permitido.', 'method_not_allowed', 405)
        if self.action == 'tags':
            return Response({'vocabulary': [{'key': k, 'name': v} for k, v in VOCABULARY.items()],
                             'products': [product_dict(p) for p in self.products()]})
        if self.action == 'participants':
            rows = AssistantStanding.objects.filter(organization=self.org)
            if request.query_params.get('restricted') == '1':
                rows = rows.filter(level__in=['restricted', 'paused'], until__gt=timezone.now())
            return Response({'participants': [standing_dict(r) for r in rows.order_by('id')]})
        from zoneinfo import ZoneInfo
        day = timezone.now().astimezone(ZoneInfo(self.org.timezone)).date()
        usage = AssistantDailyUsage.objects.filter(restaurant__organization=self.org, day=day)
        return Response({'configured': {'jev': bool(settings.TYPESAFE_API_KEY), 'voice': bool(settings.OPENAI_API_KEY and settings.WA_AGENT_MODEL)},
                         'models': {'evaluator': settings.ASSISTANT_JEV_MODEL, 'voice': settings.WA_AGENT_MODEL},
                         'day': day.isoformat(), 'usage': {'messages': usage.aggregate(total=Sum('attempts'))['total'] or 0,
                         'restaurants': [{'restaurant_id': r.restaurant_id, 'messages': r.attempts,
                                          'limit': settings.AGENT_DAILY_LIMIT} for r in usage.order_by('restaurant_id')]},
                         'limits': {'per_participant': settings.ASSISTANT_DAILY_PER_PARTICIPANT, 'per_restaurant': settings.AGENT_DAILY_LIMIT},
                         'tone': tones.tone_of(self.org), 'tones': tones.options()})

    @transaction.atomic
    def patch(self, request, product_id=None):
        require(self.action in ('tag', 'settings'), 'El método no está permitido.', 'method_not_allowed', 405)
        if self.action == 'settings':
            data = payload(request.data, ('tone',), ('tone',))
            require(data['tone'] in tones.TONES, 'Escoge uno de los tonos disponibles.', 'invalid_data', 400)
            org = Organization.objects.select_for_update().get(pk=self.org.pk)
            org.assistant_tone = data['tone']
            org.save(update_fields=['assistant_tone'])
            return Response({'tone': org.assistant_tone})
        data = payload(request.data, ('tags',), ('tags',))
        tags = data['tags']
        require(isinstance(tags, list) and len(tags) <= len(VOCABULARY) and all(isinstance(t, str) and t in VOCABULARY for t in tags),
                'Escoge etiquetas del vocabulario.', 'invalid_data', 400)
        Organization.objects.select_for_update().get(pk=self.org.pk)
        product = self.products().select_for_update().filter(pk=product_id).first()
        require(product, 'No encontramos el plato.', 'not_found', 404)
        product.diner_attributes = {**product.diner_attributes, 'etiquetas': sorted(set(tags)), 'etiquetas_revisadas': True}
        product.save(update_fields=['diner_attributes'])
        return Response({'product': product_dict(product)})

    @transaction.atomic
    def post(self, request, participant_id=None, **kwargs):
        require(self.action in ('lift', 'propose'), 'El método no está permitido.', 'method_not_allowed', 405)
        Organization.objects.select_for_update().get(pk=self.org.pk)
        if self.action == 'lift':
            payload(request.data, ())
            row = AssistantStanding.objects.filter(organization=self.org, pk=participant_id).first()
            require(row, 'No encontramos el participante.', 'not_found', 404)
            row.level, row.reason, row.until, row.consecutive, row.incidents, row.restricted_day = '', '', None, 0, [], None
            row.save()
            return Response({'participant': standing_dict(row)})
        data = payload(request.data, ('product_ids',))
        ids = data.get('product_ids')
        require(ids is None or (isinstance(ids, list) and len(ids) <= 200 and all(type(i) is int and i > 0 for i in ids)),
                'Indica una lista de platos válida.', 'invalid_data', 400)
        products = list(self.products().select_for_update().filter(**({'pk__in': ids} if ids is not None else {})))
        require(ids is None or len(products) == len(set(ids)), 'No encontramos todos los platos.', 'not_found', 404)
        require(len(products) <= 200, 'Propón etiquetas para hasta 200 platos a la vez.', 'invalid_data', 400)
        proposals = propose_tags(products)
        for product in products:
            product.diner_attributes = {**product.diner_attributes, 'etiquetas': proposals[str(product.pk)], 'etiquetas_revisadas': False}
            product.save(update_fields=['diner_attributes'])
        return Response({'products': [product_dict(p) for p in products]})


class ProfileView(ContractView):
    def own(self, request, rest, sede):
        diner = _diner(request)
        require(diner.session.restaurant_slug == rest and diner.session.venue_slug == sede,
                'No encontramos el perfil.', 'not_found', 404)
        local = Restaurant.objects.select_related('organization').filter(organization__slug=rest, slug=sede, active=True).first()
        require(local and local.organization.status != 'suspended', 'El restaurante no está disponible.', 'not_found', 404)
        key, account = identity('menu', diner, local.organization)
        require(account is not None, 'Inicia sesión en tu cuenta para ver tu memoria.', 'not_found', 404)
        return local, key, account

    def get(self, request, rest, sede):
        local, key, account = self.own(request, rest, sede)
        row = AssistantProfile.objects.filter(organization=local.organization, participant=key).first()
        data = profile_data(row, account)
        # El comensal lee nombres, no claves: las etiquetas salen del vocabulario y los platos del catálogo propio.
        ids = {int(k) for k in data['favorites'] if str(k).isdigit()}
        names = dict(Product.objects.filter(organization=local.organization, pk__in=ids).values_list('pk', 'name'))
        labels = {'preferences': {k: VOCABULARY[k] for k in data['preferences'] if k in VOCABULARY},
                  'products': {str(pk): name for pk, name in names.items()}}
        return Response({'profile': data, 'labels': labels})

    @transaction.atomic
    def delete(self, request, rest, sede):
        origin = request.headers.get('Origin')
        require(not origin or origin.rstrip('/') == settings.DINER_PUBLIC_URL, 'El origen no está permitido.', 'invalid_origin', 403)
        local, key, account = self.own(request, rest, sede)
        Organization.objects.select_for_update().get(pk=local.organization_id)
        AssistantProfile.objects.filter(organization=local.organization, participant=key).delete()
        AssistantStanding.objects.filter(organization=local.organization, participant=key).update(buffered_text='', last_fingerprint='')
        AssistantConversationState.objects.filter(restaurant__organization=local.organization, participant=key).delete()
        AssistantTurn.objects.filter(restaurant__organization=local.organization, participant=key).delete()
        # La caché puede incluir preferencias en su huella; se descarta para no conservar memoria derivada.
        AssistantDecisionCache.objects.filter(restaurant__organization=local.organization).delete()
        from experience_app.models import AgentConversation, Diner
        participants = list(Diner.objects.filter(account=account, session__restaurant_slug=rest).values_list('pk', flat=True))
        AgentConversation.objects.filter(restaurant=rest, channel='menu', participant__in=[str(pk) for pk in participants]).update(history=[])
        return Response({'ok': True})
