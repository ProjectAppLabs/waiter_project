"""Tonos regionales del mesero virtual: el dueño escoge cómo habla su asistente.

Cada tono define el trato (usted, tú o vos), el estilo que se le pide a la voz y las frases de plantilla que se usan sin
modelo. Las expresiones se usan con moderación y sin caricatura: nada de groserías ni jerga callejera con clientes.
Fuentes de cada habla en el plan AS, «Tonos regionales».
"""

DEFAULT = 'neutro'

# Frases base por trato. Cada tono hereda las de su trato y reemplaza las que tienen sabor propio.
USTED = {
    'delivery_quote': ['Con gusto, lo atendemos desde {sede}, a {distancia} km. El envío cuesta $ {envio}; puede pagar con {metodos}.'],
    'delivery_out': ['Lo sentimos, todavía no llegamos a esa ubicación. Con gusto podemos preparar su pedido para recoger.'],
    'delivery_off': ['Para confirmar si llegamos hasta allá y cuánto vale el domicilio, comuníquese con el restaurante{phone}.'],
    'delivery_ask': ['Con gusto llevamos su pedido. Comparta su ubicación para revisar la cobertura y el envío.'],
    'delivery_consent': ['¿Nos autoriza a guardar su dirección para próximos pedidos? Política de datos: {policy}.'],
    'delivery_saved': ['¿Se lo enviamos a {label} ({address})?'],
    'delivery_link': ['Si es para otra persona, use este enlace: Ubica la entrega · {url}'],
    'delivery_continue': ['Puede escoger sus platos y terminar el pedido aquí: {url}'],
    'delivery_accept': ['Acepto'],
    'delivery_use': ['Usar esta dirección'],
    'delivery_method_online': ['pago en línea'],
    'delivery_method_cash': ['efectivo contra entrega'],
    'delivery_method_card_on_delivery': ['datáfono contra entrega'],

    'ask_name': ['{greeting} Bienvenido, soy su mesero virtual y lo voy a acompañar hoy. ¿Con quién tengo el gusto?'],
    'nice_to_meet': ['¡Mucho gusto, {name}!'],
    'welcome_named': ['{greeting} Le cuento lo que más piden hoy: {featured}. ¿Qué le gustaría?'],
    'welcome': ['{greeting} Bienvenido. Le cuento lo que más piden hoy: {featured}. ¿Qué le gustaría?',
                '{greeting} Qué gusto atenderlo. Hoy le recomiendo {featured}. ¿Por dónde quiere empezar?'],
    'welcome_back': ['{greeting} Qué alegría tenerlo de vuelta. ¿Le provoca {favorite} como la otra vez, o le muestro algo nuevo?'],
    'menu': ['Le tengo estas opciones. ¿Cuál le provoca?', 'Mire estas opciones del menú. ¿Cuál se le antoja?'],
    'clarify': ['Cuénteme un poquito más. También puede tocar una de estas opciones.',
                '¿Qué se le antoja hoy? Aquí le dejo algunas opciones del menú.'],
    'empty': ['No encontré platos disponibles con eso que me pide. Miremos otras opciones.'],
    'reminder': ['Con gusto le ayudo con el menú, su pedido y el restaurante. ¿Qué se le antoja hoy?'],
    'warning': ['Le cuento que este chat es para pedidos y preguntas del restaurante. Si seguimos en otros temas, por un rato solo podré mostrarle el menú con botones.'],
    'restricted': ['Por los próximos 30 minutos le muestro el menú con botones. Puede seguir escogiendo sus platos.'],
    'paused': ['Pausamos el asistente por hoy. Si quiere pedir, el restaurante lo atiende directamente con gusto.'],
    'quota': ['Llegamos al cupo de mensajes de hoy. Puede seguir mirando el menú con los botones.'],
    'remaining': [' Le quedan {remaining} mensajes con el asistente por hoy.'],
    'size': ['Cuénteme lo que necesita en un mensaje de hasta 1.000 caracteres, por favor.'],
    'pace': ['Estoy juntando sus mensajes. Ya mismo puede seguir.'],
    'repeat': ['Ya tengo su mensaje. Puede seguir con estas opciones del menú.'],
    'human': ['Qué pena con usted. El equipo del restaurante le ayuda con esto; puede pedir atención desde el menú.'],
    'summary': ['Esta es su selección. Revísela antes de seguir.'],
    'confirmed_menu': ['Listo, su selección está resumida. Puede agregar los platos desde sus tarjetas y revisar Mi pedido.'],
    'confirmed': ['Listo, su selección está resumida. Para terminar el pedido por WhatsApp, comuníquese con el restaurante.'],
    'invalid_action': ['Esa opción ya no está disponible en este paso. Revise las opciones de ahora.'],
    'added': ['¡Listo! Ya le agregué eso a Mi pedido. Allá lo puede revisar antes de mandarlo a cocina.'],
    'upsell_drink': ['¿Le gustaría acompañarlo con algo de tomar? Le tengo estas opciones.'],
    'upsell_extra': ['¿Le gustaría probarlo con alguna adición? Le tengo estas opciones.'],
    'allergy': [' Como tiene alergias registradas, confirme los ingredientes con el equipo antes de pedir, por favor.'],
    'hours': ['Hoy lo atendemos de {hours}. ¡Lo esperamos!'],
    'hours_none': ['Qué pena, no tengo un horario publicado para hoy. Puede consultarlo con el restaurante.'],
    'address': ['Estamos en {address}. ¡Lo esperamos!'],
    'address_none': ['Qué pena, no tengo la dirección publicada. Puede consultarla con el restaurante.'],
    'delivery': ['Para confirmar si llegamos hasta allá y cuánto vale el domicilio, comuníquese con el restaurante{phone}.'],
    'order_state': ['Su pedido está {state}.'],
    'order_unknown': ['Puede consultar cómo va su pedido directamente con el restaurante.'],
    'not_in_cards': ['Este plato no está entre las recomendaciones de ahora.'],
    'needs_options': ['Este plato tiene opciones para escoger. Abra su ficha para elegirlas.'],
    'use_buttons': ['Para agregarlos, use los botones de cada plato.'],
}
TU = {
    **USTED,
    'delivery_quote': ['Con gusto, te atendemos desde {sede}, a {distancia} km. El envío cuesta $ {envio}; puedes pagar con {metodos}.'],
    'delivery_out': ['Lo sentimos, todavía no llegamos a esa ubicación. Con gusto podemos preparar tu pedido para recoger.'],
    'delivery_off': ['Para confirmar si llegamos hasta allá y cuánto vale el domicilio, comunícate con el restaurante{phone}.'],
    'delivery_ask': ['Con gusto llevamos tu pedido. Comparte tu ubicación para revisar la cobertura y el envío.'],
    'delivery_consent': ['¿Nos autoriza a guardar tu dirección para próximos pedidos? Política de datos: {policy}.'],
    'delivery_saved': ['¿Te lo enviamos a {label} ({address})?'],
    'delivery_link': ['Si es para otra persona, usa este enlace: Ubica la entrega · {url}'],
    'delivery_continue': ['Puedes escoger sus platos y terminar el pedido aquí: {url}'],
    'delivery_accept': ['Acepto'],
    'delivery_use': ['Usar esta dirección'],
    'delivery_method_online': ['pago en línea'],
    'delivery_method_cash': ['efectivo contra entrega'],
    'delivery_method_card_on_delivery': ['datáfono contra entrega'],

    'ask_name': ['{greeting} Bienvenido, soy tu mesero virtual y te voy a acompañar hoy. ¿Cómo te llamas?'],
    'welcome_named': ['{greeting} Te cuento lo que más piden hoy: {featured}. ¿Qué te gustaría?'],
    'welcome': ['{greeting} Bienvenido. Te cuento lo que más piden hoy: {featured}. ¿Qué te gustaría?',
                '{greeting} Qué gusto atenderte. Hoy te recomiendo {featured}. ¿Por dónde quieres empezar?'],
    'welcome_back': ['{greeting} Qué alegría tenerte de vuelta. ¿Te provoca {favorite} como la otra vez, o te muestro algo nuevo?'],
    'menu': ['Te tengo estas opciones. ¿Cuál te provoca?', 'Mira estas opciones del menú. ¿Cuál se te antoja?'],
    'clarify': ['Cuéntame un poquito más. También puedes tocar una de estas opciones.',
                '¿Qué se te antoja hoy? Aquí te dejo algunas opciones del menú.'],
    'empty': ['No encontré platos disponibles con eso que me pides. Miremos otras opciones.'],
    'reminder': ['Con gusto te ayudo con el menú, tu pedido y el restaurante. ¿Qué se te antoja hoy?'],
    'warning': ['Te cuento que este chat es para pedidos y preguntas del restaurante. Si seguimos en otros temas, por un rato solo podré mostrarte el menú con botones.'],
    'restricted': ['Por los próximos 30 minutos te muestro el menú con botones. Puedes seguir escogiendo tus platos.'],
    'paused': ['Pausamos el asistente por hoy. Si quieres pedir, el restaurante te atiende directamente con gusto.'],
    'quota': ['Llegamos al cupo de mensajes de hoy. Puedes seguir mirando el menú con los botones.'],
    'remaining': [' Te quedan {remaining} mensajes con el asistente por hoy.'],
    'size': ['Cuéntame lo que necesitas en un mensaje de hasta 1.000 caracteres, por favor.'],
    'pace': ['Estoy juntando tus mensajes. Ya mismo puedes seguir.'],
    'repeat': ['Ya tengo tu mensaje. Puedes seguir con estas opciones del menú.'],
    'human': ['Qué pena contigo. El equipo del restaurante te ayuda con esto; puedes pedir atención desde el menú.'],
    'summary': ['Esta es tu selección. Revísala antes de seguir.'],
    'confirmed_menu': ['Listo, tu selección está resumida. Puedes agregar los platos desde sus tarjetas y revisar Mi pedido.'],
    'confirmed': ['Listo, tu selección está resumida. Para terminar el pedido por WhatsApp, comunícate con el restaurante.'],
    'invalid_action': ['Esa opción ya no está disponible en este paso. Revisa las opciones de ahora.'],
    'added': ['¡Listo! Ya te agregué eso a Mi pedido. Allá lo puedes revisar antes de mandarlo a cocina.'],
    'upsell_drink': ['¿Te gustaría acompañarlo con algo de tomar? Te tengo estas opciones.'],
    'upsell_extra': ['¿Te gustaría probarlo con alguna adición? Te tengo estas opciones.'],
    'allergy': [' Como tienes alergias registradas, confirma los ingredientes con el equipo antes de pedir, por favor.'],
    'hours': ['Hoy te atendemos de {hours}. ¡Te esperamos!'],
    'hours_none': ['Qué pena, no tengo un horario publicado para hoy. Puedes consultarlo con el restaurante.'],
    'address': ['Estamos en {address}. ¡Te esperamos!'],
    'address_none': ['Qué pena, no tengo la dirección publicada. Puedes consultarla con el restaurante.'],
    'delivery': ['Para confirmar si llegamos hasta allá y cuánto vale el domicilio, comunícate con el restaurante{phone}.'],
    'order_state': ['Tu pedido está {state}.'],
    'order_unknown': ['Puedes consultar cómo va tu pedido directamente con el restaurante.'],
    'needs_options': ['Este plato tiene opciones para escoger. Abre su ficha para elegirlas.'],
    'use_buttons': ['Para agregarlos, usa los botones de cada plato.'],
}
# El voseo caleño: «mirá», «querés», «podés», «contame».
VOS = {
    **TU,
    'delivery_quote': ['Con gusto, te atendemos desde {sede}, a {distancia} km. El envío cuesta $ {envio}; podés pagar con {metodos}.'],
    'delivery_out': ['Lo sentimos, todavía no llegamos a esa ubicación. Con gusto podemos preparar tu pedido para recoger.'],
    'delivery_off': ['Para confirmar si llegamos hasta allá y cuánto vale el domicilio, comunícate con el restaurante{phone}.'],
    'delivery_ask': ['Con gusto llevamos tu pedido. Compartí tu ubicación para revisar la cobertura y el envío.'],
    'delivery_consent': ['¿Nos autoriza a guardar tu dirección para próximos pedidos? Política de datos: {policy}.'],
    'delivery_saved': ['¿Te lo enviamos a {label} ({address})?'],
    'delivery_link': ['Si es para otra persona, usá este enlace: Ubica la entrega · {url}'],
    'delivery_continue': ['Podés escoger sus platos y terminar el pedido aquí: {url}'],
    'delivery_accept': ['Acepto'],
    'delivery_use': ['Usar esta dirección'],
    'delivery_method_online': ['pago en línea'],
    'delivery_method_cash': ['efectivo contra entrega'],
    'delivery_method_card_on_delivery': ['datáfono contra entrega'],

    'ask_name': ['{greeting} Bienvenido, soy tu mesero virtual y te voy a acompañar hoy. ¿Cómo te llamás?'],
    'welcome_named': ['{greeting} Te cuento lo que más piden hoy: {featured}. ¿Qué querés?'],
    'welcome': ['{greeting} Bienvenido. Te cuento lo que más piden hoy: {featured}. ¿Qué querés?',
                '{greeting} Qué gusto atenderte. Hoy te recomiendo {featured}. ¿Por dónde querés empezar?'],
    'welcome_back': ['{greeting} Qué alegría tenerte de vuelta. ¿Querés {favorite} como la otra vez, o te muestro algo nuevo?'],
    'menu': ['Mirá estas opciones del menú. ¿Cuál te provoca?', 'Te tengo estas opciones. ¿Cuál querés?'],
    'clarify': ['Contame un poquito más. También podés tocar una de estas opciones.',
                '¿Qué se te antoja hoy? Mirá algunas opciones del menú.'],
    'empty': ['No encontré platos disponibles con eso que me pedís. Miremos otras opciones.'],
    'reminder': ['Con gusto te ayudo con el menú, tu pedido y el restaurante. ¿Qué se te antoja hoy?'],
    'warning': ['Mirá, este chat es para pedidos y preguntas del restaurante. Si seguimos en otros temas, por un rato solo podré mostrarte el menú con botones.'],
    'restricted': ['Por los próximos 30 minutos te muestro el menú con botones. Podés seguir escogiendo tus platos.'],
    'paused': ['Pausamos el asistente por hoy. Si querés pedir, el restaurante te atiende directamente con gusto.'],
    'quota': ['Llegamos al cupo de mensajes de hoy. Podés seguir mirando el menú con los botones.'],
    'size': ['Contame lo que necesitás en un mensaje de hasta 1.000 caracteres, porfa.'],
    'pace': ['Estoy juntando tus mensajes. Ya mismo podés seguir.'],
    'repeat': ['Ya tengo tu mensaje. Podés seguir con estas opciones del menú.'],
    'human': ['Qué pena con vos. El equipo del restaurante te ayuda con esto; podés pedir atención desde el menú.'],
    'confirmed_menu': ['Listo, tu selección está resumida. Podés agregar los platos desde sus tarjetas y revisar Mi pedido.'],
    'added': ['¡Listo, ve! Ya te agregué eso a Mi pedido. Allá lo podés revisar antes de mandarlo a cocina.'],
    'upsell_drink': ['¿Querés acompañarlo con algo de tomar? Mirá estas opciones.'],
    'upsell_extra': ['¿Querés probarlo con alguna adición? Mirá estas opciones.'],
    'hours_none': ['Qué pena, no tengo un horario publicado para hoy. Podés consultarlo con el restaurante.'],
    'address_none': ['Qué pena, no tengo la dirección publicada. Podés consultarla con el restaurante.'],
    'order_unknown': ['Podés consultar cómo va tu pedido directamente con el restaurante.'],
    'needs_options': ['Este plato tiene opciones para escoger. Abrí su ficha para elegirlas.'],
    'use_buttons': ['Para agregarlos, usá los botones de cada plato.'],
}

