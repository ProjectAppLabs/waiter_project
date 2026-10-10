import string
from unittest.mock import Mock

import pytest

from assistant import service, tones
from assistant.business import answer
from assistant.engine import handle
from assistant.evaluator import JevEvaluator
from assistant.selection import catalog_for, select
from assistant.voice import TemplateVoice, prompt_for
from catalog.models import Category, Product
from tenancy.models import OrganizationAudit

pytestmark = pytest.mark.django_db
BASE = '/api/pos/v1/assistant'


@pytest.fixture
def carta(entorno, settings):
    """Una carta con los cuatro papeles del guion: fuertes, bebidas, postres y adiciones."""
    settings.OPENAI_API_KEY = settings.TYPESAFE_API_KEY = ''
    org, local, *_ = entorno
    Product.objects.filter(organization=org).delete()
    platos = {}
    for categoria, nombres in (('Hamburguesas', ['Hamburguesa Clásica', 'Hamburguesa Angus']), ('Pizzas', ['Pizza margarita']),
                               ('Bebidas', ['Limonada de Coco', 'Club Colombia']), ('Postres', ['Brownie']),
                               ('Adiciones', ['Adición de tocineta', 'Adición de queso'])):
        grupo = Category.objects.create(organization=org, name=categoria)
        for nombre in nombres:
            platos[nombre] = Product.objects.create(organization=org, name=nombre, kind='dish', price='10000')
            platos[nombre].categories.add(grupo)
    return org, local, platos


# Falla si el saludo abre ofreciendo adiciones o bebidas en vez de lo fuerte de la casa, si repite categoría entre los
# destacados, si no ofrece las categorías para explorar o si consulta un modelo para saludar.
def test_bienvenida_con_lo_fuerte_de_la_casa(carta, monkeypatch):
    org, local, platos = carta
    monkeypatch.setattr(JevEvaluator, 'evaluate', Mock(side_effect=AssertionError('El saludo no consulta modelos.')))
    for saludo in ('hola', 'Buenas noches!', 'hola, buenas tardes', 'qué más'):
        respuesta = handle('menu', local, f'cliente-{saludo}', saludo)
        nombres = [c['name'] for c in respuesta['cards']]
        assert nombres and all(n.startswith(('Hamburguesa', 'Pizza')) for n in nombres), saludo
        assert len({n.split()[0] for n in nombres}) == len(nombres)
        assert [o['label'] for o in respuesta['options']] == ['Hamburguesas', 'Pizzas', 'Postres']
        assert 'Bienvenido' in respuesta['text'] or 'gusto' in respuesta['text']


# Falla si un cliente que vuelve no recibe su favorito en el saludo, o si tocar una categoría no muestra sus platos.
def test_cliente_que_vuelve_y_categorias(carta):
    org, local, platos = carta
    from assistant.models import AssistantProfile
    from assistant.profiles import identity
    clave, _ = identity('menu', 'ana', org)
    AssistantProfile.objects.create(organization=org, participant=clave, favorites={str(platos['Pizza margarita'].pk): 3})
    respuesta = handle('menu', local, 'ana', 'hola')
    assert [c['name'] for c in respuesta['cards']] == ['Pizza margarita']
    assert 'de vuelta' in respuesta['text'] and 'Pizza margarita' in respuesta['text']
    respuesta = handle('menu', local, 'ana', action={'type': 'option', 'value': 'cat:Postres'})
    assert [c['name'] for c in respuesta['cards']] == ['Brownie']


# Falla si una recomendación general ofrece adiciones, o si pedirlas expresamente ya no las muestra.
def test_adiciones_solo_si_las_piden(carta, entorno):
    org, local, platos = carta
    productos = catalog_for(local)
    assert not any(p['nombre'].startswith('Adición') for p in select(productos))
    assert {p['nombre'] for p in select(productos, {'categoria': 'Adiciones'})} == {'Adición de tocineta', 'Adición de queso'}


# Falla si al agregar un plato fuerte no se sugiere algo de tomar, si con bebida no se pasa a las adiciones, o si la
# sugerencia se agrega sola al pedido.
def test_acompanamiento_despues_de_escoger(carta):
    org, local, platos = carta
    productos = catalog_for(local)
    clave, sugeridos = service.complements(productos, [platos['Hamburguesa Angus'].pk])
    assert clave == 'upsell_drink' and {p['nombre'] for p in sugeridos} == {'Limonada de Coco', 'Club Colombia'}
    clave, sugeridos = service.complements(productos, [platos['Hamburguesa Angus'].pk], [platos['Club Colombia'].pk])
    assert clave == 'upsell_extra' and all(p['nombre'].startswith('Adición') for p in sugeridos)
    assert service.complements(productos, [platos['Limonada de Coco'].pk]) == (None, [])
    respuesta = handle('menu', local, 'ana', 'agrégame una hamburguesa angus')
    assert respuesta.add and [line['nombre'] for line in respuesta.lines] == ['Hamburguesa Angus']
    assert 'algo de tomar' in respuesta['text']
    assert [o['label'] for o in respuesta['options']] == ['Limonada de Coco', 'Club Colombia', 'Ver menú']


