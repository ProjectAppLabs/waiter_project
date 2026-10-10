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


# Falla si el saludo no pregunta el nombre antes de recomendar (sin botones que distraigan), si tras darlo la bienvenida no lo usa ni ofrece lo fuerte
# de la casa (sin adiciones ni bebidas, una por categoría), si no deja explorar por categorías o si consulta un modelo.
def test_bienvenida_pregunta_el_nombre(carta, monkeypatch, reloj):
    org, local, platos = carta
    monkeypatch.setattr(JevEvaluator, 'evaluate', Mock(side_effect=AssertionError('El saludo no consulta modelos.')))
    for saludo, respuesta_nombre, nombre in (('hola', 'Ana', 'Ana'), ('Buenas noches!', 'soy juan pablo', 'Juan Pablo'),
                                             ('hola, buenas tardes', 'Me llamo María José', 'María José')):
        cliente = f'cliente-{nombre}'
        reloj()
        pregunta = handle('menu', local, cliente, saludo)
        assert '¿Con quién tengo el gusto?' in pregunta['text'] and not pregunta['cards'] and pregunta['options'] == []
        reloj()
        bienvenida = handle('menu', local, cliente, respuesta_nombre)
        assert bienvenida['text'].startswith(f'¡Mucho gusto, {nombre}!') and bienvenida['text'].count('ienvenid') == 0
        nombres = [c['name'] for c in bienvenida['cards']]
        assert nombres and all(n.startswith(('Hamburguesa', 'Pizza')) for n in nombres)
        assert len({n.split()[0] for n in nombres}) == len(nombres)
        reloj()
        otra_vez = handle('menu', local, cliente, 'hola')
        assert nombre in otra_vez['text'] and '¿Con quién' not in otra_vez['text']


# Falla si insistir con el nombre incomoda: quien no lo quiere dar o pide de una vez debe seguir sin que se le pregunte de
# nuevo en esa conversación, y un plato o una preferencia nunca se toman como nombre.
def test_nombre_sin_insistir(carta, reloj):
    org, local, platos = carta
    reloj()
    handle('menu', local, 'reservado', 'hola')
    reloj()
    respuesta = handle('menu', local, 'reservado', 'prefiero no')
    assert respuesta['cards'] and 'Mucho gusto' not in respuesta['text'] and '¿Con quién' not in respuesta['text']
    reloj()
    handle('menu', local, 'afanado', 'hola')
    reloj()
    respuesta = handle('menu', local, 'afanado', 'quiero una pizza margarita')
    assert [c['name'] for c in respuesta['cards']] == ['Pizza margarita']
    productos = catalog_for(local)
    for texto in ('Hamburguesa', 'soy vegetariano', 'sí', 'una limonada de coco', 'quiero algo picante', 'cliente frecuente', '123'):
        assert service.name_from(texto, productos) == '', texto
    assert service.name_from('mi nombre es ANA lucía', productos) == 'Ana Lucía'
    assert service.name_from('¡Soy Camilo!', productos) == 'Camilo'


# Falla si el nombre que dio el cliente no queda en su memoria, no llega a la voz o sobrevive a «Borrar».
def test_el_nombre_es_parte_de_su_memoria(carta, reloj):
    org, local, platos = carta
    from assistant.models import AssistantProfile
    from assistant.profiles import identity, profile_data
    reloj()
    handle('menu', local, 'ana', 'hola')
    reloj()
    handle('menu', local, 'ana', 'Ana')
    clave, _ = identity('menu', 'ana', org)
    perfil = AssistantProfile.objects.get(organization=org, participant=clave)
    assert profile_data(perfil)['name'] == 'Ana'
    assert 'Ana' in prompt_for('paisa', 'Ana') and 'se llama' not in prompt_for('paisa')


