"""Lecturas en lotes: el número de consultas no crece con el número de platos."""
import math
from collections import defaultdict
from decimal import Decimal

from django.db.models import Prefetch

from accounts.services import restaurants_for
from inventory.models import Stock
from tenancy.http import model_dict

from .models import Product, Recipe, RecipeLine, RestaurantPrice, RestaurantUnavailable


def brief(obj):
    return model_dict(obj, ('id', 'name')) if obj else None


def tax_dict(tax):
    return model_dict(tax, ('id', 'name', 'amount', 'included'))


def category_dict(category):
    return model_dict(category, ('id', 'name', 'sequence', 'station'))


class CatalogData:
    def __init__(self, org, restaurants=()):
        self.products = {p.pk: p for p in Product.objects.filter(organization=org).select_related('unit', 'supplier').prefetch_related('categories', 'taxes')}
        lines = RecipeLine.objects.select_related('unit')
        self.recipes = {r.product_id: r for r in Recipe.objects.filter(product__organization=org).prefetch_related(Prefetch('lines', queryset=lines))}
        self.stocks = {(s.restaurant_id, s.ingredient_id): s for s in Stock.objects.filter(restaurant__in=restaurants)}
        self.prices = {(r.restaurant_id, r.product_id): r.price for r in RestaurantPrice.objects.filter(restaurant__in=restaurants)}
        self.unavailable = set(RestaurantUnavailable.objects.filter(restaurant__in=restaurants).values_list('restaurant_id', 'product_id'))
        self._requirements = {}
        self.pending = defaultdict(Decimal)
        from sales.models import OrderLine
        pending_lines = list(OrderLine.objects.filter(
            order__restaurant__in=restaurants, order__state='draft', cancelled=False
        ).values_list('id', 'parent_id', 'order__restaurant_id', 'product_id', 'qty'))
        parents = {parent for _, parent, _, _, _ in pending_lines if parent is not None}
        for line_id, _, rid, pk, qty in pending_lines:
            if line_id not in parents:
                for ingredient, per_serving in self.requirements(pk).items():
                    self.pending[(rid, ingredient)] += per_serving * qty

    def requirements(self, pk, path=frozenset()):
        if pk in self._requirements:
            return self._requirements[pk]
        if pk in path or pk not in self.products:
            return {}
        result = defaultdict(Decimal)
        product = self.products[pk]
        if product.kind == 'service':
            return {}
        if product.diner_attributes.get('combo'):
            for item in product.diner_attributes['combo']:
                for ingredient, qty in self.requirements(item['producto'], path | {pk}).items():
                    result[ingredient] += qty * item['cantidad']
        elif pk in self.recipes:
            recipe = self.recipes[pk]
            for line in recipe.lines.all():
                ingredient = self.products[line.ingredient_id]
                result[ingredient.pk] += line.qty * line.unit.factor / ingredient.unit.factor / recipe.yield_qty
        self._requirements[pk] = dict(result)
        return self._requirements[pk]

    def quantities(self, pk, rid):
        rows = []
        for ingredient_id, per_serving in self.requirements(pk).items():
            stock = self.stocks.get((rid, ingredient_id))
            qty = stock.qty if stock else Decimal(0)
            rows.append({'ingredient_id': ingredient_id, 'name': self.products[ingredient_id].name,
                         'per_serving': float(per_serving), 'stock': float(qty), 'pending': float(self.pending[(rid, ingredient_id)]), 'free': float(qty - self.pending[(rid, ingredient_id)]),
                         'servings': max(0, math.floor((qty - self.pending[(rid, ingredient_id)]) / per_serving + Decimal('0.000000001')))})
        return rows

    def servings(self, pk, rid):
        return min((r['servings'] for r in self.quantities(pk, rid)), default=None)

    def sold_out(self, pk, rid, path=frozenset()):
        if pk in path or pk not in self.products:
            return True
        p = self.products[pk]
        if not p.active or not p.available_in_pos or (rid, pk) in self.unavailable:
            return True
        servings = self.servings(pk, rid)
        return (servings is not None and servings <= 0) or any(
            self.sold_out(i['producto'], rid, path | {pk}) for i in p.diner_attributes.get('combo', []))

    def cost(self, pk):
        amounts = self.requirements(pk)
        missing = [self.products[i].name for i in amounts if self.products[i].cost == 0]
        cost = sum((qty * self.products[i].cost for i, qty in amounts.items()), Decimal(0)) if amounts and not missing else None
        return float(cost) if cost is not None else None, missing

    def product_dict(self, p, rid=None, sold_out=False):
        if p.kind == 'ingredient':
            return {**model_dict(p, ('id', 'name', 'kind', 'pantry_category', 'cost')), 'unit': brief(p.unit),
                    'supplier': brief(p.supplier), 'has_image': bool(p.image)}
        local_price = self.prices.get((rid, p.pk))
        effective = p.price if local_price is None else local_price
        # Los impuestos incluidos ya forman parte del precio; los excluidos se añaden una vez.
        final = effective * (1 + sum((t.amount / 100 for t in p.taxes.all() if not t.included), Decimal(0)))
        result = {**model_dict(p, ('id', 'name', 'kind', 'price', 'favorite', 'available_in_pos', 'image_version',
                                   'image_origin', 'description', 'diner_attributes', 'preparation_minutes')),
                  'category_ids': [c.pk for c in p.categories.all()], 'tax_ids': [t.pk for t in p.taxes.all()],
                  'restaurant_price': float(local_price) if local_price is not None else None, 'final_price': float(final),
                  'has_image': bool(p.image), 'servings': self.servings(p.pk, rid) if rid else None}
        if sold_out:
            result['sold_out'] = self.sold_out(p.pk, rid)
        return result

    def recipe_dict(self, pk, restaurants):
        recipe = self.recipes.get(pk)
        cost, missing = self.cost(pk)
        by_restaurant = []
        for restaurant in restaurants:
            rows = self.quantities(pk, restaurant.pk)
            servings = min((r['servings'] for r in rows), default=None)
            by_restaurant.append({'restaurant_id': restaurant.pk, 'servings': servings,
                                  'limiting': [r['name'] for r in rows if r['servings'] == servings], 'ingredients': rows})
        return {'recipe': {'yield_qty': float(recipe.yield_qty) if recipe else 1, 'lines': [
            {'ingredient_id': line.ingredient_id, 'name': self.products[line.ingredient_id].name, 'qty': float(line.qty), 'unit': brief(line.unit)}
            for line in recipe.lines.all()] if recipe else [], 'cost': cost, 'missing_costs': missing}, 'by_restaurant': by_restaurant}

    def overview(self):
        dishes, ingredients, used = [], [], defaultdict(set)
        for p in self.products.values():
            if p.kind != 'dish' or not p.active:
                continue
            amounts = self.requirements(p.pk)
            for ingredient in amounts:
                used[ingredient].add(p.pk)
            cost, missing = self.cost(p.pk)
            dishes.append({**model_dict(p, ('id', 'name', 'price', 'available_in_pos')),
                           'categories': [c.name for c in p.categories.all()], 'category_ids': [c.pk for c in p.categories.all()],
                           'has_image': bool(p.image), 'has_recipe': bool(amounts), 'ingredients_count': len(amounts),
                           'recipe_cost': cost, 'missing_costs': missing})
        for p in self.products.values():
            if p.kind == 'ingredient' and p.active:
                ingredients.append({**model_dict(p, ('id', 'name', 'cost')), 'unit': p.unit.name, 'used_in': len(used[p.pk])})
        return {'dishes': dishes, 'ingredients': ingredients}


def recipe_response(account, product):
    restaurants = list(restaurants_for(account).order_by('id'))
    return CatalogData(account.organization, restaurants).recipe_dict(product.pk, restaurants)


def regime_for(data):
    regimes = set()
    for product in data.products.values():
        if product.kind != 'dish' or not product.active:
            continue
        taxes = list(product.taxes.all())
        regimes.add('none' if not taxes else 'inc' if len(taxes) == 1 and taxes[0].amount == 8 else
                    'iva' if len(taxes) == 1 and taxes[0].amount == 19 else 'mixed')
    return next(iter(regimes)) if len(regimes) == 1 else 'mixed' if regimes else 'none'