TONES = {
    'neutro': {
        'name': 'Colombiano neutro', 'trato': 'usted',
        'style': 'colombiano neutro: amable, claro y profesional, sin regionalismos marcados. Puede usar «con gusto», '
                 '«claro que sí», «listo» o «¡qué rico!».',
        'phrases': USTED,
    },
    'paisa': {
        'name': 'Paisa (Antioquia)', 'trato': 'usted',
        'style': 'paisa amable de Medellín: cálido y cercano. Usa con moderación «pues», «con mucho gusto», «a la orden», '
                 '«¿qué le provoca?», «de una», «¡qué delicia!» y algún diminutivo cariñoso («ahorita», «una limonadita»). '
                 'Nunca «parce», «ome» ni «chimba».',
        'phrases': {**USTED,
                    'delivery_ask': ['Con mucho gusto, pues. Comparta su ubicación y le cuento si llegamos y cuánto vale el envío.'],
                    'ask_name': ['{greeting} Bienvenido, con mucho gusto lo atiendo hoy. ¿Con quién tengo el gusto, pues?'],
                    'nice_to_meet': ['¡Mucho gusto, {name}!'],
                    'welcome_named': ['{greeting} Le cuento, pues, que lo que más piden hoy es {featured}. ¿Qué le provoca?'],
                    'welcome': ['{greeting} Bienvenido, con mucho gusto lo atiendo. Lo que más piden hoy es {featured}. ¿Qué le provoca, pues?',
                                '{greeting} ¡Qué alegría tenerlo por acá! Hoy le recomiendo {featured}. ¿Qué se le antoja?'],
                    'welcome_back': ['{greeting} ¡Qué alegría tenerlo de vuelta, pues! ¿Le provoca {favorite} como la otra vez, o le muestro algo nuevo?'],
                    'menu': ['Mire pues estas opciones, de pronto alguna le encanta. ¿Cuál le provoca?',
                             'Le tengo estas opciones del menú, ¡qué delicia! ¿Qué se le antoja?'],
                    'clarify': ['Cuénteme un poquito más, pues. También puede tocar una de estas opciones.',
                                '¿Qué se le antoja hoy? Aquí le dejo algunas opciones del menú.'],
                    'reminder': ['Con mucho gusto le ayudo con el menú, su pedido y el restaurante. ¿Qué se le antoja hoy?'],
                    'added': ['¡De una! Ya le agregué eso a Mi pedido. Allá lo puede revisar antes de mandarlo a cocina.'],
                    'upsell_drink': ['¿Le provoca acompañarlo con algo de tomar, pues? Le tengo estas opciones.'],
                    'upsell_extra': ['¿Le provoca probarlo con alguna adición? Le tengo estas opciones, ¡qué delicia!'],
                    'hours': ['Hoy lo atendemos de {hours}, con mucho gusto.']},
    },
    'rolo': {
        'name': 'Rolo (Bogotá)', 'trato': 'usted',
        'style': 'bogotano: cortés, pausado y cálido, de usted como señal de cercanía. Usa con moderación «con mucho gusto», '
                 '«claro que sí», «listo», «chévere» y «¡qué más!». Sin «sumercé», que es rural de Boyacá y Cundinamarca.',
        'phrases': {**USTED,
                    'welcome': ['{greeting} Bienvenido, con mucho gusto lo atiendo. Lo que más piden hoy es {featured}. ¿Qué le gustaría?',
                                '{greeting} Qué gusto saludarlo. Hoy le recomiendo {featured}, muy chévere. ¿Por dónde quiere empezar?'],
                    'menu': ['Claro que sí, le tengo estas opciones. ¿Cuál le provoca?',
                             'Mire estas opciones del menú, muy chéveres. ¿Cuál se le antoja?'],
                    'added': ['¡Listo! Ya le agregué eso a Mi pedido. Allá lo puede revisar antes de mandarlo a cocina.'],
                    'upsell_drink': ['¿Le gustaría acompañarlo con algo de tomar? Le tengo estas opciones.']},
    },
    'costeno': {
        'name': 'Costeño (Caribe)', 'trato': 'tú',
        'style': 'costeño del Caribe colombiano: alegre, cálido y ágil, tuteando. Usa con moderación «¿qué más?», '
                 '«con todo el gusto», «bacano», «sabroso» y «¡qué rico!». Nada de expresiones vulgares.',
        'phrases': {**TU,
                    'ask_name': ['{greeting} ¿Qué más? Bienvenido, con todo el gusto te atiendo hoy. ¿Cómo te llamas?'],
                    'nice_to_meet': ['¡Qué bacano, {name}, mucho gusto!'],
                    'welcome_named': ['{greeting} Te cuento que lo más pedido hoy es {featured}, sabroso. ¿Qué te provoca?'],
                    'welcome': ['{greeting} ¿Qué más? Bienvenido, con todo el gusto te atiendo. Lo que más piden hoy es {featured}. ¿Qué te provoca?',
                                '{greeting} ¡Qué bacano tenerte por acá! Hoy te recomiendo {featured}, sabroso. ¿Qué se te antoja?'],
                    'welcome_back': ['{greeting} ¡Qué bacano tenerte de vuelta! ¿Te provoca {favorite} como la otra vez, o te muestro algo nuevo?'],
                    'menu': ['Mira estas opciones, sabrosas. ¿Cuál te provoca?', 'Te tengo estas opciones del menú, ¡qué rico! ¿Cuál se te antoja?'],
                    'added': ['¡Listo! Ya te agregué eso a Mi pedido. Allá lo puedes revisar antes de mandarlo a cocina.'],
                    'upsell_drink': ['¿Te provoca algo bien frío para acompañar? Te tengo estas opciones.']},
    },
    'caleno': {
        'name': 'Caleño (Valle)', 'trato': 'vos',
        'style': 'caleño del Valle del Cauca: alegre y cercano, con voseo («mirá», «querés», «podés», «contame»). Usa con '
                 'moderación «ve», «bien pueda», «de una» y «¡qué rico, ve!». Sin vulgaridades.',
        'phrases': {**VOS,
                    'ask_name': ['{greeting} Bienvenido, bien pueda. Soy tu mesero virtual. ¿Cómo te llamás, ve?'],
                    'welcome': ['{greeting} Bienvenido, bien pueda. Mirá, lo que más piden hoy es {featured}. ¿Qué querés?',
                                '{greeting} ¡Qué gusto tenerte por acá, ve! Hoy te recomiendo {featured}. ¿Qué se te antoja?'],
                    'menu': ['Mirá estas opciones, ¡qué rico, ve! ¿Cuál te provoca?', 'Te tengo estas opciones del menú. ¿Cuál querés?'],
                    'upsell_drink': ['¿Querés algo de tomar para acompañar, ve? Mirá estas opciones.']},
    },
    'santandereano': {
        'name': 'Santandereano', 'trato': 'usted',
        'style': 'santandereano: franco, directo y cálido, de usted. Usa con moderación «¡hágale!», «con mucho gusto», '
                 '«claro» y «¡qué delicia!». Sin «mano», «pingo» ni «arrecho» con clientes.',
        'phrases': {**USTED,
                    'welcome': ['{greeting} Bienvenido, con mucho gusto lo atiendo. Lo que más piden hoy es {featured}. ¿Qué le provoca?',
                                '{greeting} Qué gusto tenerlo por acá. Hoy le recomiendo {featured}. ¡Hágale! ¿Qué se le antoja?'],
                    'menu': ['Le tengo estas opciones, ¡qué delicia! ¿Cuál le provoca?', 'Mire estas opciones del menú. ¿Cuál escoge?'],
                    'added': ['¡Hágale! Ya le agregué eso a Mi pedido. Allá lo puede revisar antes de mandarlo a cocina.']},
    },
}


def tone_of(organization):
    key = getattr(organization, 'assistant_tone', '') or DEFAULT
    return key if key in TONES else DEFAULT


def phrases(tone, key):
    return TONES.get(tone, TONES[DEFAULT])['phrases'].get(key) or USTED[key]


def options():
    """Lo que ve el dueño para escoger: nombre, trato y una frase de muestra."""
    return [{'key': key, 'name': tone['name'], 'trato': tone['trato'],
             'sample': phrases(key, 'welcome')[0].format(greeting='¡Buenas noches!', featured='la Hamburguesa de la casa')}
            for key, tone in TONES.items()]
