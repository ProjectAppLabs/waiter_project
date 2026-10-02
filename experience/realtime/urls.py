from django.urls import path

from .api import EventsView

urlpatterns = [path("events", EventsView.as_view())]
