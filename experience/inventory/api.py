"""API operativa de inventario y compras del contrato T1."""
from rest_framework.response import Response

from catalog.api import PosView
from catalog.reading import CatalogData, brief
from catalog.services import restaurant_for
from tenancy.http import model_dict

from . import services as s


class InventoryView(PosView):
    def get(self, request, pk=None):
        restaurant = restaurant_for(self.account, request.query_params.get('restaurant_id'))
        if pk is not None:
            return Response(s.detail(self.product(pk, kind='ingredient'), restaurant))
        data = CatalogData(self.org, [restaurant])
        rows = []
        for p in data.products.values():
            if not p.active or p.kind != 'ingredient':
                continue
            stock = data.stocks.get((restaurant.pk, p.pk))
            qty, minimum, maximum = (stock.qty, stock.min, stock.max) if stock else (0, 5, 20)
            level = s.level_for(qty, minimum, maximum)
            rows.append({**model_dict(p, ('id', 'name', 'pantry_category', 'cost')), 'unit': brief(p.unit),
                         'qty': float(qty), 'min': float(minimum), 'max': float(maximum), 'level': level,
                         'status': s.STATUS[level], 'supplier': brief(p.supplier), 'has_image': bool(p.image)})
        result = {'ingredients': rows}
        if request.query_params.get('dishes') == '1':
            result['dishes'] = []
            for p in data.products.values():
                if not p.active or p.kind != 'dish':
                    continue
                servings = data.servings(p.pk, restaurant.pk)
                result['dishes'].append({**model_dict(p, ('id', 'name', 'price', 'available_in_pos')),
                    'category_ids': [c.pk for c in p.categories.all()], 'has_image': bool(p.image),
                    'has_recipe': bool(data.requirements(p.pk)), 'servings': servings,
                    'level': s.level_for(servings) if servings is not None else None,
                    'sold_out': data.sold_out(p.pk, restaurant.pk)})
        return Response(result)


class MovesView(PosView):
    def post(self, request, pk):
        return Response(s.record_move(self.account, self.product(pk, kind='ingredient', active=True), request.data))


class SettingsView(PosView):
    def put(self, request, pk):
        return Response(s.settings(self.account, self.product(pk, kind='ingredient', active=True), request.data))


class RequestsView(PosView):
    def get(self, request):
        restaurant = restaurant_for(self.account, request.query_params.get('restaurant_id'))
        return Response({'requests': [s.request_dict(p) for p in s.requests_for([restaurant])]})

    def post(self, request):
        return Response(s.create_request(self.account, request.data), status=201)


class MarkView(PosView):
    def post(self, request, pk):
        return Response(s.mark_request(self.account, pk, request.data))
