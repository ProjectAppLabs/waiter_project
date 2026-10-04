"""Escrituras del catálogo: validación, aislamiento y revisión transaccional."""
from tenancy.audit import audited
from contextlib import contextmanager
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import F

from accounts.services import restaurants_for
from tenancy.http import payload, require, save_valid

from .models import CatalogRevision, Category, Product, Recipe, RecipeLine, Supplier, Tax, Unit

SEED_UNITS = [('kg', 'weight', 1), ('g', 'weight', '0.001'), ('L', 'volume', 1), ('ml', 'volume', '0.001'),
              ('Unidades', 'count', 1), ('Manojo', 'count', 1), ('Diente', 'count', 1), ('Rebanada', 'count', 1)]


def seed_organization(organization):
    for name, root, factor in SEED_UNITS:
        Unit.objects.get_or_create(organization=organization, name=name, defaults={'root': root, 'factor': factor})
    for name, amount in [('INC 8 %', 8), ('IVA 19 %', 19)]:
        Tax.objects.get_or_create(organization=organization, name=name, defaults={'amount': amount, 'included': True})
    CatalogRevision.objects.get_or_create(organization=organization)


def valid(condition, message='Revisa los datos enviados.'):
    require(condition, message, 'invalid_data', 400)


def number(value, positive=False):
    valid(type(value) in (int, float, Decimal), 'Indica un número válido.')
    try:
        result = Decimal(str(value))
        valid(result.is_finite() and 0 <= result < Decimal('1000000000000') and (not positive or result > 0))
        valid(result == result.quantize(Decimal('0.000001')), 'Usa hasta seis decimales.')
    except InvalidOperation:
        valid(False)
    return result


def identifier(value):
    valid(type(value) is int and value > 0, 'Indica un identificador entero válido.')
    return value


def reference(model, org, pk, **filters):
    identifier(pk)
    obj = model.objects.filter(organization=org, pk=pk, **filters).first()
    require(obj, 'No encontramos el registro.', 'not_found', 404)
    return obj


def restaurant_for(account, pk):
    # Solo los parámetros de consulta llegan como texto; los cuerpos exigen enteros.
    if isinstance(pk, str) and pk.isdecimal():
        pk = int(pk)
    identifier(pk)
    obj = restaurants_for(account).filter(pk=pk, active=True).first()
    require(obj, 'No encontramos este restaurante.', 'not_found', 404)
    account._module_restaurant = obj
    if getattr(account, '_required_module', None):
        from tenancy.modules import require_module
        require_module(account.organization, account._required_module, obj)
    return obj


def owner(account):
    require(account.role == 'owner')


def manager(account):
    require(account.role in ('owner', 'admin'))


@contextmanager
def writing(org, *, operational=False):
    """El UPDATE adquiere también el bloqueo de escritura en SQLite antes de leer saldos."""
    with transaction.atomic():
        if operational:
            from tenancy.models import Organization
            Organization.objects.filter(pk=org.pk).update(cash_tolerance=F('cash_tolerance'))
            yield
            return
        changed = CatalogRevision.objects.filter(organization=org).update(version=F('version') + 1)
        if not changed:
            CatalogRevision.objects.create(organization=org, version=1)
        yield


def relations(model, org, ids):
    valid(isinstance(ids, list) and all(type(i) is int and i > 0 for i in ids))
    valid(len(ids) == len(set(ids)), 'No repitas identificadores.')
    rows = list(model.objects.filter(organization=org, pk__in=ids, active=True))
    valid(len(rows) == len(ids), 'Selecciona registros activos de esta organización.')
    return rows


