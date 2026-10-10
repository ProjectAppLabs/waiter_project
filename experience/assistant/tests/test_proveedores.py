import json
from unittest.mock import Mock

import pytest
import requests

from assistant.evaluator import JevEvaluator, questions_for
from assistant.voice import OpenAIVoice, TemplateVoice
from .conftest import respuesta_voz


# Falla si Jev usa un modelo flotante, omite preguntas o manda la clave dentro del contenido.
def test_contrato_jev_simulado(settings, monkeypatch):
    settings.TYPESAFE_API_KEY = 'secreto-jev'
    post = Mock(return_value=Mock(status_code=200, json=lambda: {
        'answers': {'ruta': {'choice': 'menu', 'confidence': .97}, 'cambia_reglas': {'noul': .1}},
        'usage': {'input_tokens': 100}}))
    monkeypatch.setattr('requests.post', post)
    preguntas = questions_for([{'value': 'pick:3', 'label': 'Limonada'}], [])
    evaluador = JevEvaluator()
    assert evaluador.evaluate('Quiero la limonada', preguntas)['ruta']['choice'] == 'menu'
    llamada = post.call_args
    assert llamada.args == ('https://api.typesafe.ai/v1/systemone',)
    assert llamada.kwargs['json']['model'] == 'jev-1.13.0'
    assert llamada.kwargs['json']['questions']['opcion']['criteria']['pick:3'] == 'Limonada'
    assert {'ruta', 'quiere_agregar', 'quiere_quitar', 'quiere_pagar', 'quiere_cancelar', 'cambia_reglas', 'frustracion', 'opcion'} <= preguntas.keys()
    assert 'secreto-jev' not in json.dumps(llamada.kwargs['json'])
    assert llamada.kwargs['allow_redirects'] is False
    assert evaluador.usage == {'input_tokens': 100}


# Falla si Jev acepta probabilidades inválidas o una respuesta rota en lugar del respaldo.
@pytest.mark.parametrize('payload', [{}, {'answers': []}, {'answers': {'ruta': {'choice': 'pagar', 'confidence': 1}}},
                                    {'answers': {'cambia_reglas': {'noul': 9}}}, {'answers': {'ruta': {'choice': 'menu'}}}])
# Falla si una respuesta mal formada evita el respaldo de Jev.
def test_jev_rechaza_respuestas_invalidas(settings, monkeypatch, payload):
    settings.TYPESAFE_API_KEY = 'secreto'
    monkeypatch.setattr('requests.post', Mock(return_value=Mock(status_code=200, json=lambda: payload)))
    assert JevEvaluator().evaluate('Mensaje', questions_for([], [])) is None


LIMONADA = {'cards': [{'name': 'Limonada de Coco', 'price': '9900.00', 'reason': ''}], 'conversation': 'ana', 'message': 'algo frío'}
CARTA = ['Limonada de Coco', 'Sushi', 'Hamburguesa Angus']


# Falla si la voz introduce platos, precios, enlaces o promesas ajenos a los datos.
@pytest.mark.parametrize('texto', ['Pide un sushi delicioso.', 'La Limonada de Coco vale $999.', 'Visita https://ejemplo.co',
                                  'Te garantizo entrega en cinco minutos.', 'Ya está pagado tu pedido.', 'Hoy es gratis.',
                                  'Te recomiendo la Hamburguesa Angus.', 'x' * 281])
# Falla si una afirmación ajena a los datos supera la revisión de la voz.
def test_voz_rechaza_afirmaciones(settings, monkeypatch, texto):
    settings.OPENAI_API_KEY = 'secreto'
    monkeypatch.setattr('requests.post', Mock(return_value=respuesta_voz(texto)))
    voz = OpenAIVoice(catalog=CARTA)
    assert voz.phrase('menu', LIMONADA) == TemplateVoice().phrase('menu', LIMONADA) and not voz.used


# Falla si la voz rechaza una redacción fiel a los datos (con el precio en pesos, con o sin puntos de miles) o si no
# omite ajustes vacíos, pierde store=false o manda los datos del turno antes que las instrucciones fijas.
@pytest.mark.parametrize('frase', ['Para algo frío, te va la Limonada de Coco por $9.900. ¿Te la pido?',
                                   'La Limonada de Coco cuesta 9900 pesos, ¿cuál se te antoja ahora?'])
