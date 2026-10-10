"""Direcciones ⇄ coordenadas para ubicar la entrega.

Con `GOOGLE_MAPS_API_KEY` se usa Google (entiende mejor «Calle 10 # 43-12»). Sin clave se usa Nominatim, el servicio
gratuito de OpenStreetMap, respetando su política de uso: una consulta por segundo, identificación en el User-Agent y
resultados en caché. Se puede apagar con `NOMINATIM_ENABLED=False`.
"""
import hashlib
import time

import requests
from django.conf import settings
from django.core.cache import cache

from .coverage import coordinates

NOMINATIM = 'https://nominatim.openstreetmap.org'
USER_AGENT = 'Waiter/1.0 (ProjectApp; https://projectapp.co)'
DAY = 24 * 60 * 60


class Unavailable(Exception):
    """El proveedor no respondió; quien llama decide cómo avisarle al cliente."""


def provider():
    if settings.GOOGLE_MAPS_API_KEY:
        return 'google'
    return 'nominatim' if getattr(settings, 'NOMINATIM_ENABLED', True) else None


def _nominatim(path, params):
    # Una consulta por segundo para todo el servidor (política de Nominatim): se espera el turno hasta 2 s.
    for _ in range(20):
        if cache.add('geocoding:nominatim:turno', 1, timeout=1):
            break
        time.sleep(.1)
    else:
        raise Unavailable('Nominatim ocupado')
    try:
        response = requests.get(f'{NOMINATIM}/{path}', params={**params, 'format': 'jsonv2', 'accept-language': 'es'},
                                headers={'User-Agent': USER_AGENT}, timeout=(3, 5), allow_redirects=False)
        if response.status_code != 200:
            raise Unavailable(f'Nominatim {response.status_code}')
        return response.json()
    except (requests.RequestException, ValueError) as error:
        raise Unavailable('Nominatim no respondió') from error


def _google(params):
    try:
        response = requests.get('https://maps.googleapis.com/maps/api/geocode/json', params={
            **params, 'region': 'co', 'language': 'es', 'key': settings.GOOGLE_MAPS_API_KEY}, timeout=(3, 5), allow_redirects=False)
        data = response.json()
    except (requests.RequestException, ValueError) as error:
        raise Unavailable('Google no respondió') from error
    if response.status_code != 200 or not isinstance(data, dict) or data.get('status') not in ('OK', 'ZERO_RESULTS'):
        raise Unavailable('Google rechazó la consulta')
    return data.get('results', [])


def short(address):
    """«Calle 10 43-12, El Poblado, Medellín»: lo que reconoce el cliente, sin país ni código postal."""
    road = address.get('road') or address.get('pedestrian') or address.get('footway') or ''
    first = ' '.join(filter(None, (road, address.get('house_number', '')))).strip()
    area = address.get('neighbourhood') or address.get('suburb') or address.get('quarter') or ''
    city = address.get('city') or address.get('town') or address.get('village') or address.get('municipality') or ''
    city = city.replace('Perímetro Urbano ', '')
    return ', '.join(dict.fromkeys(filter(None, (first, area, city))))


def search(query, near=None):
    """Hasta 5 lugares de Colombia que coinciden con lo escrito, del más probable al menos.

    `near` (lat, lng) limita la búsqueda a unos 25 km de la sede: un domicilio nunca sale de su ciudad.
    """
    kind = provider()
    if not kind:
        raise Unavailable('Sin proveedor de mapas')
    # Huella del texto: las claves de caché no admiten espacios ni tildes.
    around = f'{float(near[0]):.2f},{float(near[1]):.2f}' if near else ''
    key = f'geocoding:buscar:{kind}:' + hashlib.sha256(f'{around}|{query.strip().lower()}'.encode()).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return cached
    results = []
    if kind == 'google':
        bounds = {'bounds': f'{float(near[0]) - .25},{float(near[1]) - .25}|{float(near[0]) + .25},{float(near[1]) + .25}'} if near else {}
        for row in _google({'address': query, 'components': 'country:CO', **bounds})[:5]:
            lat, lng = coordinates(row['geometry']['location']['lat'], row['geometry']['location']['lng'])
            results.append({'texto': row['formatted_address'], 'lat': float(lat), 'lng': float(lng)})
    else:
        box = {'viewbox': f'{float(near[1]) - .25},{float(near[0]) + .25},{float(near[1]) + .25},{float(near[0]) - .25}', 'bounded': 1} if near else {}
        for row in (_nominatim('search', {'q': query, 'countrycodes': 'co', 'limit': 5, 'addressdetails': 1, **box}) or [])[:5]:
            lat, lng = coordinates(row['lat'], row['lon'])
            results.append({'texto': short(row.get('address') or {}) or row.get('display_name', ''), 'lat': float(lat), 'lng': float(lng)})
    cache.set(key, results, DAY)
    return results


