"""Consola de WhatsApp: acceso exclusivo del dueño y campos públicos explícitos."""
from django.conf import settings
from rest_framework.response import Response

from accounts.authentication import pos_session
from tenancy.http import ContractView, model_dict, payload, require
from tenancy.modules import require_module
from . import services
from .models import WhatsAppAccount, WhatsAppConversation


def account_dict(account):
    return {**model_dict(account, ('phone', 'name', 'quality', 'status', 'connected_at')), 'test_number': not bool(account.token_encrypted)} if account else None


def message_dict(message):
    return model_dict(message, ('id', 'direction', 'wamid', 'type', 'text', 'template', 'language', 'status', 'error_code', 'error_message',
                                'created_at', 'received_at', 'sent_at', 'delivered_at', 'read_at', 'failed_at'))


def conversation_dict(conversation):
    last = conversation.messages.order_by('-created_at', '-id').first()
    return {**model_dict(conversation, ('id', 'wa_id', 'profile_name', 'last_inbound_at', 'created_at', 'updated_at')),
            'window_open': services.window_open(conversation), 'last_message': message_dict(last) if last else None}


class WhatsAppView(ContractView):
    action = ''

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        session = pos_session(request)
        self.actor = session.account
        self.org = self.actor.organization
        require(self.actor.role == 'owner' and not session.support_grant_id)
        require_module(self.org, 'asistente_whatsapp')

    def current(self, required=True):
        row = WhatsAppAccount.objects.filter(organization=self.org).order_by('status', '-connected_at', '-id').first()
        if required:
            require(row and row.status == 'connected', 'Conecta una cuenta de WhatsApp para continuar.', 'whatsapp_disconnected', 409)
        return row

    def conversation(self, pk):
        row = WhatsAppConversation.objects.select_related('account').filter(pk=pk, account__organization=self.org).first()
        require(row, 'No encontramos la conversación.', 'not_found', 404)
        return row

    def get(self, request, pk=None):
        require(not self.action, 'El método no está permitido en esta ruta.', 'method_not_allowed', 405)
        if pk is not None:
            row = self.conversation(pk)
            return Response({'conversation': conversation_dict(row), 'messages': [message_dict(m) for m in row.messages.all()]})
        signup = {'app_id': settings.META_APP_ID, 'config_id': settings.WA_SIGNUP_CONFIG_ID, 'graph_version': settings.WA_GRAPH_VERSION} if settings.META_APP_ID and settings.WA_SIGNUP_CONFIG_ID else None
        recent = WhatsAppConversation.objects.filter(account__organization=self.org).order_by('-updated_at', '-id')[:50]
        return Response({'account': account_dict(self.current(False)), 'signup': signup, 'recent': [conversation_dict(c) for c in recent]})

    def post(self, request, pk=None):
        require(bool(self.action), 'El método no está permitido en esta ruta.', 'method_not_allowed', 405)
        if self.action == 'connect':
            data = payload(request.data, ('code', 'waba_id', 'phone_number_id', 'business_app'), ('code', 'waba_id'))
            return Response({'account': account_dict(services.connect(self.actor, **data))})
        if self.action == 'disconnect':
            payload(request.data, ())
            account = self.current(False)
            require(account, 'No hay una cuenta de WhatsApp vinculada.', 'whatsapp_disconnected', 409)
            return Response({'account': account_dict(services.disconnect(account))})
        if self.action == 'test':
            data = payload(request.data, ('to',), ('to',))
            message = services.send_template(self.current(), data['to'])
        elif self.action == 'reply':
            data = payload(request.data, ('text',), ('text',))
            message = services.send_text(self.conversation(pk), data['text'])
        else:
            require(False, 'La ruta no existe.', 'not_found', 404)
        return Response({'message': message_dict(message)})
