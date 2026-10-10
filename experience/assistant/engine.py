"""Núcleo compartido: filtros, decisión del servidor y respuesta verificable."""
import json
import re
from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from tenancy.audit import audited
from tenancy.http import require
from tenancy.models import Organization
from tenancy.modules import require_module
from . import business
from .evaluator import JevEvaluator, questions_for
from .models import (AssistantConversationState, AssistantDailyUsage, AssistantDecisionCache,
                     AssistantProfile, AssistantStanding, AssistantTurn)
from .profiles import identity, profile_data, remember
from .selection import VOCABULARY, catalog_for, fingerprint, named_products, normalize, select
from .voice import OpenAIVoice, TemplateVoice
from . import service
from .tones import phrases, tone_of


class Reply(dict):
    """El contrato público conserva solo las ocho claves del plan; métricas y carrito son internos."""
    turn_id = None
    usage = None
    add = False
    lines = None


TAG_THRESHOLD = .65
GREETING = re.compile(r'(?:hola|holi|hey|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que mas|que hubo|quiubo|saludos)'
                      r'(?: (?:hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que mas|como estas|como esta|como vas|como va|amigo|mesero|de nuevo|otra vez|otra vez por aca|por aca))*')


def noul(answers, key):
    value = (answers or {}).get(key, {}).get('noul', 0)
    return value if type(value) in (float, int) and 0 <= value <= 1 else 0


def choice(answers, key, threshold=.85):
    item = (answers or {}).get(key, {})
    return item.get('choice') if item.get('confidence', 0) >= threshold else None


def change_standing(standing, level, now, day, reason):
    standing.level, standing.reason = level, reason
    standing.until = None
    if level == 'restricted':
        standing.until = now + timedelta(minutes=30)
        standing.restricted_day = day
    if level == 'paused':
        standing.until = datetime.combine(day + timedelta(days=1), time.min,
                                         tzinfo=ZoneInfo(standing.organization.timezone))
    standing.save()


def discipline(standing, now, day, manipulation=False):
    standing.consecutive += 1
    standing.incidents = [t for t in standing.incidents if t >= (now - timedelta(minutes=10)).timestamp()] + [now.timestamp()]
    if standing.level == 'warning':
        level = 'paused' if standing.restricted_day == day else 'restricted'
    elif manipulation or len(standing.incidents) >= 4:
        level = 'warning'
    elif standing.consecutive >= 2:
        level = 'reminder'
    else:
        level = ''
    if level:
        change_standing(standing, level, now, day, 'Intento de cambiar reglas' if manipulation else 'Mensajes fuera de tema')
    else:
        standing.save()
    return level


def card(product):
    return {'product_id': product['id'], 'name': product['nombre'],
            'price': str(Decimal(str(product.get('precio', 0))).quantize(Decimal('.01'))),
            'reason': 'Disponible en el menú de esta sede.'}


def option_cards(cards):
    return [{'label': c['name'], 'value': f"pick:{c['product_id']}"} for c in cards]


def text_action(text, state):
    value = normalize(text)
    match = re.fullmatch(r'(?:la |el |opcion )?([1-9])', value)
    if match and int(match[1]) <= len(state.options):
        return {'type': 'option', 'value': state.options[int(match[1]) - 1]['value']}
    if value in ('si', 'no') and state.options:
        # Un sí ambiguo nunca confirma dinero ni selecciona entre varios platos.
        target = 'confirm' if value == 'si' else 'menu'
        if any(o['value'] == target for o in state.options):
            return {'type': 'option', 'value': target}
    for option in state.options:
        if value == normalize(option['label']):
            return {'type': 'option', 'value': option['value']}
    return None


