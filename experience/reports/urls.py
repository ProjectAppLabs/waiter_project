from django.urls import path

from .api import ProfitabilityView, SummaryView

urlpatterns = [
    path("reports/summary", SummaryView.as_view()),
    path("reports/profitability", ProfitabilityView.as_view()),
]

from .exports import ExportsView
from .team import TeamReportView
urlpatterns += [path('reports/team', TeamReportView.as_view()), path('exports/<str:kind>', ExportsView.as_view())]