def attributes(product, data):
    allowed = ('combo', 'ingredientes', 'extras', 'acompanamientos', 'nutricion', 'piezas', 'picante', 'etiquetas',
               'alergenos', 'abv', 'ibu', 'tamanos', 'soloHoy', 'tiempoPreparacion', 'precioAntes')
    data = payload(data, allowed)
    for key in ('ingredientes', 'etiquetas', 'alergenos'):
        if key in data:
            valid(isinstance(data[key], list) and all(isinstance(v, str) and v.strip() for v in data[key]))
    for key in ('extras', 'acompanamientos'):
        if key in data:
            relations(Product, product.organization, data[key])
    for key in ('piezas', 'abv', 'ibu', 'precioAntes'):
        if key in data:
            number(data[key])
    if 'picante' in data:
        valid(type(data['picante']) is int and data['picante'] in range(4))
    if 'tiempoPreparacion' in data:
        valid(type(data['tiempoPreparacion']) is int and 1 <= data['tiempoPreparacion'] <= 600)
    if 'soloHoy' in data:
        valid(type(data['soloHoy']) is bool)
    if 'nutricion' in data:
        nutrition = payload(data['nutricion'], ('calorias', 'peso', 'proteina', 'grasa', 'carbohidratos', 'fibra'))
        for value in nutrition.values():
            valid(number(value) <= 100000)
    if 'tamanos' in data:
        valid(isinstance(data['tamanos'], list))
        for item in data['tamanos']:
            item = payload(item, ('nombre', 'precio'), ('nombre', 'precio'))
            valid(isinstance(item['nombre'], str) and bool(item['nombre'].strip()))
            number(item['precio'])
    items = data.get('combo', [])
    valid(isinstance(items, list) and (not items or 2 <= len(items) <= 12))
    if items:
        valid(not product.pk or not Recipe.objects.filter(product=product).exists(), 'Un plato con receta no puede ser combo.')
        components, seen = [], set()
        for item in items:
            item = payload(item, ('producto', 'cantidad', 'nombre'), ('producto', 'cantidad'))
            valid(type(item['cantidad']) is int and 1 <= item['cantidad'] <= 20)
            component = reference(Product, product.organization, item['producto'], active=True, kind='dish', available_in_pos=True)
            valid(component.pk != product.pk and component.pk not in seen and not component.diner_attributes.get('combo'),
                  'Usa platos distintos, sin combos anidados.')
            seen.add(component.pk)
            components.append({'producto': component.pk, 'cantidad': item['cantidad'], 'nombre': component.name})
        # Tampoco se puede convertir en combo un componente de otro combo.
        for other in Product.objects.filter(organization=product.organization, kind='dish').exclude(pk=product.pk):
            valid(not any(i['producto'] == product.pk for i in other.diner_attributes.get('combo', [])),
                  'Este plato es componente de otro combo.')
        data['combo'] = components
    return data


@audited
def set_recipe(product, data):
    valid(product.kind == 'dish' and not product.diner_attributes.get('combo'), 'Selecciona un plato individual.')
    data = payload(data, ('yield_qty', 'lines'), ('yield_qty', 'lines'))
    yield_qty = number(data['yield_qty'], positive=True)
    lines = data['lines']
    valid(isinstance(lines, list) and len(lines) <= 100, 'La receta admite hasta 100 líneas.')
    normalized, seen = [], set()
    for line in lines:
        line = payload(line, ('ingredient_id', 'qty', 'unit_id'), ('ingredient_id', 'qty', 'unit_id'))
        ingredient = reference(Product, product.organization, line['ingredient_id'], active=True, kind='ingredient', track_stock=True)
        unit = reference(Unit, product.organization, line['unit_id'])
        valid(unit.root == ingredient.unit.root, 'La unidad no es compatible con la del ingrediente.')
        valid(ingredient.pk not in seen, 'No repitas ingredientes; reúne su cantidad en una línea.')
        seen.add(ingredient.pk)
        normalized.append(RecipeLine(ingredient=ingredient, unit=unit, qty=number(line['qty'], positive=True)))
    Recipe.objects.filter(product=product).delete()
    if normalized:
        recipe = Recipe.objects.create(product=product, yield_qty=yield_qty)
        for line in normalized:
            line.recipe = recipe
        for line in normalized:
            line.save()


COMMON = ('name', 'image', 'image_origin')
DISH = ('category_ids', 'price', 'tax_ids', 'description', 'diner_attributes', 'favorite', 'available_in_pos', 'recipe', 'preparation_minutes')
INGREDIENT = ('unit_id', 'pantry_category', 'cost', 'supplier_id', 'initial_stock', 'min', 'max', 'track_stock')


