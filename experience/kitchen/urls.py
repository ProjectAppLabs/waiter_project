from django.urls import path

from .api import CourseView, LinesView, TicketsView

urlpatterns = [path("kitchen/tickets", TicketsView.as_view())]
urlpatterns += [
    path(f"courses/<int:pk>/{action}", CourseView.as_view(action=action)) for action in ("start", "ready", "serve")
]
urlpatterns += [path(f"lines/{action}", LinesView.as_view(action=action)) for action in ("ready", "serve")]