# Falla si un cliente que vuelve no recibe su favorito en el saludo, o si tocar una categoría no muestra sus platos.
def test_cliente_que_vuelve_y_categorias(carta):
    org, local, platos = carta
    from assistant.models import AssistantProfile
    from assistant.profiles import identity
    clave, _ = identity('menu', 'ana', org)
    AssistantProfile.objects.create(organization=org, participant=clave, favorites={str(platos['Pizza margarita'].pk): 3})
    AssistantProfile.objects.filter(participant=clave).update(name='Ana')
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
# Falla si las frases de cada tono piden campos desconocidos o mezclan los tratos.
def test_tonos_completos_y_coherentes():
    campos = {'greeting', 'featured', 'favorite', 'name', 'remaining', 'hours', 'address', 'phone', 'state',
              'sede', 'distancia', 'envio', 'metodos', 'policy', 'label', 'url'}
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
    assert 'se llama Ana' in prompt_for('neutro', 'Ana')
    assert TemplateVoice('caleno').phrase('added', {}).startswith('¡Listo, ve!')
    assert TemplateVoice('paisa').phrase('added', {}).startswith('¡De una!')
    datos = {'street': 'Calle 10', 'city': 'Medellín', 'phone': '', 'weekly': {}, 'overrides': []}
    assert answer('dirección', datos, local, None, 'costeno') == 'Estamos en Calle 10, Medellín. ¡Te esperamos!'
    assert answer('dirección', datos, local, None, 'paisa') == 'Estamos en Calle 10, Medellín. ¡Lo esperamos!'
    org.assistant_tone = 'caleno'
    org.save()
    saludo = handle('menu', local, 'beto', 'hola')['text']
    assert '¿Cómo te llamás, ve?' in saludo and 'bien pueda' in saludo, saludo


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


# Falla si una palabra común a una letra de un plato («nuevo» y «huevo») hace que se ofrezca ese plato.
def test_palabras_comunes_no_nombran_platos(carta):
    from assistant.selection import named_products
    org, local, platos = carta
    huevos = Product.objects.create(organization=org, name='Arepa con huevo', kind='dish', price='9000')
    huevos.categories.add(Category.objects.get(organization=org, name='Pizzas'))
    productos = catalog_for(local)
    assert named_products('hola de nuevo', productos) == []
    assert named_products('quiero algo bueno', productos) == []
    assert [p['nombre'] for p in named_products('una arepa con huevo', productos)] == ['Arepa con huevo']


# Falla si el nombre dicho dentro de una frase se pierde, si se toma de más («Gustavo y quiero…») o si el resto del
# mensaje (el domicilio, un plato) se deja sin atender por dar la bienvenida.
def test_nombre_dentro_de_una_frase(carta, reloj):
    org, local, platos = carta
    productos = catalog_for(local)
    assert service.split_name('mi nombre es Gustavo y me gustaría pedir un domicilio', productos) == ('Gustavo', 'me gustaría pedir un domicilio')
    assert service.split_name('Hola, soy Ana María, ¿tienen pizza margarita?', productos) == ('Ana María', '¿tienen pizza margarita?')
    assert service.split_name('me llamo Juan', productos) == ('Juan', '')
    assert service.split_name('soy vegetariano', productos) == ('', 'soy vegetariano')
    assert service.split_name('Pedro', productos) == ('', 'Pedro')
    assert service.split_name('Pedro', productos, asked=True) == ('Pedro', '')
    respuesta = handle('menu', local, 'gustavo', 'mi nombre es Gustavo y quiero una pizza margarita')
    assert respuesta['text'].startswith('¡Mucho gusto, Gustavo!')
    assert [c['name'] for c in respuesta['cards']] == ['Pizza margarita']


# Falla si una forma común de pedir domicilio no se reconoce («¿me lo pueden traer?», «envíenmelo») o si una frase que
# no es de domicilio («traer la carta», «llevar la cuenta») se toma como domicilio.
@pytest.mark.parametrize('texto, es', [('¿me lo pueden traer?', True), ('hacen domicilios?', True), ('envíenmelo', True),
                                       ('que me lo traigan', True), ('lo quiero a mi casa', True), ('¿hacen envíos?', True),
                                       ('¿llevan a Laureles?', True), ('quiero una hamburguesa', False), ('traer la carta', False),
                                       ('me gusta llevar la cuenta', False)])
# Falla si una frase de domicilio no se reconoce o una que no lo es se toma como domicilio.
def test_frases_de_domicilio(texto, es):
    assert service.wants_delivery(texto) is es


# Falla si tocar una categoría en el chat (su nombre exacto) no muestra sus platos.
def test_nombre_de_categoria_muestra_sus_platos(carta, reloj):
    org, local, platos = carta
    respuesta = handle('menu', local, 'cata', 'Postres')
    assert [c['name'] for c in respuesta['cards']] == ['Brownie']