@audited
def save_product(account, raw, product=None):
    owner(account)
    valid(isinstance(raw, dict))
    creating = product is None
    kind = raw.get('kind', product.kind if product else None)
    valid(kind in ('dish', 'ingredient') and (creating or kind == product.kind), 'El tipo de producto no se puede cambiar.')
    data = payload(raw, (*COMMON, *(DISH if kind == 'dish' else INGREDIENT), 'kind'), ('name', 'kind') if creating else ())
    if creating:
        payload(data, data.keys(), ('category_ids', 'price', 'tax_ids') if kind == 'dish' else ('unit_id', 'pantry_category'))
    data.pop('kind', None)
    with writing(account.organization):
        if creating:
            product = Product(organization=account.organization, kind=kind, available_in_pos=kind == 'dish')
        else:
            product = Product.objects.select_for_update().get(pk=product.pk)
        specials = {key: data.pop(key) for key in ('category_ids', 'tax_ids', 'recipe', 'image', 'initial_stock', 'min', 'max') if key in data}
        for key, value in data.items():
            if key in ('price', 'cost'):
                value = number(value)
            elif key in ('favorite', 'available_in_pos', 'track_stock'):
                valid(type(value) is bool)
                if key == 'track_stock':
                    valid(value, 'Los ingredientes requieren control de existencias.')
            elif key == 'unit_id':
                unit = reference(Unit, account.organization, value)
                if not creating and product.unit_id != unit.pk:
                    change_unit(product, unit, explicit_cost='cost' in data)
            elif key == 'supplier_id':
                if value is not None:
                    reference(Supplier, account.organization, value, active=True)
            elif key == 'diner_attributes':
                value = attributes(product, value)
            elif key == 'preparation_minutes':
                valid(value is None or type(value) is int and 0 <= value <= 600)
            elif key == 'image_origin':
                valid(value in (None, 'real', 'ai', 'placeholder'))
            else:
                valid(isinstance(value, str))
                value = value.strip()
            setattr(product, key, value)
        save_valid(product)
        for key, model, relation in [('category_ids', Category, 'categories'), ('tax_ids', Tax, 'taxes')]:
            if key in specials:
                getattr(product, relation).set(relations(model, account.organization, specials[key]))
        if 'recipe' in specials:
            set_recipe(product, specials['recipe'])
        if kind == 'ingredient' and any(k in specials for k in ('initial_stock', 'min', 'max')):
            valid(creating, 'Las existencias y umbrales se cambian desde Inventario.')
            from inventory.services import initial_stock
            initial_stock(account, product, specials)
        if 'image' in specials:
            from .images import set_image
            set_image(product, specials['image'])
        return product


def change_unit(product, unit, explicit_cost=False):
    """Conserva cantidades físicas y costo total al cambiar la unidad dentro del mismo root."""
    from inventory.models import PurchaseRequestLine, Stock, StockMove
    old = product.unit
    if old.root != unit.root:
        valid(not (RecipeLine.objects.filter(ingredient=product).exists()
                   or StockMove.objects.filter(ingredient=product).exists()
                   or PurchaseRequestLine.objects.filter(ingredient=product).exists()
                   or Stock.objects.filter(ingredient=product, qty__gt=0).exists()),
              'No cambies el tipo de unidad de un ingrediente con existencias, recetas o historial.')
    else:
        factor = old.factor / unit.factor
        for stock in Stock.objects.filter(ingredient=product):
            stock.qty *= factor
            stock.min *= factor
            stock.max *= factor
            stock.full_clean()
            stock.save()
        if not explicit_cost:
            product.cost /= factor
    product.unit = unit


@audited
def archive(product):
    require(not (product.kind == 'ingredient' and RecipeLine.objects.filter(ingredient=product, recipe__product__active=True).exists()),
            'Retira el ingrediente de las recetas activas antes de archivarlo.', 'in_recipe', 409)
    product.active = False
    product.save(update_fields=['active'])


def price_before_taxes(price, taxes):
    """Base para informes de un precio que ya incluye los impuestos indicados."""
    return Decimal(str(price)) / (1 + sum((t.amount / 100 for t in taxes if t.included), Decimal(0)))
