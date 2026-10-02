from django.urls import path

from .api import ProfitabilityView, SummaryView

urlpatterns = [
    path("reports/summary", SummaryView.as_view()),
    path("reports/profitability", ProfitabilityView.as_view()),
]