# Falla si a un tono le falta una frase, si una frase pide un dato que el núcleo no manda, o si el tuteo, el voseo o el
# usted se mezclan dentro de un mismo tono.
def test_tonos_completos_y_coherentes():
    campos = {'greeting', 'featured', 'favorite', 'name', 'remaining', 'hours', 'address', 'phone', 'state'}
    for clave, tono in tones.TONES.items():
        for frase_clave in tones.USTED:
            for frase in tones.phrases(clave, frase_clave):
                pedidos = {f for _, f, _, _ in string.Formatter().parse(frase) if f}
                assert pedidos <= campos, (clave, frase_clave, pedidos)
        texto = ' '.join(f for k in tones.USTED for f in tones.phrases(clave, k)).lower()
        if tono['trato'] == 'usted':
            assert ' te ' not in f' {texto} ' and 'puedes' not in texto, clave
        if tono['trato'] == 'tú':
            assert 'puede seguir' not in texto and 'querés' not in texto, clave
        if tono['trato'] == 'vos':
            assert 'podés' in texto and 'puedes' not in texto, clave


# Falla si el tono escogido no cambia lo que dicen la voz, las plantillas y las respuestas del negocio.
def test_el_tono_cambia_la_forma_de_hablar(carta):
    org, local, platos = carta
    assert 'paisa amable' in prompt_for('paisa') and 'voseo' in prompt_for('caleno') and 'usted' in prompt_for('rolo')
    assert 'Ana' in prompt_for('neutro', 'Ana')
    assert TemplateVoice('caleno').phrase('added', {}).startswith('¡Listo, ve!')
    assert TemplateVoice('paisa').phrase('added', {}).startswith('¡De una!')
    datos = {'street': 'Calle 10', 'city': 'Medellín', 'phone': '', 'weekly': {}, 'overrides': []}
    assert answer('dirección', datos, local, None, 'costeno') == 'Estamos en Calle 10, Medellín. ¡Te esperamos!'
    assert answer('dirección', datos, local, None, 'paisa') == 'Estamos en Calle 10, Medellín. ¡Lo esperamos!'
    org.assistant_tone = 'caleno'
    org.save()
    saludo = handle('menu', local, 'beto', 'hola')['text']
    assert 'bien pueda' in saludo or ', ve!' in saludo, saludo


# Falla si el dueño no ve el tono ni sus opciones, si puede escoger uno que no existe, si el cambio no queda en el
# historial o si otra persona del equipo puede cambiarlo.
def test_el_duenio_escoge_el_tono(entorno):
    org, _, _, cliente, _, _ = entorno
    estado = cliente.get(BASE + '/status').json()
    assert estado['tone'] == 'neutro'
    assert {t['key'] for t in estado['tones']} == set(tones.TONES)
    assert all(t['sample'] and t['trato'] in ('usted', 'tú', 'vos') for t in estado['tones'])
    assert cliente.patch(BASE + '/settings', {'tone': 'pirata'}, format='json').status_code == 400
    assert cliente.patch(BASE + '/settings', {'tone': 'paisa'}, format='json').json() == {'tone': 'paisa'}
    org.refresh_from_db()
    assert org.assistant_tone == 'paisa'
    assert OrganizationAudit.objects.filter(organization=org, entity='tenancy.organization').exists()
    from tenancy.tests.helpers import account, pos_client
    mesero = pos_client(account(org, role='waiter', username='mesero'))
    assert mesero.patch(BASE + '/settings', {'tone': 'rolo'}, format='json').status_code == 403


# Falla si pedir algo «para compartir» no encuentra la categoría con ese nombre cuando nadie tiene la etiqueta revisada,
# o si con la etiqueta revisada se ignora la etiqueta.
def test_etiqueta_que_es_categoria(carta):
    org, local, platos = carta
    grupo = Category.objects.create(organization=org, name='Para compartir')
    papas = Product.objects.create(organization=org, name='Papas Trufadas', kind='dish', price='8900')
    papas.categories.add(grupo)
    assert [p['nombre'] for p in select(catalog_for(local), {'etiquetas': ['para_compartir']})] == ['Papas Trufadas']
    pizza = platos['Pizza margarita']
    pizza.diner_attributes = {'etiquetas': ['para_compartir'], 'etiquetas_revisadas': True}
    pizza.save()
    assert [p['nombre'] for p in select(catalog_for(local), {'etiquetas': ['para_compartir']})] == ['Pizza margarita']
