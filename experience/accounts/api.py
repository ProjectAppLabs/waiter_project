"""API de acceso y equipo del POS, siempre resuelta por X-Waiter-Org."""
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response

from tenancy.http import ContractView, Problem, model_dict, payload, require
from tenancy.serialization import BRAND_FIELDS, restaurant_dict
from tenancy.services import RESTAURANT_FIELDS, assign_values, create_restaurant
from .authentication import pos_session, resolve_organization, set_cookie
from .models import Account
from .serialization import account_dict, session_dict
from .services import (activate, deactivate_person, find_identity, invitation, login_pos, people_authority,
                       restaurants_for, revoke, save_person, valid_password)


class OrganizationView(ContractView):
    def get(self, request):
        org = resolve_organization(request, allow_suspended=True)
        return Response({'organization': {**model_dict(org, ('slug', 'name', 'status')), 'brand': model_dict(org, BRAND_FIELDS)}})


class AuthView(ContractView):
    action = None

    def get(self, request):
        require(self.action == 'me', 'La ruta no existe.', 'not_found', 404)
        return Response(session_dict(pos_session(request)))

    def post(self, request):
        if self.action == 'login':
            org = resolve_organization(request)
            _, session, token, attendance = login_pos(org, request.data)
            return set_cookie(Response(session_dict(session, attendance)), 'waiter_sid', token, session.expires)
        if self.action in ('request_code', 'activate'):
            org = resolve_organization(request)
            from .models import Session
            from .services import digest
            require(not Session.objects.filter(token_hash=digest(request.COOKIES.get('waiter_sid', '')),
                account__organization=org, support_grant__isnull=False).exists(),
                'Soporte no puede solicitar ni cambiar contraseñas del equipo.')
            queryset = Account.objects.filter(organization=org)
            if self.action == 'activate':
                activate(queryset, request.data)
            else:
                data = payload(request.data, ('login',), ('login',))
                user = find_identity(queryset, data['login'])
                if user:
                    invitation(user, reset=True)
            return Response({'ok': True})
        session = pos_session(request)
        if self.action == 'logout' and session.support_grant_id:
            session.delete()
            response = Response({'ok': True, 'worked_hours': 0})
            response.delete_cookie('waiter_sid', samesite='Lax')
            return response
        if self.action == 'logout':
            with transaction.atomic():
                account = Account.objects.select_for_update().get(pk=session.account_id)
                attendance = account.attendances.filter(check_out__isnull=True).first()
                now = timezone.now()
                hours = max(0, (now-attendance.check_in).total_seconds()/3600) if attendance else 0
                revoke(account, now)
            response = Response({'ok': True, 'worked_hours': hours})
            response.delete_cookie('waiter_sid', samesite='Lax')
            return response
        if self.action == 'change_password':
            require(not session.support_grant_id, 'Soporte no puede cambiar la contraseña del dueño.')
            data = payload(request.data, ('current', 'next'), ('current', 'next'))
            with transaction.atomic():
                account = Account.objects.select_for_update().get(pk=session.account_id)
                require(isinstance(data['current'], str) and check_password(data['current'], account.password),
                        'La contraseña actual no es correcta.', 'wrong_password')
                require(valid_password(data['next']), 'La contraseña necesita al menos 8 caracteres.', 'invalid_data', 400)
                account.password = make_password(data['next'])
                account.save(update_fields=['password'])
                account.sessions.exclude(pk=session.pk).delete()
            return Response({'ok': True})
        raise Problem('not_found', 'La ruta no existe.', 404)


