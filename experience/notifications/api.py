"""Lectura de avisos limitada a los destinatarios de la sesión."""
from rest_framework.response import Response

from accounts.authentication import pos_session
from tenancy.http import ContractView, model_dict, require
from .services import visible_notifications


class NotificationsView(ContractView):
    def get(self, request):
        rows = visible_notifications(pos_session(request).account)
        try:
            limit = int(request.query_params.get('limit', '50'))
        except ValueError:
            limit = 0
        require(1 <= limit <= 500, 'El límite debe estar entre 1 y 500.', 'invalid_data', 400)
        fields = ('id', 'restaurant_id', 'recipient_id', 'kind', 'title', 'body', 'res_model', 'res_id',
                  'action', 'action_done', 'read', 'created_at')
        return Response({'notifications': [{**model_dict(row, fields), **({'order_id': row.res_id} if row.kind == 'kitchen' and row.res_model == 'sales.Order' else {})} for row in rows[:limit]]})

    def post(self, request, pk=None):
        rows = visible_notifications(pos_session(request).account)
        if pk is not None:
            rows = rows.filter(pk=pk)
            require(rows.exists(), 'No encontramos este aviso.', 'not_found', 404)
        rows.update(read=True)
        return Response({'ok': True})
