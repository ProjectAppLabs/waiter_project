"""Planificador acotado sin estado: no escribe al POS ni envía mensajes al cliente."""
import json
from copy import deepcopy
from pathlib import Path

import requests
from assistant.voice import model_options
from django.conf import settings

PROMPT = (Path(__file__).resolve().parents[1] / 'prompts' / 'waiter_v1.txt').read_text()
QUESTIONS = {
    'gustos': '¿De qué tienes ganas hoy?',
    'producto': '¿Qué plato te gustaría pedir?',
    'cantidad': '¿Cuántas unidades quieres?',
    'preferencia': '¿Cuál de estas opciones prefieres?',
}
SCHEMA = {
    'type': 'object', 'additionalProperties': False,
    'properties': {
        'opciones': {'type': 'array', 'maxItems': 4, 'items': {'type': 'string', 'minLength': 1, 'maxLength': 60}},
        'respuesta': {'type': 'string', 'minLength': 1, 'maxLength': 600},
        'accion': {'type': 'string', 'enum': ['preguntar', 'recomendar', 'cotizar', 'agregar', 'humano']},
        'pregunta': {'type': 'string', 'enum': ['ninguna', *QUESTIONS]},
        'lineas': {'type': 'array', 'maxItems': 30, 'items': {
            'type': 'object', 'additionalProperties': False,
            'properties': {'nota': {'type': 'string', 'maxLength': 200}, 'producto': {'type': 'integer', 'minimum': 1},
                           'cantidad': {'type': 'integer', 'minimum': 1, 'maximum': 50}},
            'required': ['producto', 'cantidad', 'nota'],
        }},
    },
    'required': ['accion', 'pregunta', 'lineas', 'respuesta', 'opciones'],
}


class AgentUnavailable(Exception):
    """Error seguro: no incluye cuerpos del proveedor, cabeceras ni texto del cliente."""


def validate_plan(plan, products):
    if not isinstance(plan, dict) or not {'accion', 'pregunta', 'lineas'} <= set(plan) or set(plan) - {'accion', 'pregunta', 'lineas', 'respuesta', 'opciones'}:
        raise ValueError('Propuesta inválida.')
    if 'respuesta' in plan and (not isinstance(plan['respuesta'], str) or not 1 <= len(plan['respuesta'].strip()) <= 600):
        raise ValueError('Respuesta inválida.')
    choices = plan.get('opciones', [])
    if not isinstance(choices, list) or len(choices) > 4 or any(not isinstance(c, str) or not 1 <= len(c.strip()) <= 60 for c in choices):
        raise ValueError('Opciones inválidas.')
    if choices and plan['accion'] != 'preguntar':
        raise ValueError('Opciones fuera de una pregunta.')
    action, question, lines = plan['accion'], plan['pregunta'], plan['lineas']
    if action not in ('preguntar', 'recomendar', 'cotizar', 'agregar', 'humano'):
        raise ValueError('Acción no permitida.')
    if question not in ('ninguna', *QUESTIONS) or not isinstance(lines, list) or len(lines) > 30:
        raise ValueError('Propuesta inválida.')
    if action == 'preguntar':
        if question == 'ninguna' or lines:
            raise ValueError('Pregunta inválida.')
    elif question != 'ninguna':
        raise ValueError('Pregunta inesperada.')
    if action == 'humano' and lines:
        raise ValueError('Intervención con productos inesperados.')
    if action in ('recomendar', 'cotizar', 'agregar') and not lines:
        raise ValueError('Faltan productos.')
    if action == 'recomendar' and len(lines) > 6:
        raise ValueError('Demasiadas recomendaciones.')
    available = {p['id'] for p in products if p.get('agotado') is False}
    seen = set()
    for line in lines:
        if not isinstance(line, dict) or not {'producto', 'cantidad'} <= set(line) or set(line) - {'producto', 'cantidad', 'nota'}:
            raise ValueError('Campos no permitidos.')
        if not isinstance(line.get('nota', ''), str) or len(line.get('nota', '')) > 200:
            raise ValueError('Nota inválida.')
        pid, qty = line['producto'], line['cantidad']
        if type(pid) is not int or type(qty) is not int or not 1 <= qty <= 50:
            raise ValueError('Producto o cantidad inválidos.')
        if pid not in available or pid in seen:
            raise ValueError('Producto no disponible o repetido.')
        seen.add(pid)
    return plan


class ModelPlan(dict):
    """Plan público con medición interna que no se serializa al comensal."""
    usage = None


def propose(message, products, *, history=None):
    """Los productos provienen del catálogo de la organización, nunca del cliente."""
    if not settings.OPENAI_API_KEY or not settings.WA_AGENT_MODEL:
        raise AgentUnavailable('Configura OPENAI_API_KEY y WA_AGENT_MODEL en el servidor.')
    if not isinstance(message, str) or not message.strip() or len(message) > 4000:
        raise ValueError('El mensaje debe tener entre 1 y 4000 caracteres.')
    # Solo campos permitidos: sin credenciales, identidad del cliente ni metadatos arbitrarios.
    catalog = [{k: p[k] for k in ('id', 'nombre', 'agotado', 'descripcion', 'ingredientes', 'precio', 'categorias') if k in p}
               for p in products]
    context = json.dumps({'mensaje': message, 'catalogo': catalog, 'historial': (history or [])[-12:]}, ensure_ascii=False)
    if len(catalog) > 200 or len(context) > 60000:
        raise ValueError('Catálogo demasiado grande: requiere selección previa.')
    schema = deepcopy(SCHEMA)
    if history and history[-1].get('opciones'):
        # Una pregunta de filtro, luego alternativas concretas para evitar bucles de preguntas.
        schema['properties']['accion']['enum'].remove('preguntar')
        schema['properties']['pregunta']['enum'] = ['ninguna']
        schema['properties']['opciones']['maxItems'] = 0
    try:
        response = requests.post(
            'https://api.openai.com/v1/responses',
            headers={'Authorization': f'Bearer {settings.OPENAI_API_KEY}'},
            json={'model': settings.WA_AGENT_MODEL, 'store': False, 'max_output_tokens': 1600, **model_options(),
                  'input': [{'role': 'developer', 'content': PROMPT},
                            {'role': 'user', 'content': context}],
                  'text': {'format': {'type': 'json_schema', 'name': 'waiter_plan',
                                      'strict': True, 'schema': schema}}},
            timeout=(5, 30), allow_redirects=False,
        )
        if response.status_code != 200:
            raise AgentUnavailable('El agente no está disponible; intenta más tarde.')
        payload = response.json()
        if payload.get('status') != 'completed':
            raise ValueError('Respuesta incompleta.')
        output = payload.get('output', [])
        if any(item.get('type') != 'message' for item in output if item.get('type') != 'reasoning'):
            raise ValueError('Salida inesperada.')
        content = [part for item in output if item.get('type') == 'message'
                   for part in item.get('content', [])]
        if len(content) != 1 or content[0].get('type') != 'output_text':
            raise ValueError('Respuesta rechazada o inválida.')
        plan = ModelPlan(validate_plan(json.loads(content[0]['text']), catalog))
        plan.usage = payload.get('usage') or {}
        plan.versions = {'model': settings.WA_AGENT_MODEL, 'prompt': 'waiter_v1'}
        return plan
    except (requests.RequestException, ValueError, TypeError, KeyError, AttributeError):
        raise AgentUnavailable('No se pudo obtener una propuesta válida. Requiere atención humana.') from None