class RestaurantsView(ContractView):
    def get(self, request):
        account = pos_session(request).account
        return Response({'restaurants': [restaurant_dict(r) for r in restaurants_for(account).order_by('id')]})

    def post(self, request):
        restaurant = create_restaurant(pos_session(request).account, request.data)
        return Response({'restaurant': restaurant_dict(restaurant)}, status=201)

    def patch(self, request, pk):
        account = pos_session(request).account
        require(account.role in ('owner', 'admin'))
        restaurant = account.organization.restaurants.filter(pk=pk).first() if account.role == 'owner' else restaurants_for(account).filter(pk=pk).first()
        require(restaurant, 'No encontramos este restaurante.', 'not_found', 404)
        data = payload(request.data, RESTAURANT_FIELDS)
        with transaction.atomic():
            from tenancy.models import Organization
            Organization.objects.select_for_update().get(pk=account.organization_id)
            restaurant = type(restaurant).objects.select_for_update().get(pk=restaurant.pk)
            assign_values(restaurant, data)
            if 'access_margin_minutes' in data:
                # El margen nuevo se comprueba en el siguiente inicio de sesión.
                for person in restaurant.accounts.filter(role__in=('waiter', 'cashier')):
                    revoke(person)
        return Response({'restaurant': restaurant_dict(restaurant)})


class HoursView(ContractView):
    """Plan D: horario de atención de una sede (lo define el dueño). Sin horario, la sede se trata como siempre abierta."""
    def restaurant(self, request, pk):
        account = pos_session(request).account
        require(account.role in ('owner', 'admin'))
        restaurant = account.organization.restaurants.filter(pk=pk).first() if account.role == 'owner' else restaurants_for(account).filter(pk=pk).first()
        require(restaurant, 'No encontramos este restaurante.', 'not_found', 404)
        return account, restaurant

    def get(self, request, pk):
        from tenancy.hours import hours_of, status
        _, restaurant = self.restaurant(request, pk)
        return Response({'hours': hours_of(restaurant), 'status': status(restaurant)})

    def put(self, request, pk):
        from tenancy.hours import clean_hours, status
        from tenancy.models import OpeningHours, Organization
        account, restaurant = self.restaurant(request, pk)
        data = clean_hours(request.data)
        with transaction.atomic():
            Organization.objects.select_for_update().get(pk=account.organization_id)
            OpeningHours.objects.update_or_create(restaurant=restaurant, defaults=data)
        return Response({'hours': data, 'status': status(restaurant)})

    def delete(self, request, pk):
        from tenancy.hours import status
        from tenancy.models import OpeningHours
        _, restaurant = self.restaurant(request, pk)
        OpeningHours.objects.filter(restaurant=restaurant).delete()
        return Response({'hours': None, 'status': status(restaurant)})


class TeamView(ContractView):
    action = None

    def person(self, actor, pk):
        person = Account.objects.filter(organization=actor.organization, pk=pk).first()
        require(person, 'No encontramos esta persona.', 'not_found', 404)
        people_authority(actor, person)
        require(not getattr(actor, '_support_session', None) or person.role != 'owner',
                'Soporte no puede modificar las credenciales del dueño.')
        return person

    def get(self, request):
        actor = pos_session(request).account
        allowed = people_authority(actor)
        people = Account.objects.filter(organization=actor.organization, active=True).order_by('id')
        if allowed is not None:
            people = [p for p in people if p.role != 'owner' and set(p.restaurants.values_list('id', flat=True)) <= allowed]
        return Response({'people': [account_dict(p, status=True) for p in people]})

    def post(self, request, pk=None):
        actor = pos_session(request).account
        if pk is None:
            person = save_person(actor, request.data)
            sent = invitation(person)
            return Response({'person': account_dict(person, status=True), 'invite_sent': sent}, status=201)
        person = self.person(actor, pk)
        if self.action == 'deactivate':
            deactivate_person(actor, person)
        elif self.action == 'resend_invite':
            require(person.active, 'No se puede invitar a una persona desactivada.', 'invalid_data', 400)
            invitation(person, reset=person.activated)
        else:
            raise Problem('not_found', 'La ruta no existe.', 404)
        return Response({'ok': True})

    def patch(self, request, pk):
        actor = pos_session(request).account
        person = save_person(actor, request.data, self.person(actor, pk))
        return Response({'person': account_dict(person, status=True)})
