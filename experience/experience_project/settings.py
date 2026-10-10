"""
Settings de experiencia del comensal (bloque 3).

Recorte de la plantilla del fleet (base_django_react_next_feature): sin JWT,
silk, huey, thumbnails ni MySQL — en esta etapa no hay usuarios ni tareas.
La base se elige por DJANGO_DB_ENGINE (sqlite3 por defecto, como la plantilla; MySQL en desarrollo y producción).
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

DJANGO_ENV = os.getenv('DJANGO_ENV', 'development')
IS_PRODUCTION = DJANGO_ENV == 'production'
DINER_DEMO_ENABLED = not IS_PRODUCTION and os.getenv('DINER_DEMO_ENABLED', 'true').lower() in {'1', 'true', 'yes', 'on'}
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'change-me')
DEBUG = os.getenv('DJANGO_DEBUG', 'false' if IS_PRODUCTION else 'true').lower() in {'1', 'true', 'yes', 'on'}
# Falla cerrado: en producción no arranca con el secreto de ejemplo ni con DEBUG.
if IS_PRODUCTION and (SECRET_KEY == 'change-me' or len(SECRET_KEY) < 50 or DEBUG):
    raise RuntimeError('DJANGO_SECRET_KEY real (>=50 caracteres) y DJANGO_DEBUG=false son obligatorios en producción')
ALLOWED_HOSTS = [h.strip() for h in os.getenv('DJANGO_ALLOWED_HOSTS', '').split(',') if h.strip()]

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'corsheaders',
    'rest_framework',
    'experience_app',
    'tenancy',
    'accounts',
    'notifications',
    'catalog',
    'inventory',
    'sales',
    'tables',
    'kitchen',
    'realtime',
    'loyalty',
    'reports',
    'billing',
    'reservations',
    'whatsapp',
    'assistant',
    'delivery',
]

MIDDLEWARE = [
    'tenancy.modules.ModuleCacheMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

CORS_ALLOWED_ORIGINS = [o.strip() for o in os.getenv('DJANGO_CORS_ALLOWED_ORIGINS', '').split(',') if o.strip()]
CORS_ALLOW_CREDENTIALS = True

# API pública sin usuarios: la autorización la dan la cookie del comensal y la clave interna.
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (),
    'DEFAULT_PERMISSION_CLASSES': ('rest_framework.permissions.AllowAny',),
    'DEFAULT_RENDERER_CLASSES': ('rest_framework.renderers.JSONRenderer',),
    'UNAUTHENTICATED_USER': None,
    'EXCEPTION_HANDLER': 'experience_app.utils.errors.handle',
}

# Un logo de 2 MB ocupa hasta 2,67 MB en el cuerpo JSON base64.
DATA_UPLOAD_MAX_MEMORY_SIZE = 3_000_000

ROOT_URLCONF = 'experience_project.urls'
WSGI_APPLICATION = 'experience_project.wsgi.application'
TEMPLATES = []

_db_engine = os.getenv('DJANGO_DB_ENGINE', 'django.db.backends.sqlite3')
_db_config = {'ENGINE': _db_engine, 'NAME': os.getenv('DJANGO_DB_NAME', str(BASE_DIR / 'db.sqlite3'))}
if 'sqlite3' not in _db_engine:
    _db_config.update({
        'USER': os.getenv('DB_USER', ''), 'PASSWORD': os.getenv('DB_PASSWORD', ''),
        'HOST': os.getenv('DB_HOST', 'localhost'), 'PORT': os.getenv('DB_PORT', '3306' if 'mysql' in _db_engine else '5432'),
    })
if 'mysql' in _db_engine:
    # MySQL es el estándar de los servidores de ProjectApp. utf8mb4 guarda tildes y emojis; el modo estricto rechaza
    # valores que no caben en vez de recortarlos; READ COMMITTED es el aislamiento que Django recomienda y el que tenía
    # PostgreSQL. Las pruebas crean su base con la misma colación (TEST).
    _db_config['OPTIONS'] = {'charset': 'utf8mb4', 'isolation_level': 'read committed',
                             'init_command': "SET sql_mode='STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO'"}
    _db_config['TEST'] = {'CHARSET': 'utf8mb4', 'COLLATION': 'utf8mb4_0900_ai_ci'}
# Otra base de pruebas para correr dos suites a la vez sin que se borren entre sí.
if os.getenv('DJANGO_TEST_DB_NAME'):
    _db_config.setdefault('TEST', {})['NAME'] = os.getenv('DJANGO_TEST_DB_NAME')
DATABASES = {'default': _db_config}

# locmem en dev; en prod DJANGO_CACHE_URL=redis://... (django.core.cache.backends.redis.RedisCache)
_cache_url = os.getenv('DJANGO_CACHE_URL', '')
CACHES = {
    'default': (
        {'BACKEND': 'django.core.cache.backends.redis.RedisCache', 'LOCATION': _cache_url}
        if _cache_url else {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}
    )
}

LANGUAGE_CODE = 'es-co'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

LOG_LEVEL = os.getenv('DJANGO_LOG_LEVEL', 'INFO')
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'verbose': {'format': '[{asctime}] {levelname} {name} {message}', 'style': '{'}},
    'handlers': {'console': {'class': 'logging.StreamHandler', 'formatter': 'verbose'}},
    'root': {'handlers': ['console'], 'level': LOG_LEVEL},
}

# ---------------------------------------------------------------------------
# Bloque 3 — experiencia del comensal
# ---------------------------------------------------------------------------
EXPERIENCE_INTERNAL_KEY = os.getenv('EXPERIENCE_INTERNAL_KEY', '')
MENU_CACHE_SECONDS = int(os.getenv('MENU_CACHE_SECONDS', '60'))
# Marca del restaurante (tenancy.Organization): un cambio llega al comensal en ≤ este tiempo.
BRAND_CACHE_SECONDS = int(os.getenv('BRAND_CACHE_SECONDS', '60'))
# Plantilla del menú resuelta por sede (Plan H): un cambio desde el POS la invalida; este es el tope si nadie avisa.
TEMPLATE_CACHE_SECONDS = int(os.getenv('TEMPLATE_CACHE_SECONDS', '60'))

# Recuperación de cuenta: se habilita únicamente con un proveedor de correo configurado.
DINER_EMAIL_ENABLED = os.getenv('DINER_EMAIL_ENABLED', 'false').lower() in {'1', 'true', 'yes', 'on'}
DINER_PUBLIC_URL = os.getenv('DINER_PUBLIC_URL', 'http://192.168.56.10:3001').rstrip('/')
# Plan K3: comando que abre un borrador en un navegador y mide desbordes, solapes y mínimos (recibe DRAFT_TOKEN, REST y
# SEDE en el entorno y escribe JSON en stdout). Vacío = la verificación en navegador no está disponible en este servidor.
DESIGN_VERIFIER_CMD = os.getenv('DESIGN_VERIFIER_CMD', '')
DESIGN_VERIFIER_TIMEOUT = int(os.getenv('DESIGN_VERIFIER_TIMEOUT', '180'))
DESIGN_VERIFIER_REQUIRED = os.getenv('DESIGN_VERIFIER_REQUIRED', 'true').lower() in {'1', 'true', 'yes', 'on'}
# Con MAILERS, Django lee use_ssl y use_tls solo de OPTIONS y son excluyentes: el puerto 465 (TLS implícito) necesita
# use_ssl; STARTTLS (use_tls) queda para el resto. En minúsculas: Django 6.1 rechaza el setting EMAIL_USE_SSL junto a MAILERS.
email_use_ssl = os.getenv('EMAIL_USE_SSL', 'false').lower() in {'1', 'true', 'yes', 'on'}
MAILERS = {'default': {
    'BACKEND': 'django.core.mail.backends.smtp.EmailBackend',
    'OPTIONS': {
        'host': os.getenv('EMAIL_HOST', 'localhost'),
        'port': int(os.getenv('EMAIL_PORT', '587')),
        'username': os.getenv('EMAIL_HOST_USER', ''),
        'password': os.getenv('EMAIL_HOST_PASSWORD', ''),
        'use_ssl': email_use_ssl,
        'use_tls': not email_use_ssl and os.getenv('EMAIL_USE_TLS', 'true').lower() in {'1', 'true', 'yes', 'on'},
        'timeout': 10,
    },
}}
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'no-reply@example.invalid')

# Agente: solo en el servidor, sin claves en el repositorio; el modelo de voz es configurable.
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')
WA_AGENT_MODEL = os.getenv('WA_AGENT_MODEL', 'gpt-6-luna')

AGENT_DAILY_LIMIT = int(os.getenv('AGENT_DAILY_LIMIT', '200'))

# Gateway secrets use a separate, backed-up Fernet key; never derive it from DEBUG/SECRET_KEY.
PAYMENTS_FERNET_KEY = os.getenv('PAYMENTS_FERNET_KEY', '')
PAYMENTS_LIVE_ENABLED = os.getenv('PAYMENTS_LIVE_ENABLED', 'false').lower() == 'true'
PAYMENTS_PUBLIC_URL = os.getenv('PAYMENTS_PUBLIC_URL', '').rstrip('/')

# Plan T0: correo independiente del comensal, configurable por entorno.
POS_URL = os.getenv('POS_URL', 'http://localhost:3000').rstrip('/')
PLATFORM_URL = os.getenv('PLATFORM_URL', 'http://localhost:3000').rstrip('/')
EMAIL_FROM = os.getenv('EMAIL_FROM', 'team@projectapp.co')
WAITER_EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'django.core.mail.backends.filebased.EmailBackend')
WAITER_EMAIL_FILE_PATH = BASE_DIR / 'mail'
MAILERS['waiter'] = {
    'BACKEND': WAITER_EMAIL_BACKEND,
    'OPTIONS': (
        {'file_path': WAITER_EMAIL_FILE_PATH} if WAITER_EMAIL_BACKEND == 'django.core.mail.backends.filebased.EmailBackend'
        else dict(MAILERS['default']['OPTIONS']) if WAITER_EMAIL_BACKEND == 'django.core.mail.backends.smtp.EmailBackend'
        else {}
    ),
}
# Falla cerrado: en producción un correo que no sale del servidor (archivo, consola, memoria o nulo) se reportaría como
# enviado y las invitaciones y los avisos de cobro no llegarían a nadie.
if IS_PRODUCTION and WAITER_EMAIL_BACKEND in {f'django.core.mail.backends.{name}.EmailBackend'
                                              for name in ('filebased', 'console', 'locmem', 'dummy')}:
    raise RuntimeError('EMAIL_BACKEND con salida real (p. ej. django.core.mail.backends.smtp.EmailBackend) es obligatorio en producción')
# La cabecera del inquilino debe pasar el preflight del navegador.
from corsheaders.defaults import default_headers
CORS_ALLOW_HEADERS = (*default_headers, 'x-waiter-org')

# Fotos propias del catálogo T1.
MEDIA_ROOT = BASE_DIR / 'media'

# WhatsApp: las credenciales son opcionales para arrancar.
WA_ACCESS_TOKEN = os.getenv('WA_ACCESS_TOKEN', '')
WA_PHONE_NUMBER_ID = os.getenv('WA_PHONE_NUMBER_ID', '')
WA_WABA_ID = os.getenv('WA_WABA_ID', '')
META_APP_SECRET = os.getenv('META_APP_SECRET', '')
WA_VERIFY_TOKEN = os.getenv('WA_VERIFY_TOKEN', '')
WA_GRAPH_VERSION = os.getenv('WA_GRAPH_VERSION', 'v25.0')
META_APP_ID = os.getenv('META_APP_ID', '')
WA_SIGNUP_CONFIG_ID = os.getenv('WA_SIGNUP_CONFIG_ID', '')
WA_TEST_RECIPIENTS = [n.strip() for n in os.getenv('WA_TEST_RECIPIENTS', '').split(',') if n.strip()]

# El asistente funciona con reglas y plantillas cuando las claves están vacías.
TYPESAFE_API_KEY = os.getenv('TYPESAFE_API_KEY', '')
ASSISTANT_JEV_MODEL = os.getenv('ASSISTANT_JEV_MODEL', 'jev-1.13.0')
ASSISTANT_DAILY_PER_PARTICIPANT = int(os.getenv('ASSISTANT_DAILY_PER_PARTICIPANT', '30'))
WA_AGENT_REASONING_EFFORT = os.getenv('WA_AGENT_REASONING_EFFORT', '')
WA_AGENT_TEMPERATURE = os.getenv('WA_AGENT_TEMPERATURE', '')

# Opcional: con clave, las direcciones escritas se buscan en Google (entiende mejor la nomenclatura colombiana).
GOOGLE_MAPS_API_KEY = os.getenv('GOOGLE_MAPS_API_KEY', '')
# Sin clave de Google, las direcciones salen de Nominatim (OpenStreetMap, gratis, una consulta por segundo).
NOMINATIM_ENABLED = os.getenv('NOMINATIM_ENABLED', '1').lower() not in ('0', 'false', 'no')
# Servidores propios de OpenStreetMap para producción (vacíos: los públicos, solo para uso liviano).
NOMINATIM_URL = os.getenv('NOMINATIM_URL', '').rstrip('/')
PHOTON_URL = os.getenv('PHOTON_URL', '')
