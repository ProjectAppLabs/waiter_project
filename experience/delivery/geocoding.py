"""Direcciones ⇄ coordenadas para ubicar la entrega, gastando lo mínimo.

- Sugerencias al escribir: con `GOOGLE_MAPS_API_KEY`, Google Places (New) con sesiones (las sugerencias no se cobran;
  solo el detalle del lugar escogido, ~USD 5 por 1.000). Sin clave, Photon (OpenStreetMap, gratis).
- Dirección aproximada del pin: siempre OpenStreetMap (Nominatim, gratis) mientras esté activo; Google solo si se apaga.
- Las respuestas de Google no se guardan en caché (sus términos solo permiten conservar el `place_id`); las de
  OpenStreetMap sí, 24 h. El punto que se guarda en el perfil es el que el cliente deja con el pin.
- Nominatim: una consulta por segundo, User-Agent de Waiter (su política). Se apaga con `NOMINATIM_ENABLED=False`.
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


def reverse_provider():
    # La lectura del pin es la consulta más frecuente: va por OpenStreetMap (gratis) aunque haya clave de Google.
    if getattr(settings, 'NOMINATIM_ENABLED', True):
        return 'nominatim'
    return 'google' if settings.GOOGLE_MAPS_API_KEY else None


def reverse(lat, lng):
    """La dirección aproximada de un punto, para confirmarle al cliente que el pin quedó donde es."""
    kind = reverse_provider()
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
    if kind != 'google':
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


PLACES = 'https://places.googleapis.com/v1'


def _places(method, path, body=None, field_mask='', session=''):
    headers = {'X-Goog-Api-Key': settings.GOOGLE_MAPS_API_KEY, 'Content-Type': 'application/json'}
    if field_mask:
        headers['X-Goog-FieldMask'] = field_mask
    try:
        response = requests.request(method, f'{PLACES}/{path}', json=body, headers=headers, timeout=(3, 5), allow_redirects=False,
                                    params={'sessionToken': session, 'languageCode': 'es', 'regionCode': 'co'} if method == 'GET' else None)
        data = response.json()
    except (requests.RequestException, ValueError) as error:
        raise Unavailable('Google Places no respondió') from error
    if response.status_code != 200 or not isinstance(data, dict):
        raise Unavailable(f'Google Places {response.status_code}')
    return data


def google_suggest(query, near, session):
    """Autocomplete (New) con sesión: las sugerencias se cobran juntas con el detalle del lugar que se escoja."""
    body = {'input': query, 'languageCode': 'es', 'regionCode': 'co', 'includedRegionCodes': ['co']}
    if session:
        body['sessionToken'] = session
    if near:
        body['locationBias'] = {'circle': {'center': {'latitude': float(near[0]), 'longitude': float(near[1])}, 'radius': 25000.0}}
    results = []
    for row in _places('POST', 'places:autocomplete', body).get('suggestions', [])[:6]:
        prediction = row.get('placePrediction') or {}
        structured = prediction.get('structuredFormat') or {}
        title = (structured.get('mainText') or {}).get('text') or (prediction.get('text') or {}).get('text', '')
        detail = ((structured.get('secondaryText') or {}).get('text') or '').replace(', Colombia', '')
        if prediction.get('placeId') and title:
            results.append({'titulo': title, 'detalle': detail, 'place_id': prediction['placeId'], 'lat': None, 'lng': None})
    return results


def place(place_id, session=''):
    """Las coordenadas del lugar escogido (Place Details Essentials: solo ubicación y dirección). Cierra la sesión."""
    data = _places('GET', f'places/{place_id}', field_mask='location,formattedAddress', session=session)
    location = data.get('location') or {}
    lat, lng = coordinates(location.get('latitude'), location.get('longitude'))
    return {'lat': float(lat), 'lng': float(lng), 'texto': (data.get('formattedAddress') or '').replace(', Colombia', ''), 'place_id': place_id}


def suggest(query, near=None, session=''):
    """Sugerencias mientras el cliente escribe: Google Places con clave; si no, Photon (Nominatim no lo permite)."""
    kind = provider()
    if not kind:
        raise Unavailable('Sin proveedor de mapas')
    if kind == 'google':
        # Sin caché: los términos de Google no permiten guardar sus resultados.
        return google_suggest(query, near, session)
    around = f'{float(near[0]):.2f},{float(near[1]):.2f}' if near else ''
    key = f'geocoding:sugerir:{kind}:' + hashlib.sha256(f'{around}|{query.strip().lower()}'.encode()).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return cached
    results = []
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