def execute(action, state, products):
    if not isinstance(action, dict) or set(action) - {'type', 'product_id', 'value', 'revision'}:
        return 'invalid_action', []
    kind = action.get('type')
    if kind == 'option':
        value = action.get('value')
        if not isinstance(value, str) or value not in [o['value'] for o in state.options]:
            return 'invalid_action', []
        if value.startswith('pick:'):
            return execute({'type': 'pick', 'product_id': int(value[5:])}, state, products)
        if value.startswith('cat:') and state.state not in ('esperando_pago', 'pagado'):
            state.state = 'explorando'
            chosen = service.by_category(products, value[4:])
            return ('menu' if chosen else 'empty'), chosen
        return execute({'type': value}, state, products)
    if kind == 'menu' and state.state not in ('esperando_pago', 'pagado'):
        state.state, state.selection = 'explorando', []
        return 'menu', select(products)
    if kind == 'pick' and state.state in ('explorando', 'eligiendo', 'falta_dato', 'resumen'):
        pk = action.get('product_id')
        if type(pk) is not int or pk not in [c['product_id'] for c in state.cards]:
            return 'invalid_action', []
        selected = [p for p in products if p['id'] == pk and p.get('agotado') is False]
        if not selected:
            return 'invalid_action', []
        state.selection = [pk]
        state.state = 'resumen'
        state.revision += 1
        return 'summary', selected
    if kind == 'confirm' and state.state == 'resumen' and action.get('revision', state.revision) == state.revision:
        selected = [p for p in products if p['id'] in state.selection and p.get('agotado') is False]
        if len(selected) == len(state.selection) and selected:
            # Esta entrega no crea pedidos, pagos ni comandas desde WhatsApp.
            return 'confirmed', selected
    return 'invalid_action', []


def welcome(products, profile):
    favorite = service.favorite(products, profile)
    if favorite:
        return 'welcome_back', [favorite], service.category_options(products)
    featured = service.featured(products)
    return ('welcome' if featured else 'clarify'), featured, service.category_options(products) or None


def greeting(restaurant, name=''):
    """El saludo de la casa si el dueño lo escribió; si no, el de la hora local, con el nombre del cliente."""
    if restaurant.organization.greeting:
        return restaurant.organization.greeting
    hour = timezone.now().astimezone(ZoneInfo(restaurant.organization.timezone)).hour
    moment = 'Buenos días' if 5 <= hour < 12 else 'Buenas tardes' if 12 <= hour < 19 else 'Buenas noches'
    return f'¡{moment}, {name}!' if name else f'¡{moment}!'


def known_name(account, profile):
    """El nombre con que se llama al cliente: el de su cuenta o el que le dijo al mesero."""
    if account and account.name and account.name.split():
        return account.name.split()[0]
    return (profile or {}).get('name', '')


def remember_name(organization, key, profile, name):
    profile = profile or AssistantProfile.objects.get_or_create(organization=organization, participant=key)[0]
    profile.name = name[:40]
    profile.save(update_fields=['name'])
    return profile


def cart_ids(participant):
    """Lo que el comensal ya tiene en su carrito abierto, para no sugerirle otra bebida si ya pidió una."""
    from experience_app.models import CartLine, Diner
    if not isinstance(participant, Diner):
        return []
    return list(CartLine.objects.filter(session=participant.session, diner=participant, order__isnull=True).values_list('product_id', flat=True))


