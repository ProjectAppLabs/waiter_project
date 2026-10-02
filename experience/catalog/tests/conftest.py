import pytest

from catalog.models import Category, Product, Recipe, RecipeLine, Supplier, Tax, Unit
from catalog.services import seed_organization
from inventory.models import Stock
from tenancy.tests.helpers import account, organization, pos_client, restaurant


@pytest.fixture(autouse=True)
def environment(settings, tmp_path):
    settings.PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
    settings.MAILERS = {'default': {'BACKEND': 'django.core.mail.backends.locmem.EmailBackend'},
                       'waiter': {'BACKEND': 'django.core.mail.backends.locmem.EmailBackend'}}
    settings.MEDIA_ROOT = tmp_path / 'media'


@pytest.fixture
def setup(db):
    org = organization()
    seed_organization(org)
    r1, r2 = restaurant(org), restaurant(org, 'norte')
    person = account(org)
    client = pos_client(person)
    kg = Unit.objects.get(organization=org, name='kg')
    gram = Unit.objects.get(organization=org, name='g')
    liter = Unit.objects.get(organization=org, name='L')
    tax = Tax.objects.get(organization=org, amount=8)
    category = Category.objects.create(organization=org, name='Platos')
    supplier = Supplier.objects.create(organization=org, name='La huerta')
    ingredient = Product.objects.create(organization=org, name='Papa', kind='ingredient', unit=kg, cost=2000,
                                         pantry_category='produce', supplier=supplier, available_in_pos=False)
    dish = Product.objects.create(organization=org, name='Papas', kind='dish', price=10800)
    dish.categories.add(category)
    dish.taxes.add(tax)
    recipe = Recipe.objects.create(product=dish, yield_qty=2)
    RecipeLine.objects.create(recipe=recipe, ingredient=ingredient, qty=500, unit=gram)
    Stock.objects.create(restaurant=r1, ingredient=ingredient, qty=3)
    Stock.objects.create(restaurant=r2, ingredient=ingredient, qty=0)
    return locals()
