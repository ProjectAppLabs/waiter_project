"""Exporta plantillas con el resolvedor real para la auditoría de J3, sin escribir en la base."""
import json
import os
import sys
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(root / 'experience'))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'experience_project.settings_dev')
    import django
    django.setup()
    from experience_app.diseno import services as design
    from experience_app.plantillas.defaults import FALLBACK_SPEC
    from experience_app.plantillas.services import build

    output = Path(sys.argv[1] if len(sys.argv) > 1 else root / 'test-reports/j3/temas').resolve()
    output.mkdir(parents=True, exist_ok=True)
    matrix = []

    def export(name, body, cases, **metadata):
        template = build(FALLBACK_SPEC, {}, {}, {}, 5, body)
        (output / f'{name}.json').write_text(json.dumps(template, ensure_ascii=False, indent=2) + '\n')
        matrix.append({'id': name, 'casos': cases, **metadata})

    export('predeterminado', {}, ['menu', 'dish-detailed', 'cart'])
    for layer in ['variantes', 'distribucion']:
        for key, rule in design.SCHEMA['properties'][layer]['properties'].items():
            cases = ['dish-detailed'] if key in ['boton', 'formaBoton'] else ['menu']
            if key == 'ficha':
                cases = ['dish-detailed', 'dish-desktop']
            elif key == 'carrito':
                cases = ['cart', 'cart-swiped']
            for value in rule['enum']:
                if value != rule['default']:
                    export(f'{key}-{value}'.replace(':', '-'), {layer: {key: value}}, cases, grupo=key, valor=value)

    mixed = {'variantes': {'boton': 'contorno', 'formaBoton': 'recta', 'tarjeta': 'borde', 'categorias': 'subrayado',
                          'precio': 'pildora', 'imagen': '4:3', 'formaImagen': 'tema', 'cabecera': 'centrada',
                          'saludo': 'oculto', 'insignia': 'contorno'},
             'distribucion': {'carta': 'lista', 'ficha': 'heroe', 'carrito': 'compacta'},
             'fundamentos': {'densidad': .75, 'texto': 1.5, 'titulo': 1.5, 'forma': {'imagen': 0}}}
    export('mixto-claro', mixed, 'j2')
    dark = json.loads(json.dumps(mixed))
    dark['variantes'].update(boton='suave', formaBoton='pildora', tarjeta='sombra', categorias='pestanas',
                            precio='normal', formaImagen='circular', saludo='visible')
    dark['distribucion'].update(carta='cuadricula', ficha='dividida')
    dark['fundamentos'].update(densidad=1.5, colores={'fondo': '#111111', 'superficie': '#222222', 'tinta': '#FFFFFF',
                              'tintaSuave': '#CCCCCC', 'acento': '#DDDDDD', 'tintaTerciaria': '#CCCCCC'})
    export('mixto-oscuro', dark, 'j2')
    mixed['distribucion']['carta'] = 'foto-grande'
    mixed['fundamentos']['densidad'] = 1.5
    export('mixto-estrecho', mixed, ['menu', 'category', 'search', 'favorites', 'dish-extras-selected',
                                  'dish-added', 'cart-swiped', 'online-CARD', 'chat-recommendation'], ancho=320)
    (output / 'matriz.json').write_text(json.dumps(matrix, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(matrix)} temas exportados en {output}')


if __name__ == '__main__':
    main()