@transaction.atomic
@audited
def handle(channel, restaurant, participant, text=None, action=None, *, products=None):
    require(channel in ('menu', 'whatsapp'), 'El canal no es válido.', 'invalid_data', 400)
    require(restaurant.active and restaurant.organization.status != 'suspended', 'El restaurante no está disponible.', 'restaurant_unavailable', 403)
    require_module(restaurant.organization, f'asistente_{channel}', restaurant)
    require(text is None or isinstance(text, str), 'Escribe un mensaje válido.', 'invalid_data', 400)
    require(action is None or isinstance(action, dict), 'Indica una opción válida.', 'invalid_data', 400)
    # Un solo orden de bloqueo protege cupos compartidos y perfiles en ambos canales.
    Organization.objects.select_for_update().get(pk=restaurant.organization_id)
    key, account = identity(channel, participant, restaurant.organization)
    tone = tone_of(restaurant.organization)
    now = timezone.now()
    day = now.astimezone(ZoneInfo(restaurant.organization.timezone)).date()
    standing, _ = AssistantStanding.objects.get_or_create(organization=restaurant.organization, participant=key,
                                                        defaults={'channel': channel})
    state, _ = AssistantConversationState.objects.get_or_create(restaurant=restaurant, participant=key, channel=channel)
    if channel == 'menu':
        from experience_app.models import Diner, Order
        from sales.models import Order as PosOrder
        if isinstance(participant, Diner):
            order = Order.objects.filter(session=participant.session, lines__diner=participant).order_by('-created_at').first()
            if order and PosOrder.objects.filter(pk=order.odoo_order_id, organization=restaurant.organization, restaurant=restaurant, state='paid').exists():
                state.state = 'pagado'
            elif order and order.state == Order.CHECKOUT:
                state.state = 'esperando_pago'
    if standing.day != day:
        standing.day, standing.attempts = day, 0
        standing.consecutive, standing.incidents = 0, []
        standing.last_at, standing.last_fingerprint, standing.buffered_text = None, '', ''
        if not standing.until or standing.until <= now:
            change_standing(standing, '', now, day, '')
    elif standing.until and standing.until <= now:
        change_standing(standing, '', now, day, '')
        standing.consecutive, standing.incidents = 0, []
    products = catalog_for(restaurant) if products is None else products
    profile = AssistantProfile.objects.filter(organization=restaurant.organization, participant=key).first()
    if profile and account:
        from .profiles import recent_orders
        profile.last_orders = recent_orders(account)
        profile.save(update_fields=['last_orders'])
    profile_info = profile_data(profile, account)
    usage = {'input_tokens': 0, 'output_tokens': 0}
    cost = Decimal(0)
    evaluator_version = model_version = ''
    confidence = None
    source, route, template = 'shortcut', 'menu', 'menu'
    chosen, notice, extra, can_voice, add = [], None, '', False, False
    welcome_options, upsell, met = None, [], ''
    raw = (text or '').strip()
    normalized = normalize(raw)
    restricted_free = channel == 'whatsapp' and action is None and standing.level in ('restricted', 'paused')
    if not restricted_free:
        action = action if action is not None else text_action(raw, state)
    counted = False

    def measure(tokens, input_rate, output_rate):
        nonlocal cost
        for field in usage:
            value = tokens.get(field, 0)
            if type(value) is int and value >= 0:
                usage[field] += value
                cost += Decimal(value) * (input_rate if field == 'input_tokens' else output_rate) / Decimal(1000000)

    if standing.level in ('restricted', 'paused') and action is None:
        template, route, source = standing.level, 'filtro', 'template'
        notice = {'kind': standing.level, 'until': standing.until.isoformat() if standing.until else None}
        chosen = select(products)
    elif action is not None:
        template, chosen = execute(action, state, products)
        route = 'pedido' if template in ('summary', 'confirmed') else 'menu'
        if template == 'summary' and (account or channel == 'whatsapp'):
            remember(restaurant.organization, key, chosen)
    elif len(raw) > 1000:
        template, route, source = 'size', 'filtro', 'template'
    elif not normalized or not re.search(r'[a-z]', normalized) or fingerprint(normalized) == standing.last_fingerprint:
        template, route, source = 'repeat', 'filtro', 'template'
        chosen = select(products)
    elif standing.last_at and (now - standing.last_at).total_seconds() < 3:
        standing.buffered_text = (standing.buffered_text + ' ' + raw).strip()[:1000]
        template, route, source = 'pace', 'filtro', 'template'
    else:
        daily, _ = AssistantDailyUsage.objects.get_or_create(restaurant=restaurant, day=day)
        if standing.attempts >= settings.ASSISTANT_DAILY_PER_PARTICIPANT or daily.attempts >= settings.AGENT_DAILY_LIMIT:
            template, route, source = 'quota', 'filtro', 'template'
            chosen = select(products)
            notice = {'kind': 'quota', 'until': datetime.combine(day + timedelta(days=1), time.min, tzinfo=ZoneInfo(restaurant.organization.timezone)).isoformat()}
        else:
            counted = True
            raw = (standing.buffered_text + ' ' + raw).strip()[:1000]
            normalized = normalize(raw)
            standing.buffered_text = ''
            standing.attempts += 1
            standing.last_at, standing.last_fingerprint = now, fingerprint(normalized)
            daily.attempts += 1
            daily.save()
            remaining = min(settings.ASSISTANT_DAILY_PER_PARTICIPANT - standing.attempts, settings.AGENT_DAILY_LIMIT - daily.attempts)
            if 0 <= remaining <= 5:
                extra = phrases(tone, 'remaining')[0].format(remaining=remaining)
                notice = {'kind': 'quota', 'until': None}
            business_data = business.data_for(restaurant)
            asked_name = state.last_question == 'name'
            given, rest = service.split_name(raw, products, asked_name)
            if given:
                profile = remember_name(restaurant.organization, key, profile, given)
                profile_info = profile_data(profile, account)
                if rest:
                    # «Mi nombre es Gustavo y quiero un domicilio»: se saluda por el nombre y se atiende lo demás.
                    raw, normalized, met = rest, normalize(rest), given
            fixed = business.answer(raw, business_data, restaurant, participant, tone)
            named = named_products(raw, products)
            from experience_app.services.agent_chat import explicit_add
            if named and explicit_add(raw):
                fixed = None
            requested = [tag for tag, label in VOCABULARY.items() if normalize(label) in normalized]
            excluded = [tag for tag in requested if re.search(
                r'\b(?:sin|evita|no(?: quiero)?(?: nada)?(?: de)?) ' + re.escape(normalize(VOCABULARY[tag])) + r'\b', normalized)]
            prefs = {'etiquetas': [tag for tag in requested if tag not in excluded], 'excluir_etiquetas': excluded}
            if 'barato' in normalized or 'economico' in normalized:
                prefs['presupuesto'] = 'bajo'
            if 'sed' in normalized:
                prefs['categoria'] = next((c for p in products for c in p.get('categorias', []) if 'bebida' in normalize(str(c))), '')
            safe_named = [p for p in named if p.get('agotado') is False]
            if fixed:
                template, route = 'business', 'estado' if 'mi pedido' in normalized else 'negocio'
            elif (given and not met) or (asked_name and service.declines_name(raw)):
                # Respondió al «¿con quién tengo el gusto?»: se le da la bienvenida con lo fuerte de la casa.
                template, chosen, welcome_options = welcome(products, profile_info)
                # Sin repetir el «bienvenido»: con el nombre, «¡Mucho gusto, Ana!»; si no lo quiso dar, directo a lo bueno.
                template, met = ('welcome_named' if template == 'welcome' else template), given or ' '
                can_voice = True
            elif named:
                chosen, template = safe_named[:3], 'menu' if safe_named else 'empty'
            elif GREETING.fullmatch(normalized.strip(' !.?')) and not known_name(account, profile_info) and not asked_name:
                # Como un mesero de verdad: antes de recomendar, pregunta con quién tiene el gusto.
                # Solo la pregunta: los botones de categorías en el saludo distraen (pedido del dueño).
                template = 'ask_name'
            elif GREETING.fullmatch(normalized.strip(' !.?')):
                # Bienvenida del guion de servicio: lo más pedido de la casa y las categorías para explorar.
                template, chosen, welcome_options = welcome(products, profile_info)
                can_voice = True
            elif re.search(r'\b(menu|carta)\b', normalized) or prefs['etiquetas'] or prefs['excluir_etiquetas'] or prefs.get('presupuesto') or prefs.get('categoria'):
                chosen = select(products, prefs, profile_info)
                template = 'menu' if chosen else 'empty'
            else:
                cache_key = fingerprint({'text': normalized, 'state': state.state, 'options': state.options,
                    'selection': state.selection, 'products': products, 'business': business_data,
                    'profile': profile_info, 'evaluator': settings.ASSISTANT_JEV_MODEL, 'prompt': 'asistente_v1'})
                cached = AssistantDecisionCache.objects.filter(restaurant=restaurant, fingerprint=cache_key, expires_at__gt=now).first()
                if cached:
                    answers, source = cached.decision, 'cache'
                    evaluator_version = settings.ASSISTANT_JEV_MODEL
                else:
                    evaluator = JevEvaluator()
                    answers = evaluator.evaluate(json.dumps({'mensaje': raw, 'estado': state.state, 'opciones': state.options,
                                                             'datos_sede': business_data}, ensure_ascii=False), questions_for(state.options, products))
                    measure(evaluator.usage, Decimal('.042'), Decimal(0))
                    evaluator_version = settings.ASSISTANT_JEV_MODEL if settings.TYPESAFE_API_KEY else ''
                    source = 'evaluator' if answers else 'template'
                    if answers is not None:
                        AssistantDecisionCache.objects.update_or_create(restaurant=restaurant, fingerprint=cache_key,
                            defaults={'decision': answers, 'expires_at': now + timedelta(minutes=10)})
                selected_route = choice(answers, 'ruta')
                confidence = (answers or {}).get('ruta', {}).get('confidence')
                commercial = max(noul(answers, 'quiere_' + verb) for verb in ('agregar', 'quitar', 'pagar', 'cancelar'))
                manipulation = noul(answers, 'cambia_reglas') >= .5
                if manipulation or (choice(answers, 'ruta', .90) == 'fuera' and commercial < .2):
                    level = discipline(standing, now, day, manipulation)
                    template = level or 'reminder'
                    if level:
                        notice = {'kind': level, 'until': standing.until.isoformat() if standing.until else None}
                    if manipulation and standing.consecutive == 1:
                        extra = ' ' + TemplateVoice(tone).phrase('reminder', {}) + extra
                    route, chosen = 'fuera', select(products)
                elif selected_route == 'reclamo' or (answers or {}).get('frustracion', {}).get('score', 0) >= 2:
                    template, route = 'human', 'reclamo'
                elif choice(answers, 'ruta') == 'saludo' and not known_name(account, profile_info) and not asked_name:
                    template = 'ask_name'
                elif choice(answers, 'ruta') == 'saludo':
                    template, chosen, welcome_options = welcome(products, profile_info)
                    can_voice = source != 'cache'
                else:
                    dynamic = choice(answers, 'opcion', .9)
                    if dynamic in [o['value'] for o in state.options]:
                        template, chosen = execute({'type': 'option', 'value': dynamic}, state, products)
                        route = 'pedido'
                    else:
                        # Una etiqueta solo filtra recomendaciones, nunca toca dinero: basta una señal clara (calibrado con Jev).
                        prefs = {'etiquetas': [tag for tag in VOCABULARY if noul(answers, tag) >= TAG_THRESHOLD],
                                 'presupuesto': choice(answers, 'presupuesto'), 'categoria': choice(answers, 'categoria') or ''}
                        if prefs['categoria'] == 'ninguna':
                            prefs['categoria'] = ''
                        chosen = select(products, prefs, profile_info)
                        template = 'menu' if answers and chosen else 'clarify' if chosen else 'empty'
                        can_voice = bool(answers) and source != 'cache'
            # Ni un deseo general ni una referencia ambigua autorizan escribir en el carrito.
            from experience_app.services.agent_chat import explicit_add
            add = bool(named and safe_named and len(safe_named) == len(named) and len(named) <= 3 and state.state not in ('esperando_pago', 'pagado') and explicit_add(raw)
                       and not re.search(r'\b(con|sin|extra|extras|doble|quita|quitar|cambia|alergia|alergico)\b', normalized))
            if add:
                route = 'pedido'
                if channel == 'whatsapp':
                    state.selection = [p['id'] for p in chosen]
                    state.revision += 1
                    state.state, template = 'resumen', 'summary'
                if channel == 'whatsapp':
                    remember(restaurant.organization, key, chosen)
            if account and account.allergens and chosen:
                extra += phrases(tone, 'allergy')[0]
                add = False
            if add and channel == 'menu':
                template = 'added'
                # Ya escogió: el mesero sugiere con qué acompañarlo, como pregunta y sin agregarlo solo.
                upsell_key, upsell = service.complements(products, [p['id'] for p in chosen], cart_ids(participant))
                if upsell_key and upsell:
                    extra += ' ' + TemplateVoice(tone).phrase(upsell_key, {'conversation': key})
                else:
                    upsell = []
            if fixed:
                extra = fixed + extra
                template = 'business'
    if route in ('menu', 'pedido', 'negocio', 'estado'):
        standing.consecutive = max(0, standing.consecutive - 1)
        standing.incidents = standing.incidents[1:]
    if template == 'clarify':
        state.question_count = state.question_count + 1 if state.last_question == template else 1
        state.last_question = template
        if state.question_count >= 2:
            template = 'menu'
            chosen = select(products, profile=profile_info)
    else:
        state.question_count, state.last_question = 0, ''
    if template == 'ask_name':
        state.last_question = 'name'
    cards = [card(p) for p in chosen]
    if cards:
        state.cards = cards
        if state.state not in ('resumen', 'esperando_pago', 'pagado'):
            state.state = 'eligiendo'
    options = option_cards(cards) or [{'label': 'Ver menú', 'value': 'menu'}]
    if welcome_options:
        options = welcome_options
    if template == 'ask_name':
        options = []
    if upsell:
        # Las sugerencias entran a las tarjetas del estado para que tocarlas funcione como cualquier opción.
        state.cards = cards + [card(p) for p in upsell]
        options = option_cards([card(p) for p in upsell]) + [{'label': 'Ver menú', 'value': 'menu'}]
    if template in ('summary', 'confirmed'):
        options = [{'label': 'Confirmar selección', 'value': 'confirm'}, {'label': 'Ver menú', 'value': 'menu'}]
    state.options = options
    if template == 'clarify':
        state.state = 'falta_dato'
    state.save()
    standing.save()
    name = known_name(account, profile_info)
    fields = {'greeting': (phrases(tone, 'nice_to_meet')[0].format(name=met) if met.strip() else '') if met else greeting(restaurant, name), 'name': name, 'featured': service.listed(c['name'] for c in cards),
              'favorite': cards[0]['name'] if cards else ''}
    data = {'cards': cards, 'conversation': fingerprint([key, state.state, normalized]), 'text': '', 'message': raw[:300], 'fields': fields}
    voice = OpenAIVoice(catalog=[p['nombre'] for p in products], tone=tone) if can_voice else TemplateVoice(tone)
    voice_key = 'confirmed_menu' if template == 'confirmed' and channel == 'menu' else template
    result_text = voice.phrase(voice_key, data) + extra
    if met.strip() and not template.startswith('welcome'):
        result_text = phrases(tone, 'nice_to_meet')[0].format(name=met) + ' ' + result_text
    if can_voice:
        measure(voice.usage, Decimal('.10'), Decimal('.50'))
        model_version = settings.WA_AGENT_MODEL if settings.OPENAI_API_KEY else ''
        if voice.used:
            source = 'llm'
    if restricted_free:
        result_text = ''
    turn = AssistantTurn.objects.create(restaurant=restaurant, participant=key, channel=channel, route=route,
        source=source, confidence=confidence, evaluator_version=evaluator_version, model_version=model_version,
        input_tokens=usage['input_tokens'], output_tokens=usage['output_tokens'], cost=cost)
    if counted or action is not None:
        from tenancy.usage import record_usage
        module = f'asistente_{channel}'
        detail = {**usage, 'route': route, 'source': source, 'evaluator_version': evaluator_version,
                  'model_version': model_version, 'prompt_version': turn.prompt_version, 'cost': str(cost)}
        if channel == 'menu':
            record_usage(restaurant.organization, restaurant, module, 'mensaje_ia', key=f'asistente:{turn.pk}:mensaje', detail=detail)
        record_usage(restaurant.organization, restaurant, module, 'tokens_ia', sum(usage.values()), key=f'asistente:{turn.pk}:tokens', detail=detail)
    reply = Reply(text=result_text, cards=cards, options=options, state=state.state, notice=notice, route=route, source=source)
    reply.turn_id, reply.usage, reply.add = turn.pk, usage, add
    numbers = {'un': 1, 'una': 1, 'uno': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5, 'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10}
    quantities = re.findall(r'\b(?:[0-9]+|' + '|'.join(numbers) + r')\b', normalized)
    qty = (int(quantities[0]) if quantities[0].isdigit() else numbers[quantities[0]]) if quantities else 1
    if len(quantities) > 1 or (len(cards) > 1 and quantities):
        reply.add = False
    if not 1 <= qty <= 50:
        reply.add = False
        qty = 1
    reply.lines = [{'producto': c['product_id'], 'nombre': c['name'], 'cantidad': qty if add else 1, 'nota': ''} for c in cards]
    return reply
