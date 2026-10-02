"""Catálogo compartido por organización y excepciones por restaurante."""
from django.core.validators import MinValueValidator
from django.db import models


def choices(*values):
    return [(v, v) for v in values]


def decimal(default=0):
    return models.DecimalField(max_digits=18, decimal_places=6, default=default, validators=[MinValueValidator(0)])


class Owned(models.Model):
    organization = models.ForeignKey('tenancy.Organization', on_delete=models.CASCADE)

    class Meta:
        abstract = True


class Category(Owned):
    name = models.CharField(max_length=120)
    sequence = models.IntegerField(default=0)
    # El nombre libre de la estación del KDS (Parrilla, Barra…); vacía, la categoría solo sale en «Todas».
    station = models.CharField(max_length=40, blank=True, default='')
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ['sequence', 'id']


class Tax(Owned):
    name = models.CharField(max_length=120)
    amount = decimal()
    included = models.BooleanField(default=True)
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'name'], name='tax_org_name_unique')]


class Unit(Owned):
    name = models.CharField(max_length=40)
    root = models.CharField(max_length=10, choices=choices('weight', 'volume', 'count'))
    factor = decimal(1)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization', 'name'], name='unit_org_name_unique'),
                       models.CheckConstraint(condition=models.Q(factor__gt=0), name='unit_positive_factor')]


class Supplier(Owned):
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=40, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    active = models.BooleanField(default=True)


class Product(Owned):
    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=10, choices=choices('dish', 'ingredient'))
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    legacy_odoo_template_id = models.PositiveIntegerField(null=True, blank=True)
    categories = models.ManyToManyField(Category, blank=True)
    price = decimal()
    taxes = models.ManyToManyField(Tax, blank=True)
    available_in_pos = models.BooleanField(default=True)
    favorite = models.BooleanField(default=False)
    description = models.TextField(blank=True, default='')
    diner_attributes = models.JSONField(default=dict, blank=True)
    image = models.FileField(max_length=300, blank=True, default='')
    image_origin = models.CharField(max_length=12, choices=choices('real', 'ai', 'placeholder'), null=True, blank=True)
    image_version = models.DateTimeField(null=True, blank=True)
    preparation_minutes = models.PositiveIntegerField(null=True, blank=True)
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, null=True, blank=True)
    pantry_category = models.CharField(max_length=10, choices=choices('produce', 'meat', 'seafood', 'dairy', 'dry'), blank=True, default='')
    cost = decimal()
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, null=True, blank=True)
    track_stock = models.BooleanField(default=True)

    class Meta:
        ordering = ['name', 'id']


class ProductPhoto(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='photos')
    sequence = models.PositiveSmallIntegerField(default=0)
    image = models.FileField(max_length=300)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    file_size = models.PositiveIntegerField()

    class Meta:
        ordering = ['sequence', 'id']


class RestaurantPrice(models.Model):
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    price = decimal()

    class Meta:
        constraints = [models.UniqueConstraint(fields=['restaurant', 'product'], name='restaurant_product_price_unique')]


class RestaurantUnavailable(models.Model):
    restaurant = models.ForeignKey('tenancy.Restaurant', on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['restaurant', 'product'], name='restaurant_product_unavailable_unique')]


class Recipe(models.Model):
    product = models.OneToOneField(Product, on_delete=models.CASCADE, related_name='recipe')
    yield_qty = decimal(1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(yield_qty__gt=0), name='recipe_positive_yield')]


class RecipeLine(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='lines')
    ingredient = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='recipe_lines')
    qty = decimal()
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT)

    class Meta:
        ordering = ['id']
        constraints = [models.UniqueConstraint(fields=['recipe', 'ingredient'], name='recipe_ingredient_unique'),
                       models.CheckConstraint(condition=models.Q(qty__gt=0), name='recipe_line_positive_qty')]


class CatalogRevision(Owned):
    """Contador transaccional de escrituras; también serializa las operaciones de una organización."""
    version = models.PositiveBigIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['organization'], name='catalog_revision_org_unique')]
