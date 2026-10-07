# Entorno y pruebas

Versiones fijadas: Django 6.1, DRF 3.18.0 y pytest 9.1.1
(`experience/requirements.txt`); Next.js 16.3.3, React 19.2.8 y Playwright
1.62.1 (`pos/package.json`). Los clientes exigen Node 24.20.x y npm 11.19.x.
Antes de usar APIs de Next se leen las guías incluidas en su paquete, como
exigen los `AGENTS.md` de POS y comensal.

La base de referencia es MySQL 8.4, utf8mb4, modo estricto y READ COMMITTED.
`ExactCharField` conserva comparaciones binarias de claves; los índices
condicionales se expresan mediante columnas calculadas nullable
(`experience/tenancy/fields.py`, `experience/experience_project/settings.py`).
`DJANGO_ENV` selecciona producción. `DJANGO_DB_ENGINE` y las variables de DB
seleccionan el motor; el default SQLite no demuestra compatibilidad MySQL.

El clon principal es el checkout de servicio. Se trabaja en una rama de sesión
y un worktree; se entrega PR abierto con CI verde, sin merge. No ejecutar
`manage.py migrate` desde el worktree ni enlazar una base viva para pruebas.

Para la ronda se usa MySQL aislado y nombres `test_waiter_qa_backend` y
`test_waiter_qa_ui`. `scripts/calidad/seed_ronda.py` exige desarrollo, loopback
y nombres de prueba; el runner de Django crea y migra la fixture. No lee
credenciales del servicio. `scripts/calidad/gate_ronda.py` presenta temporalmente
experience como `backend/` y el POS como `frontend/` al core canónico,
sin copiar tests ni cambiar reglas.

Los tests backend son pytest; los unitarios de los clientes, Jest; los recorridos,
Playwright. La configuración de rutas está en `.testquality.yml` y el CI de esta
ronda en `.github/workflows/validacion-ronda.yml`. Cada test documenta en español
«Falla si…», con una observación del error que detecta. Skips, capturas aisladas
o autoría sin ejecución no validan una mejora.
