from django.urls import path

from notifications.preferences import NotifyPrefsView, RequestIngredientView

from . import api

urlpatterns = [
    path("me/notify-prefs", NotifyPrefsView.as_view()),
    path("notifications/<int:pk>/request-ingredient", RequestIngredientView.as_view()),
    path("customers", api.CustomersView.as_view(http_method_names=["get", "post", "options"])),
    path("customers/id-types", api.CustomerInfoView.as_view(mode="id-types")),
    path("customers/<int:pk>", api.CustomersView.as_view(http_method_names=["get", "patch", "options"])),
    path("customers/<int:pk>/card", api.CustomerInfoView.as_view()),
    path("customers/<int:pk>/orders", api.CustomerInfoView.as_view(mode="orders")),
    path("loyalty/program", api.ProgramView.as_view()),
    path("loyalty/cards/<str:code>", api.CardView.as_view()),
    path("orders/<int:pk>/redeem", api.RedeemView.as_view()),
    path("benefits", api.BenefitsView.as_view()),
    path("banners", api.BannersView.as_view()),
    path("banners/<int:pk>/image", api.BannerImageView.as_view()),
]
