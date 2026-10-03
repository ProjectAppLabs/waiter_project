"""Invitaciones, horarios, sesiones y administración de personas del plan P."""
from datetime import datetime, time, timedelta, timezone as datetime_timezone
import hashlib
import math
import re
import secrets
import unicodedata
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.html import escape, strip_tags

from tenancy.http import Problem, payload, require, save_valid
from tenancy.models import PlatformUser, Restaurant
from .models import Account, Attendance, Session


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def code_hash(user, code):
    return digest(f'{user.username.lower().strip()}:{code}')


def suggested_username(name, queryset):
    normalized = ''.join(c for c in unicodedata.normalize('NFD', name) if not '\u0300' <= c <= '\u036f')
    base = re.sub('[^a-z0-9]+', '.', normalized.lower()).strip('.')[:32].rstrip('.')
    if len(base) < 3:
        base = (base + '.usuario').strip('.')
    candidate, suffix = base, 1
    while queryset.filter(username=candidate).exists():
        suffix += 1
        ending = f'.{suffix}'
        candidate = base[:32-len(ending)].rstrip('.') + ending
    return candidate


def find_identity(queryset, login):
    if not isinstance(login, str):
        return None
    login = login.strip().lower()
    return queryset.filter(Q(username__iexact=login) | Q(email__iexact=login), active=True).first()


def valid_password(password):
    return isinstance(password, str) and 8 <= len(password) <= 1024


def invitation(user, reset=False):
    """El fallo del correo revierte solo el código y permite reintentar el envío."""
    try:
        with transaction.atomic():
            user = type(user).objects.select_for_update().get(pk=user.pk)
            now = timezone.now()
            if not user.active or not user.email or (user.invite_sent_at and (now-user.invite_sent_at).total_seconds() < 60):
                return False
            code = f'{secrets.randbelow(1_000_000):06d}'
            user.invite_code_hash = code_hash(user, code)
            user.invite_expires = now + (timedelta(minutes=30) if reset else timedelta(hours=48))
            user.invite_attempts = 0
            user.invite_sent_at = now
            user.save(update_fields=['invite_code_hash', 'invite_expires', 'invite_attempts', 'invite_sent_at'])
            platform = isinstance(user, PlatformUser)
            base = settings.PLATFORM_URL if platform else settings.POS_URL
            link = base + '/login?' + urlencode({'codigo': user.username})
            button = f'<p><a href="{escape(link)}">Poner mi contraseña</a></p>'
            hello = f'<p>Hola {escape(user.name)},</p>'
            identity = f'<p>Tu usuario es <strong>{escape(user.username)}</strong>; también puedes entrar con este correo.</p>'
            code_html = f'<p><strong>{code}</strong></p>'
            if reset:
                subject = 'Tu código para cambiar la contraseña de Waiter'
                body = (hello + identity + '<p>Tu código para cambiar la contraseña es:</p>' + code_html + button +
                        '<p>Escríbelo en la pantalla de entrada junto con tu nueva contraseña. Sirve una sola vez y vence en '
                        '30 minutos.</p><p>Si no lo pediste, ignora este correo: tu contraseña no cambia.</p>')
            else:
                subject = 'Te dieron acceso a Waiter'
                body = (hello + '<p>Ya tienes cuenta en <strong>Waiter</strong>.</p>' + identity +
                        '<p>Tu código para poner tu contraseña es:</p>' + code_html + button +
                        '<p>Sirve una sola vez y vence en 48 horas. Si vence, en la pantalla de entrada pulsa '
                        '«¿Olvidaste tu contraseña?».</p>')
            body += '<p>— Equipo ProjectApp</p>'
            # La versión en texto plano conserva un salto por párrafo: strip_tags a secas pegaba todas las frases.
            mail = EmailMultiAlternatives(subject, strip_tags(body.replace('</p>', '</p>\n')).strip(), settings.EMAIL_FROM, [user.email])
            mail.attach_alternative(body, 'text/html')
            if not mail.send(using='waiter'):
                raise RuntimeError('No se pudo enviar el correo.')
        return True
    except Exception:
        # El alta debe sobrevivir incluso a una indisponibilidad del servidor de correo.
        return False


