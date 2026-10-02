from django.urls import path

from . import api

urlpatterns = [
    path("reservations", api.ReservationsView.as_view(http_method_names=["get", "post", "options"])),
    path("reservations/<int:pk>", api.ReservationsView.as_view(http_method_names=["get", "options"])),
    path("reservations/schedule", api.ScheduleView.as_view()),
    path("public/reservations/<str:token>", api.PublicDepositView.as_view()),
    path("internal/reservations/<str:token>/deposit-paid", api.DepositPaidView.as_view()),
]
for mode in ("timeline", "slots", "tables"):
    urlpatterns.append(path(f"reservations/{mode}", api.CalendarView.as_view(mode=mode)))
for action, route, method in [
    ("tables", "tables", "put"),
    ("deposit", "deposit", "put"),
    ("deposit-paid", "deposit/paid", "post"),
    ("seat", "seat", "post"),
    ("no-show", "no-show", "post"),
    ("cancel", "cancel", "post"),
]:
    urlpatterns.append(
        path(
            f"reservations/<int:pk>/{route}",
            api.ReservationActionView.as_view(action=action, http_method_names=[method, "options"]),
        )
    )
