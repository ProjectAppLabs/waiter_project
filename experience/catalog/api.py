"""API T1 del catálogo, con autorización explícita compartida con T0."""
import hashlib

from django.core.files.storage import default_storage
from django.http import FileResponse
from rest_framework.response import Response

from accounts.authentication import pos_session, resolve_organization
from accounts.services import restaurants_for
from tenancy.http import ContractView, model_dict, payload, require, save_valid

from . import services as s
from .images import photo_dict, set_photos, thumbnail_path
from .models import (
    CatalogRevision,
    Category,
    Product,
    ProductPhoto,
    RestaurantPrice,
    RestaurantUnavailable,
    Supplier,
    Tax,
    Unit,
)
from .reading import CatalogData, category_dict, recipe_response, regime_for, tax_dict


class PosView(ContractView):
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.account = pos_session(request).account
        self.org = self.account.organization
        from tenancy.module_access import check_pos_view
        check_pos_view(self, request, kwargs)

    def product(self, pk, **filters):
        product = s.reference(Product, self.org, pk, **filters)
        require(product.kind != 'service', 'Este producto lo administra el sistema.', 'not_found', 404)
        return product


class CatalogView(PosView):
    def get(self, request):
        restaurant = s.restaurant_for(self.account, request.query_params.get('restaurant_id'))
        revision = CatalogRevision.objects.filter(organization=self.org).values_list('version', flat=True).first() or 0
        etag = '"' + hashlib.sha256(f'{self.org.pk}:{restaurant.pk}:{revision}'.encode()).hexdigest() + '"'
        headers = {'ETag': etag, 'Cache-Control': 'private, no-cache', 'Vary': 'Cookie, X-Waiter-Org'}
        if request.headers.get('If-None-Match') == etag:
            return Response(status=304, headers=headers)
        data = CatalogData(self.org, [restaurant])
        return Response({'categories': [category_dict(c) for c in Category.objects.filter(organization=self.org, active=True)],
                         'taxes': [tax_dict(t) for t in Tax.objects.filter(organization=self.org, active=True).order_by('id')],
                         'products': [data.product_dict(p, restaurant.pk, sold_out=True) for p in data.products.values()
                                      if p.active and p.kind == 'dish' and p.available_in_pos]}, headers=headers)


class ProductsView(PosView):
    def get(self, request):
        kind = request.query_params.get('kind')
        s.valid(kind in (None, 'dish', 'ingredient'))
        q = request.query_params.get('q', '').casefold()
        data = CatalogData(self.org)
        return Response({'products': [data.product_dict(p) for p in data.products.values()
                                      if p.active and p.kind != 'service' and (not kind or p.kind == kind) and q in p.name.casefold()]})

    def post(self, request):
        product = s.save_product(self.account, request.data)
        data = CatalogData(self.org)
        return Response({'product': data.product_dict(data.products[product.pk])}, status=201)

    def patch(self, request, pk):
        product = s.save_product(self.account, request.data, self.product(pk))
        data = CatalogData(self.org)
        return Response({'product': data.product_dict(data.products[product.pk])})


class ArchiveView(PosView):
    def post(self, request, pk):
        s.owner(self.account)
        with s.writing(self.org):
            s.archive(self.product(pk))
        return Response({'ok': True})


class RecipeView(PosView):
    def get(self, request, pk):
        return Response(recipe_response(self.account, self.product(pk, kind='dish')))

    def put(self, request, pk):
        s.owner(self.account)
        with s.writing(self.org):
            product = self.product(pk, kind='dish')
            s.set_recipe(product, request.data)
        return Response(recipe_response(self.account, product))


class PhotosView(PosView):
    def get(self, request, pk):
        return Response({'photos': [photo_dict(p) for p in self.product(pk).photos.all()]})

    def put(self, request, pk):
        s.owner(self.account)
        with s.writing(self.org):
            result = set_photos(self.product(pk), request.data)
        return Response({'photos': result})


class OverviewView(PosView):
    def get(self, request):
        s.manager(self.account)
        return Response(CatalogData(self.org).overview())


