"""Consola de ProjectApp: autenticación, organizaciones y personal interno."""
from rest_framework.response import Response

from accounts.authentication import platform_session, set_cookie
from accounts.services import activate, find_identity, invitation
from .http import ContractView, Problem, payload, require
from .models import Organization, PlatformUser
from .serialization import audit_dict, organization_dict, owner_dict, restaurant_dict, user_dict
from .services import (audit, create_organization, deactivate_platform_user, invite_platform_user,
                       login_platform, set_suspension, update_organization)


class AuthView(ContractView):
    action = None

    def get(self, request):
        require(self.action == 'me', 'La ruta no existe.', 'not_found', 404)
        return Response({'user': user_dict(platform_session(request).user)})

    def post(self, request):
        if self.action == 'login':
            user, session, token = login_platform(request.data)
            return set_cookie(Response({'user': user_dict(user)}), 'waiter_platform_sid', token, session.expires)
        if self.action == 'logout':
            platform_session(request).delete()
            response = Response({'ok': True})
            response.delete_cookie('waiter_platform_sid', samesite='Lax')
            return response
        if self.action == 'request_code':
            data = payload(request.data, ('login',), ('login',))
            user = find_identity(PlatformUser.objects.all(), data['login'])
            if user:
                invitation(user, reset=True)
            return Response({'ok': True})
        if self.action == 'activate':
            activate(PlatformUser.objects.all(), request.data)
            return Response({'ok': True})
        raise Problem('not_found', 'La ruta no existe.', 404)


class OrganizationsView(ContractView):
    action = None

    def organization(self, slug):
        organization = Organization.objects.filter(slug=slug).first()
        require(organization, 'No encontramos esta organización.', 'not_found', 404)
        return organization

    def get(self, request, slug=None):
        platform_session(request)
        if slug is None:
            return Response({'organizations': [organization_dict(o) for o in Organization.objects.order_by('created_at')]})
        org = self.organization(slug)
        return Response({'organization': organization_dict(org), 'owner': owner_dict(org),
                         'restaurants': [restaurant_dict(r) for r in org.restaurants.order_by('id')],
                         'audit': [audit_dict(a) for a in org.platformaudit_set.order_by('-at', '-id')[:50]]})

    def post(self, request, slug=None):
        actor = platform_session(request).user
        if slug is None:
            org, sent = create_organization(actor, request.data)
            return Response({'organization': organization_dict(org), 'invite_sent': sent}, status=201)
        org = self.organization(slug)
        if self.action == 'suspend':
            data = payload(request.data, ('reason',), ('reason',))
            org = set_suspension(actor, org, True, data['reason'])
        elif self.action == 'reactivate':
            org = set_suspension(actor, org, False)
        elif self.action == 'resend_invite':
            owner = org.accounts.filter(role='owner', active=True).order_by('id').first()
            sent = invitation(owner, reset=owner.activated) if owner else False
            audit(actor, org, 'organization.invite_resent', {'sent': sent})
            return Response({'ok': True, 'sent': sent})
        else:
            raise Problem('not_found', 'La ruta no existe.', 404)
        return Response({'organization': organization_dict(org)})

    def patch(self, request, slug):
        actor = platform_session(request).user
        org = update_organization(actor, self.organization(slug), request.data)
        return Response({'organization': organization_dict(org)})


class TeamView(ContractView):
    action = None

    def get(self, request):
        platform_session(request)
        return Response({'users': [user_dict(u, team=True) for u in PlatformUser.objects.order_by('id')]})

    def post(self, request, pk=None):
        actor = platform_session(request).user
        require(actor.role == 'admin')
        if pk is None:
            user, sent = invite_platform_user(actor, request.data)
            return Response({'user': user_dict(user, team=True), 'invite_sent': sent}, status=201)
        user = PlatformUser.objects.filter(pk=pk).first()
        require(user, 'No encontramos esta persona.', 'not_found', 404)
        if self.action == 'deactivate':
            deactivate_platform_user(actor, user)
        elif self.action == 'resend_invite':
            require(user.active, 'No se puede invitar a una persona desactivada.', 'invalid_data', 400)
            invitation(user, reset=user.activated)
        else:
            raise Problem('not_found', 'La ruta no existe.', 404)
        return Response({'ok': True})
