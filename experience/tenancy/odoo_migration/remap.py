"""Traducción una sola vez por fila, incluso cuando ids viejos y nuevos se solapan."""
from django.core.management.base import CommandError
from django.db import transaction
from django.db.models import Max

from experience_app.models import CartLine, DinerFavorite, DinerFeedback, TableSession, PaymentGateway, Order
from experience_app.models.agent_conversation import AgentCartSelection
from experience_app.models.payment import PaymentAttempt


@transaction.atomic
def remap_diner(importer):
    org = importer.org.slug
    specs = [
        (CartLine, {'session__restaurant_slug': org}, {'product_id': 'product.product', 'loyalty_card_id': 'loyalty.card'}),
        (DinerFavorite, {'restaurant_slug': org}, {'product_id': 'product.product'}),
        (AgentCartSelection, {'diner__session__restaurant_slug': org}, {'product_id': 'product.product'}),
        (PaymentGateway, {'restaurant_slug': org}, {'payment_method_id': 'pos.payment.method'}),
        (PaymentAttempt, {'gateway__restaurant_slug': org}, {'payment_method_id': 'pos.payment.method'}),
        (TableSession, {'restaurant_slug': org}, {'odoo_table_id': 'restaurant.table'}),
        (Order, {'session__restaurant_slug': org}, {'odoo_order_id': 'pos.order'}),
        (DinerFeedback, {'order__session__restaurant_slug': org}, {}),
    ]
    for cls, scope, fields in specs:
        marker = f'diner:{cls._meta.label_lower}'
        prepared = []
        for row in cls.objects.select_for_update().filter(**scope).iterator(chunk_size=importer.batch_size):
            if importer.mapping(marker, row.pk):
                importer.skip('remapeo comensal', 'fila ya traducida')
                continue
            values = {field: importer.ref(model, getattr(row, field)).pk for field, model in fields.items() if getattr(row, field) is not None}
            if cls is DinerFeedback:
                values['dish_ratings'] = {str(importer.ref('product.product', int(key)).pk): value for key, value in row.dish_ratings.items()}
            if cls is TableSession and values.get('odoo_table_id'):
                table = importer.ref('restaurant.table', row.odoo_table_id)
                if table.floor.restaurant.slug != row.venue_slug:
                    raise CommandError('La sesión del comensal y su mesa pertenecen a sedes diferentes.')
                values.update(table_token=table.token, table_number=table.number)
            prepared.append((row, values))
        if cls in (DinerFavorite, AgentCartSelection) and prepared:
            # Primero se libera el espacio de ids: 1→2 y 2→1 no deben chocar con la unicidad.
            temporary = max(cls.objects.aggregate(n=Max('product_id'))['n'] or 0, *(v['product_id'] for _, v in prepared)) + 1
            if temporary + len(prepared) > 2147483647:
                raise CommandError('No hay ids temporales libres para remapear las selecciones.')
            for index, (row, _) in enumerate(prepared):
                cls.objects.filter(pk=row.pk).update(product_id=temporary + index)
        for row, values in prepared:
            if values:
                cls.objects.filter(pk=row.pk).update(**values)
            importer.remember(marker, row.pk, row)
            importer.counted('remapeo comensal', False)