def activate(queryset, data):
    data = payload(data, ('login', 'code', 'password'), ('login', 'code', 'password'))
    accepted = False
    with transaction.atomic():
        user = find_identity(queryset.select_for_update(), data['login'])
        if user and user.invite_code_hash and user.invite_expires and user.invite_expires > timezone.now():
            matches = secrets.compare_digest(user.invite_code_hash, code_hash(user, str(data['code'])))
            if matches and valid_password(data['password']):
                user.password = make_password(data['password'])
                user.activated = True
                user.invite_code_hash = ''
                user.invite_expires = None
                user.save()
                revoke(user)
                accepted = True
            elif not matches:
                user.invite_attempts += 1
                if user.invite_attempts >= 5:
                    user.invite_code_hash = ''
                    user.invite_expires = None
                user.save()
    # El rechazo ocurre después del commit para conservar el contador de intentos.
    require(accepted, 'El código no es válido o venció. La contraseña necesita al menos 8 caracteres.', 'invalid_code', 400)


def revoke(user, now=None):
    now = now or timezone.now()
    user.sessions.all().delete()
    if isinstance(user, Account):
        user.attendances.filter(check_out__isnull=True).update(check_out=now)


def restaurants_for(account):
    rows = Restaurant.objects.filter(organization=account.organization, active=True)
    return rows if account.role == 'owner' else rows.filter(accounts=account)


def access_window(account, restaurant=None, now=None):
    now = now or timezone.now()
    local = now.astimezone(ZoneInfo(account.organization.timezone))
    start_hour, end_hour = account.shift_start, account.shift_end
    def label(hour):
        minutes = round(hour * 60)
        return f'{minutes//60:02d}:{minutes%60:02d}'
    result = {'allowed': True, 'end': None, 'label': '', 'local_time': local.strftime('%H:%M')}
    if start_hour is None or end_hour is None:
        return result
    result['label'] = f'{label(start_hour)}–{label(end_hour)}'
    if account.role not in ('waiter', 'cashier') or start_hour == end_hour:
        return result
    margin = timedelta(minutes=restaurant.access_margin_minutes if restaurant else 30)
    ends = []
    for offset in (-1, 0, 1):
        midnight = datetime.combine(local.date()+timedelta(days=offset), time.min)
        start = (midnight + timedelta(hours=start_hour)).replace(tzinfo=local.tzinfo).astimezone(datetime_timezone.utc) - margin
        end = midnight + timedelta(hours=end_hour, days=int(end_hour < start_hour))
        end = end.replace(tzinfo=local.tzinfo).astimezone(datetime_timezone.utc) + margin
        if start <= now < end:
            ends.append(end)
    result.update(allowed=bool(ends), end=max(ends) if ends else None)
    return result


def login_pos(organization, data):
    data = payload(data, ('login', 'password', 'restaurant_id'), ('login', 'password'))
    account = find_identity(Account.objects.filter(organization=organization), data['login'])
    require(account and account.activated and isinstance(data['password'], str) and
            check_password(data['password'], account.password), 'El usuario o la contraseña no son correctos.', 'invalid_credentials', 401)
    with transaction.atomic():
        from tenancy.models import Organization
        Organization.objects.select_for_update().get(pk=organization.pk)
        account = Account.objects.select_for_update().select_related('organization').get(pk=account.pk)
        require(account.active and account.activated and check_password(data['password'], account.password),
                'La cuenta no está disponible.', 'invalid_credentials', 401)
        require(account.organization.status != 'suspended', 'La cuenta de tu organización está suspendida. Escribe a ProjectApp.', 'organization_suspended')
        restaurants = restaurants_for(account)
        restaurant = None
        if 'restaurant_id' in data:
            require(type(data['restaurant_id']) is int, 'Indica un restaurante válido.', 'invalid_data', 400)
            restaurant = restaurants.filter(pk=data['restaurant_id']).first()
            require(restaurant, 'El restaurante no está asignado a esta persona.')
        elif restaurants.count() == 1:
            restaurant = restaurants.first()
        window = access_window(account, restaurant)
        if window['allowed']:
            now = timezone.now()
            # Una identidad vigente por persona, como el token del plan P.
            old_end = account.sessions.order_by('-expires').values_list('expires', flat=True).first()
            if old_end and old_end <= now:
                account.attendances.filter(check_out__isnull=True).update(check_out=old_end)
            account.sessions.all().delete()
            attendance, _ = Attendance.objects.get_or_create(account=account, check_out=None,
                                                            defaults={'restaurant': restaurant, 'check_in': now})
            token = secrets.token_hex(32)
            session = Session.objects.create(account=account, restaurant=restaurant, token_hash=digest(token),
                                             expires=min(window['end'] or now+timedelta(hours=16), now+timedelta(hours=16)))
            account.last_login = now
            account.save(update_fields=['last_login'])
        else:
            from notifications.services import notify_outside_hours
            notify_outside_hours(account, restaurant, window)
    if not window['allowed']:
        raise Problem('outside_hours', f'Estás fuera de tu horario de acceso. Tu turno es {window["label"]}.', 403, window=window['label'])
    return account, session, token, attendance


