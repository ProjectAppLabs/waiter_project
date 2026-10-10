"""Selección estable sobre disponibilidad y precios calculados por el servidor."""
import hashlib
import json
import re
import unicodedata
from decimal import Decimal

from django.db.models import Sum
from catalog.reading import CatalogData
from sales.models import OrderLine

VOCABULARY = dict(zip(
    ('picante', 'vegetariano', 'vegano', 'sin_gluten', 'sin_azucar', 'sin_lactosa', 'para_compartir',
     'porcion_pequena', 'porcion_grande', 'bebida_fria', 'bebida_caliente', 'dulce', 'saludable'),
    ('Picante', 'Vegetariano', 'Vegano', 'Sin gluten', 'Sin azúcar', 'Sin lactosa', 'Para compartir',
     'Porción pequeña', 'Porción grande', 'Bebida fría', 'Bebida caliente', 'Dulce', 'Saludable')))


def normalize(text):
    text = ''.join(c for c in unicodedata.normalize('NFD', text.lower()) if not unicodedata.combining(c))
    return ' '.join(re.findall(r'[a-z0-9]+', text))


def fingerprint(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=True, default=str).encode()).hexdigest()


def catalog_for(restaurant):
    data = CatalogData(restaurant.organization, [restaurant])
    sold = dict(OrderLine.objects.filter(order__restaurant=restaurant, order__state='paid', cancelled=False)
                .values('product_id').annotate(total=Sum('qty')).values_list('product_id', 'total'))
    result = []
    for product in sorted(data.products.values(), key=lambda p: p.pk):
        # Como en la carta del comensal, solo se recomienda lo que está en alguna categoría: deja fuera tarjetas de
        # regalo, recargas, propinas o premios que el catálogo guarda como productos.
        if product.kind != 'dish' or not product.active or not product.available_in_pos or not product.categories.all():
            continue
        price = data.prices.get((restaurant.pk, product.pk), product.price)
        price *= 1 + sum((t.amount / 100 for t in product.taxes.all() if not t.included), Decimal(0))
        attrs = product.diner_attributes
        result.append({'id': product.pk, 'nombre': product.name, 'precio': str(price.quantize(Decimal('.01'))),
                       'agotado': data.sold_out(product.pk, restaurant.pk), 'descripcion': product.description,
                       'categorias': [c.name for c in product.categories.all()],
                       'etiquetas': attrs.get('etiquetas', []) if attrs.get('etiquetas_revisadas') is True else [],
                       'ingredientes': attrs.get('ingredientes', []), 'vendidos': str(sold.get(product.pk, 0))})
    return result


def one_letter(a, b):
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) <= 1
    shorter, longer = sorted((a, b), key=len)
    return any(shorter == longer[:i] + longer[i + 1:] for i in range(len(longer)))


def named_products(text, products):
    words = [w.rstrip('s') for w in normalize(text).split() if len(w) > 3]
    matches = []
    for p in products:
        name = normalize(p['nombre'])
        meaningful = [w.rstrip('s') for w in name.split() if len(w) > 3]
        if name in normalize(text) or (meaningful and all(any(one_letter(w, n) for w in words) for n in meaningful)):
            matches.append(p)
    if not matches:
        # Un nombre parcial solo identifica un plato cuando no hay otra coincidencia.
        partial = [p for p in products if any(one_letter(w, n.rstrip('s')) for w in words
                   for n in normalize(p['nombre']).split() if len(n) > 3)]
        if len(partial) == 1:
            matches = partial
    return sorted(matches, key=lambda p: p['id'])


def select(products, preferences=None, profile=None):
    preferences, profile = preferences or {}, profile or {}
    available = [p for p in products if p.get('agotado') is False]
    prices = sorted(Decimal(str(p.get('precio', 0))) for p in available)
    budget = preferences.get('presupuesto')
    ceiling = prices[max(0, (len(prices) * (1 if budget == 'bajo' else 2) + 2) // 3 - 1)] if prices and budget in ('bajo', 'medio') else None
    tags = set(preferences.get('etiquetas', []))
    excluded = set(preferences.get('excluir_etiquetas', []))
    category = normalize(preferences.get('categoria', ''))
    for tag in sorted(tags):
        # «Para compartir» puede ser una etiqueta o una categoría de la carta: si ningún plato tiene la etiqueta
        # revisada y hay una categoría con ese nombre, se busca por la categoría.
        label = normalize(VOCABULARY.get(tag, ''))
        named = sorted({normalize(str(c)) for p in available for c in p.get('categorias', []) if label and label in normalize(str(c))})
        if named and not category and not any(tag in p.get('etiquetas', []) for p in available):
            tags.discard(tag)
            category = named[0]
    if not tags and not category:
        # Las adiciones acompañan un plato ya escogido (assistant/service.py); no abren una recomendación general.
        from .service import role
        available = [p for p in available if role(p) != 'adicion']
    candidates = [p for p in available if tags <= set(p.get('etiquetas', [])) and not excluded.intersection(p.get('etiquetas', []))
                  and (not category or any(category in normalize(str(c)) for c in p.get('categorias', [])))
                  and (ceiling is None or Decimal(str(p.get('precio', 0))) <= ceiling)]
    favorites = profile.get('favorites', {})
    learned = profile.get('preferences', {})
    return sorted(candidates, key=lambda p: (
        -favorites.get(str(p['id']), 0), -sum(learned.get(t, 0) for t in p.get('etiquetas', [])),
        -Decimal(str(p.get('vendidos', 0))), p['id']))[:3]