def reverse(lat, lng):
    """La dirección aproximada de un punto, para confirmarle al cliente que el pin quedó donde es."""
    kind = provider()
    if not kind:
        raise Unavailable('Sin proveedor de mapas')
    lat, lng = coordinates(lat, lng)
    # Cinco decimales son ~1 m: dos pines casi iguales comparten la consulta.
    key = f'geocoding:direccion:{kind}:{float(lat):.5f}:{float(lng):.5f}'
    cached = cache.get(key)
    if cached is not None:
        return cached
    if kind == 'google':
        rows = _google({'latlng': f'{lat},{lng}', 'result_type': 'street_address|premise|route'})
        found = rows[0]['formatted_address'].replace(', Colombia', '') if rows else ''
    else:
        data = _nominatim('reverse', {'lat': str(lat), 'lon': str(lng), 'zoom': 18, 'addressdetails': 1}) or {}
        found = short(data.get('address') or {}) if isinstance(data, dict) else ''
    cache.set(key, found, DAY)
    return found


PHOTON = 'https://photon.komoot.io/api/'
# Lugares que no deben aparecer como sugerencia en el menú de un restaurante.
HIDDEN = {'erotic', 'brothel', 'stripclub', 'swingerclub', 'love_hotel', 'sex_shop', 'adult_gaming_centre'}


def _photon(query, near):
    params = {'q': query, 'limit': 8}
    if near:
        lat, lng = float(near[0]), float(near[1])
        params.update({'lat': lat, 'lon': lng, 'bbox': f'{lng - .25},{lat - .25},{lng + .25},{lat + .25}'})
    try:
        response = requests.get(PHOTON, params=params, headers={'User-Agent': USER_AGENT}, timeout=(2, 3), allow_redirects=False)
        if response.status_code != 200:
            raise Unavailable(f'Photon {response.status_code}')
        return response.json().get('features', [])
    except (requests.RequestException, ValueError, AttributeError) as error:
        raise Unavailable('Photon no respondió') from error


def suggestion(props, lat, lng):
    """Una sugerencia como la ven en las apps de transporte: arriba la calle y el número (o el lugar), abajo el barrio."""
    street = ' '.join(filter(None, (props.get('street'), props.get('housenumber')))).strip()
    name = props.get('name') or ''
    title = street if props.get('type') in ('house', 'street') and street and not name else (name or street)
    city = (props.get('city') or '').replace('Perímetro Urbano ', '')
    area = [props.get('locality'), props.get('district'), city]
    detail = ', '.join(dict.fromkeys(x for x in ([street] if name and street else []) + area if x and x != title))
    return {'titulo': title, 'detalle': detail, 'lat': float(lat), 'lng': float(lng)}


def suggest(query, near=None):
    """Sugerencias mientras el cliente escribe (Photon, hecho para autocompletar; Nominatim no lo permite)."""
    kind = provider()
    if not kind:
        raise Unavailable('Sin proveedor de mapas')
    around = f'{float(near[0]):.2f},{float(near[1]):.2f}' if near else ''
    key = f'geocoding:sugerir:{kind}:' + hashlib.sha256(f'{around}|{query.strip().lower()}'.encode()).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return cached
    results = []
    if kind == 'google':
        for row in search(query, near):
            title, _, rest = row['texto'].partition(', ')
            results.append({'titulo': title, 'detalle': rest.replace(', Colombia', ''), 'lat': row['lat'], 'lng': row['lng']})
    else:
        for feature in _photon(query, near):
            props = feature.get('properties') or {}
            if props.get('countrycode') != 'CO' or props.get('osm_value') in HIDDEN:
                continue
            lng, lat = feature['geometry']['coordinates'][:2]
            lat, lng = coordinates(lat, lng)
            item = suggestion(props, lat, lng)
            # Una calle larga viene por tramos: basta una sugerencia por calle y barrio.
            if item['titulo'] and all((r['titulo'], r['detalle']) != (item['titulo'], item['detalle']) for r in results):
                results.append(item)
    results = results[:6]
    cache.set(key, results, DAY)
    return results
