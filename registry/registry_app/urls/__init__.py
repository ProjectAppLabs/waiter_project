from django.urls import path

from registry_app.views.resolve import resolve

from registry_app.views.resolve import restaurants

urlpatterns = [
    path('internal/v1/organizaciones/<slug:organization>/restaurantes/', restaurants, name='organization-restaurants'),
    path("internal/v1/resolve/<slug:restaurant>/<slug:venue>/", resolve, name="resolve-venue"),
    path("internal/v1/resolve/<slug:restaurant>/<slug:venue>/t/<str:token>/", resolve, name="resolve-table"),
]