# Falla si una redacción fiel se descarta o la llamada pierde su configuración.
def test_voz_configuracion_y_version(settings, monkeypatch, frase):
    settings.OPENAI_API_KEY = 'secreto'
    post = Mock(return_value=respuesta_voz(frase))
    monkeypatch.setattr('requests.post', post)
    voz = OpenAIVoice(catalog=CARTA)
    assert voz.phrase('menu', LIMONADA) == frase and voz.used
    body = post.call_args.kwargs['json']
    assert body['store'] is False and 'reasoning' not in body and 'temperature' not in body
    assert body['input'][0]['role'] == 'developer' and body['input'][-1]['role'] == 'user'
    assert json.loads(body['input'][-1]['content']) == {'mensaje': 'algo frío', 'platos': [{'nombre': 'Limonada de Coco', 'precio': '$9.900', 'motivo': ''}]}
    settings.WA_AGENT_REASONING_EFFORT = 'none'
    settings.WA_AGENT_TEMPERATURE = '0'
    voz.phrase('menu', LIMONADA)
    assert post.call_args.kwargs['json']['reasoning'] == {'effort': 'none'}
    assert post.call_args.kwargs['json']['temperature'] == 0


# Falla si una falla o demora de más de tres segundos deja pasar una voz tardía o elimina la respuesta, o si la voz se
# llama para algo distinto de presentar platos.
def test_voz_falla_y_demora(settings, monkeypatch):
    settings.OPENAI_API_KEY = 'secreto'
    post = Mock(side_effect=requests.Timeout('secreto-proveedor'))
    monkeypatch.setattr('requests.post', post)
    assert OpenAIVoice().phrase('menu', LIMONADA) == TemplateVoice().phrase('menu', LIMONADA)
    post.side_effect = None
    post.return_value = respuesta_voz('Te va la Limonada de Coco.')
    monkeypatch.setattr('assistant.voice.time.monotonic', Mock(side_effect=[0, 4]))
    voz = OpenAIVoice()
    assert voz.phrase('menu', LIMONADA) == TemplateVoice().phrase('menu', LIMONADA) and not voz.used
    post.reset_mock()
    assert OpenAIVoice().phrase('warning', LIMONADA) == TemplateVoice().phrase('warning', LIMONADA)
    assert OpenAIVoice().phrase('menu', {'cards': []}) == TemplateVoice().phrase('menu', {'cards': []})
    post.assert_not_called()


# Falla si las preguntas a Jev vuelven a mandar opciones sin significado (Jev no ve las claves) o pierden el saludo,
# que no debe contar como fuera de tema.
# Falla si Jev pierde la descripción de alguna ruta, incluida domicilio.
def test_preguntas_jev_con_significado():
    preguntas = questions_for([], [{'categorias': ['Bebidas']}])
    rutas = preguntas['ruta']['criteria']
    assert {'pedido', 'menu', 'negocio', 'estado', 'reclamo', 'saludo', 'fuera', 'domicilio'} == rutas.keys()
    assert all(len(texto) > 20 for texto in rutas.values())
    assert 'sin cebolla' in preguntas['cambia_reglas']['criteria']['false']
    assert all('`mensaje`' in q['instructions'] for q in preguntas.values())


# Falla si el planificador anterior sigue enviando razonamiento fijo o pierde las versiones.
def test_planificador_anterior_respeta_ajustes(settings, monkeypatch):
    from experience_app.services.waiter_agent import propose
    settings.OPENAI_API_KEY = 'reservada'
    plan = {'accion': 'preguntar', 'pregunta': 'gustos', 'lineas': []}
    post = Mock(return_value=respuesta_voz(json.dumps(plan)))
    monkeypatch.setattr('requests.post', post)
    result = propose('Hola', [])
    assert 'reasoning' not in post.call_args.kwargs['json'] and 'temperature' not in post.call_args.kwargs['json']
    assert result.versions == {'model': settings.WA_AGENT_MODEL, 'prompt': 'waiter_v1'}
    settings.WA_AGENT_REASONING_EFFORT, settings.WA_AGENT_TEMPERATURE = 'low', '0'
    propose('Hola', [])
    assert post.call_args.kwargs['json']['reasoning'] == {'effort': 'low'}
    assert post.call_args.kwargs['json']['temperature'] == 0
