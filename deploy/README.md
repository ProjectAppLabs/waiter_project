# Despliegue de Waiter

Una máquina con Docker sirve todas las organizaciones, cada una en su subdominio de `waiter.projectapp.co`. Nada de
esto se ha aplicado todavía: requiere el acceso al DNS del dominio y al servidor.

## Qué queda en producción

| Dirección | Servicio |
|---|---|
| `https://<org>.waiter.projectapp.co` | POS y consola del dueño de cada organización |
| `https://plataforma.waiter.projectapp.co` | Consola de ProjectApp (y `waiter.projectapp.co` redirige aquí) |
| `https://menu.waiter.projectapp.co/<org>/<sede>/t/<token>` | Menú del comensal (QR de cada mesa) |
| `https://api.waiter.projectapp.co/mcp/` | MCP del diseño del menú; también los webhooks de pagos |

Servicios del `docker-compose.prod.yml`: MySQL 8.4, Redis, experience (Gunicorn), las tareas programadas
(`crontab`), el POS y el menú (Next.js) y Caddy con el certificado comodín.

## 1. DNS (una sola vez)

En el proveedor del DNS de `projectapp.co`:

1. Un registro `A` para `waiter.projectapp.co` hacia la IP pública del servidor.
2. Un registro `A` comodín `*.waiter.projectapp.co` hacia la misma IP. Así cada organización nueva tiene su dirección
   sin tocar el DNS.
3. Un token de API del proveedor con permiso para editar registros TXT de la zona (Caddy lo usa para el desafío DNS del
   certificado comodín). En Cloudflare: «Zone · DNS · Edit» sobre `projectapp.co`.

Si el proveedor no es Cloudflare, cambia `DNS_PROVIDER` por el nombre de su módulo de
[caddy-dns](https://github.com/caddy-dns) (`route53`, `digitalocean`, `godaddy`, `namecheap`…) y ajusta la línea
`dns` del `Caddyfile` si el módulo pide más campos.

## 2. Primer despliegue

```bash
git clone … && cd waiter_project/deploy
cp .env.prod.example .env.prod      # rellenar: claves, correo, DNS_API_TOKEN
python3 -c "import secrets; print(secrets.token_urlsafe(64))"          # DJANGO_SECRET_KEY y EXPERIENCE_INTERNAL_KEY
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"   # PAYMENTS_FERNET_KEY
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml exec experience python manage.py create_platform_admin --email … --name …
```

experience aplica las migraciones al arrancar. La primera emisión del certificado tarda uno o dos minutos.

## 3. Base de datos

Waiter usa MySQL 8.4, el estándar de los servidores de ProjectApp. Hay dos formas:

- **El servicio `db` del compose.** Crea la base `waiter_core` con utf8mb4 y carga las zonas horarias al iniciar por
  primera vez (`mysql-zonas.sh`). Basta llenar `DB_USER`, `DB_PASSWORD` y `DB_ROOT_PASSWORD`.
- **Un servidor MySQL que ya exista.** Quita el servicio `db` y los `depends_on` hacia él, y pon `DB_HOST` y `DB_PORT`
  en `.env.prod`. En ese servidor:

  ```sql
  CREATE DATABASE waiter_core CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  CREATE USER 'waiter'@'%' IDENTIFIED BY '…';
  GRANT ALL PRIVILEGES ON waiter_core.* TO 'waiter'@'%';
  ```

  y carga las zonas horarias una vez (sin ellas las métricas por día salen vacías):
  `mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root -p mysql`.

experience aplica las migraciones al arrancar. Los tokens, claves e identificadores de idempotencia usan la colación
binaria (`utf8mb4_bin`): distinguen mayúsculas aunque el servidor no lo haga.

## 4. Datos de Burger House y copias de seguridad

Para llevar la base de desarrollo ya migrada a producción:

```bash
# en desarrollo
docker exec waiter-mysql mysqldump -uwaiter -pwaiter --single-transaction --routines waiter_core > waiter_core.sql
# en producción
docker compose -f docker-compose.prod.yml exec -T db mysql -uwaiter -p"$DB_PASSWORD" waiter_core < waiter_core.sql
```

Las fotos van en el volumen `media` (copiar `experience/media/`).

- Base: `mysqldump --single-transaction` diario hacia un almacenamiento externo, con retención de 30 días (o el
  respaldo que ya tenga el servidor MySQL de ProjectApp).
- Archivos: el volumen `media` (fotos, logos, banners, XML de documentos).
- La clave `PAYMENTS_FERNET_KEY`: sin ella no se descifran los secretos de las pasarelas.

## 5. Ensayo local

Sin DNS ni certificado se puede probar todo con `*.localhost`: en un `Caddyfile.local` cambia `{$BASE_DOMAIN}` por
`localhost` y la línea `tls { dns … }` por `tls internal`, y abre `https://frisby-74312.localhost`,
`https://plataforma.localhost` y `https://menu.localhost/frisby-74312/<sede>`.

## Tareas programadas

`crontab` (con supercronic): cuentas de cobro el día 1, mora y suspensión a diario, existencias bajas cada cinco
minutos y limpieza de eventos cada hora.
