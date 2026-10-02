"""Reglas que la base debe cumplir igual en MySQL, PostgreSQL y SQLite (tenancy.fields)."""
from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from accounts.models import Attendance
from sales.models import CashShift
from tables.models import Table
from tenancy.tests.helpers import account, organization, restaurant

pytestmark = pytest.mark.django_db


@pytest.fixture
def venue():
    from sales.services import seed_organization, seed_restaurant
    org = organization()
    place = restaurant(org)
    seed_organization(org)
    seed_restaurant(place)
    return org, place, account(org, restaurants=[place])


def rejects(create):
    with pytest.raises(IntegrityError), transaction.atomic():
        create()


# Falla si la colación de MySQL vuelve a comparar los tokens sin distinguir mayúsculas: dos mesas con «Ab12Cd» y
# «ab12cd» chocarían al crearlas, o el QR de una abriría la otra.
def test_table_tokens_distinguish_case(venue):
    org, place, _ = venue
    floor = place.floors.get()
    upper = Table.objects.create(floor=floor, number=1, token='Ab12Cd')
    lower = Table.objects.create(floor=floor, number=2, token='ab12cd')
    assert Table.objects.get(token='Ab12Cd') == upper
    assert Table.objects.get(token='ab12cd') == lower
    rejects(lambda: Table.objects.create(floor=floor, number=3, token='Ab12Cd'))


# Falla si la regla «una sola caja abierta por restaurante» se pierde sin índices parciales, o si impide guardar
# varias cajas ya cerradas del mismo restaurante.
def test_only_one_open_cash_shift_per_restaurant(venue):
    org, place, owner = venue
    CashShift.objects.create(restaurant=place, opened_by=owner, state='closed')
    CashShift.objects.create(restaurant=place, opened_by=owner, state='closed')
    first = CashShift.objects.create(restaurant=place, opened_by=owner)
    rejects(lambda: CashShift.objects.create(restaurant=place, opened_by=owner))
    first.state = 'closed'
    first.save()
    CashShift.objects.create(restaurant=place, opened_by=owner)
    other = restaurant(org, slug='norte')
    CashShift.objects.create(restaurant=other, opened_by=owner)


# Falla si una persona puede tener dos asistencias abiertas a la vez, o si las ya cerradas bloquean la siguiente.
def test_only_one_open_attendance_per_person(venue):
    _, place, owner = venue
    start = timezone.now() - timedelta(hours=3)
    Attendance.objects.create(account=owner, restaurant=place, check_in=start, check_out=start + timedelta(hours=1))
    Attendance.objects.create(account=owner, restaurant=place, check_in=start + timedelta(hours=2))
    rejects(lambda: Attendance.objects.create(account=owner, restaurant=place, check_in=timezone.now()))