def people_authority(actor, person=None):
    require(actor.role in ('owner', 'admin'))
    allowed = None if actor.role == 'owner' else set(restaurants_for(actor).values_list('id', flat=True))
    if person:
        require(person.organization_id == actor.organization_id)
        require(allowed is None or (person.role != 'owner' and set(person.restaurants.values_list('id', flat=True)) <= allowed),
                'El encargado solo puede administrar personas de sus restaurantes.')
    return allowed


@transaction.atomic
def save_person(actor, data, person=None):
    # La organización serializa altas, propuestas de usuario y asignaciones.
    from tenancy.models import Organization
    org = Organization.objects.select_for_update().get(pk=actor.organization_id)
    require(org.status != 'suspended', 'La cuenta de tu organización está suspendida. Escribe a ProjectApp.', 'organization_suspended')
    actor = Account.objects.get(pk=actor.pk)
    require(actor.active, 'La cuenta no está disponible.', 'unauthenticated', 401)
    if person is not None:
        person = Account.objects.select_for_update().get(pk=person.pk)
    allowed = people_authority(actor, person)
    fields = {'name', 'email', 'role', 'restaurant_ids', 'shift_start', 'shift_end'}
    if person is None:
        fields.add('username')
    data = payload(data, fields, () if person else ('name', 'email', 'role', 'restaurant_ids'))
    creating = person is None
    person = person or Account(organization=actor.organization)
    ids = data.pop('restaurant_ids', list(person.restaurants.values_list('id', flat=True)) if person.pk else [])
    require(isinstance(ids, list) and all(type(i) is int and i > 0 for i in ids), 'Indica una lista de restaurantes.', 'invalid_data', 400)
    ids = set(ids)
    role = data.get('role', person.role)
    require(allowed is None or (role != 'owner' and ids <= allowed), 'El encargado solo puede asignar sus restaurantes y no puede conceder el rol de dueño.')
    require((role in ('waiter', 'cashier') and len(ids) == 1) or (role == 'admin' and len(ids) >= 1) or (role == 'owner' and not ids),
            'Meseros y cajeros necesitan un restaurante; encargados, uno o más; el dueño no lleva asignaciones.', 'invalid_data', 400)
    require(Restaurant.objects.filter(organization=actor.organization, active=True, pk__in=ids).count() == len(ids),
            'Los restaurantes deben estar activos y pertenecer a esta organización.', 'invalid_data', 400)
    for key in ('shift_start', 'shift_end'):
        value = data.get(key)
        require(value is None or (type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 24 and not (key == 'shift_start' and value == 24)),
                'Las horas del turno deben estar entre 00:00 y 24:00.', 'invalid_data', 400)
    for key in ('name', 'email', 'username'):
        if key in data:
            require(isinstance(data[key], str) and bool(data[key].strip()), 'Completa nombre, usuario y correo.', 'invalid_data', 400)
            data[key] = data[key].strip()
    if 'email' in data:
        data['email'] = data['email'].lower()
        if data['email'] != person.email:
            person.invite_code_hash, person.invite_expires, person.invite_sent_at = '', None, None
    if creating and 'username' not in data:
        data['username'] = suggested_username(data['name'], Account.objects.filter(organization=actor.organization))
    for key, value in data.items():
        setattr(person, key, value)
    save_valid(person)
    person.restaurants.set(ids)
    if not creating:
        revoke(person)
    return person


@transaction.atomic
def deactivate_person(actor, person):
    people_authority(actor, person)
    require(actor.pk != person.pk, 'No puedes desactivar tu propia cuenta.', 'invalid_data', 400)
    person.active, person.invite_code_hash, person.invite_expires = False, '', None
    person.save(update_fields=['active', 'invite_code_hash', 'invite_expires'])
    revoke(person)