class RestaurantCatalogView(PosView):
    def get(self, request):
        # El encargado también lista la carta y los agotados de SUS restaurantes para poder reactivar un plato tras
        # recargar; sólo el dueño recibe los precios (base y por restaurante). La forma de la respuesta no cambia.
        s.manager(self.account)
        is_owner = self.account.role == 'owner'
        restaurants = list(restaurants_for(self.account).order_by('id'))
        data = CatalogData(self.org, restaurants)
        return Response({'dishes': [{**model_dict(p, ('id', 'name', 'price') if is_owner else ('id', 'name')),
                                    'category': next((c.name for c in p.categories.all()), '')}
                                   for p in data.products.values() if p.active and p.kind == 'dish'],
                         'prices': {str(r.pk): {str(pid): float(price) for (rid, pid), price in data.prices.items() if rid == r.pk} for r in restaurants} if is_owner else {},
                         'unavailable': {str(r.pk): sorted(pid for rid, pid in data.unavailable if rid == r.pk) for r in restaurants}})

    def put(self, request, restaurant_id, pk):
        s.manager(self.account)
        data = payload(request.data, ('price', 'unavailable'))
        if 'price' in data:
            s.owner(self.account)
        restaurant = s.restaurant_for(self.account, restaurant_id)
        with s.writing(self.org):
            product = self.product(pk, kind='dish', active=True)
            if 'price' in data:
                if data['price'] is None:
                    RestaurantPrice.objects.filter(restaurant=restaurant, product=product).delete()
                else:
                    RestaurantPrice.objects.update_or_create(restaurant=restaurant, product=product, defaults={'price': s.number(data['price'])})
            if 'unavailable' in data:
                s.valid(type(data['unavailable']) is bool)
                if data['unavailable']:
                    RestaurantUnavailable.objects.get_or_create(restaurant=restaurant, product=product)
                else:
                    RestaurantUnavailable.objects.filter(restaurant=restaurant, product=product).delete()
        return Response({'ok': True})


class CategoriesView(PosView):
    def get(self, request):
        return Response({'categories': [category_dict(c) for c in Category.objects.filter(organization=self.org, active=True)]})

    def save(self, request, pk=None):
        s.owner(self.account)
        data = payload(request.data, ('name', 'sequence', 'station'), ('name',) if pk is None else ())
        with s.writing(self.org):
            category = s.reference(Category, self.org, pk) if pk else Category(organization=self.org)
            for key, value in data.items():
                s.valid(type(value) is int if key == 'sequence' else isinstance(value, str))
                setattr(category, key, value.strip() if isinstance(value, str) else value)
            save_valid(category)
        return Response({'category': category_dict(category)}, status=201 if pk is None else 200)

    def post(self, request):
        return self.save(request)

    def patch(self, request, pk):
        return self.save(request, pk)


class TaxesView(PosView):
    def get(self, request):
        return Response({'taxes': [tax_dict(t) for t in Tax.objects.filter(organization=self.org, active=True).order_by('id')],
                         'regime': regime_for(CatalogData(self.org))})

    def put(self, request):
        s.owner(self.account)
        data = payload(request.data, ('regime',), ('regime',))
        regime = data['regime']
        s.valid(regime in ('inc', 'iva', 'none'))
        with s.writing(self.org):
            tax = None
            if regime != 'none':
                tax = Tax.objects.filter(organization=self.org, active=True, amount=8 if regime == 'inc' else 19, included=True).order_by('id').first()
                s.valid(tax, 'No existe el impuesto del régimen en esta organización.')
            dishes = Product.objects.filter(organization=self.org, kind='dish')
            through = Product.taxes.through
            through.objects.filter(product__in=dishes).delete()
            if tax:
                through.objects.bulk_create([through(product_id=pk, tax_id=tax.pk) for pk in dishes.values_list('id', flat=True)])
        return Response({'regime': regime, 'taxes': [tax_dict(t) for t in Tax.objects.filter(organization=self.org, active=True).order_by('id')]})


class UnitsView(PosView):
    def get(self, request):
        return Response({'units': [model_dict(u, ('id', 'name', 'root', 'factor')) for u in Unit.objects.filter(organization=self.org).order_by('id')]})


class SuppliersView(PosView):
    def get(self, request):
        return Response({'suppliers': [model_dict(supplier, ('id', 'name', 'phone', 'email'))
                                       for supplier in Supplier.objects.filter(organization=self.org, active=True).order_by('name', 'id')]})

    def post(self, request):
        s.owner(self.account)
        data = payload(request.data, ('name', 'phone', 'email'), ('name',))
        s.valid(all(isinstance(v, str) for v in data.values()))
        with s.writing(self.org):
            supplier = save_valid(Supplier(organization=self.org, **{k: v.strip() for k, v in data.items()}))
        return Response({'supplier': model_dict(supplier, ('id', 'name', 'phone', 'email'))}, status=201)


class ImageView(ContractView):
    gallery = False

    def get(self, request, pk):
        org = resolve_organization(request)
        if self.gallery:
            photo = ProductPhoto.objects.filter(pk=pk, product__organization=org, product__active=True).first()
            require(photo, 'No encontramos la foto.', 'not_found', 404)
            name = photo.image.name
        else:
            product = s.reference(Product, org, pk, active=True)
            require(product.image, 'El producto no tiene foto.', 'not_found', 404)
            size = request.query_params.get('size', 'dish')
            s.valid(size in ('card', 'dish'), 'El tamaño debe ser card o dish.')
            name = thumbnail_path(product.image.name, 512 if size == 'card' else 1024)
        require(default_storage.exists(name), 'No encontramos la imagen.', 'not_found', 404)
        response = FileResponse(default_storage.open(name, 'rb'), content_type='image/webp')
        response['Cache-Control'] = 'public, max-age=86400, immutable'
        response['Vary'] = 'X-Waiter-Org'
        return response
