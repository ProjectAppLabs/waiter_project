from django.urls import path

from . import api

urlpatterns = [
    path('catalog', api.CatalogView.as_view()),
    path('catalog/overview', api.OverviewView.as_view()),
    path('catalog/restaurants', api.RestaurantCatalogView.as_view(http_method_names=['get', 'head', 'options'])),
    path('catalog/restaurants/<int:restaurant_id>/products/<int:pk>', api.RestaurantCatalogView.as_view(http_method_names=['put', 'options'])),
    path('products', api.ProductsView.as_view(http_method_names=['get', 'head', 'post', 'options'])),
    path('products/<int:pk>', api.ProductsView.as_view(http_method_names=['patch', 'options'])),
    path('products/<int:pk>/archive', api.ArchiveView.as_view()),
    path('products/<int:pk>/recipe', api.RecipeView.as_view()),
    path('products/<int:pk>/photos', api.PhotosView.as_view()),
    path('categories', api.CategoriesView.as_view(http_method_names=['get', 'head', 'post', 'options'])),
    path('categories/<int:pk>', api.CategoriesView.as_view(http_method_names=['patch', 'options'])),
    path('taxes', api.TaxesView.as_view(http_method_names=['get', 'head', 'options'])),
    path('taxes/regime', api.TaxesView.as_view(http_method_names=['put', 'options'])),
    path('units', api.UnitsView.as_view()),
    path('suppliers', api.SuppliersView.as_view()),
    path('photos/<int:pk>', api.ImageView.as_view()),
    path('photos/gallery/<int:pk>', api.ImageView.as_view(gallery=True)),
]
