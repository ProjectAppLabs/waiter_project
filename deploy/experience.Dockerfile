# experience (el sistema propio) con Gunicorn. El contexto es experience/.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL -o /usr/local/bin/supercronic https://github.com/aptible/supercronic/releases/download/v0.2.33/supercronic-linux-amd64 \
 && chmod +x /usr/local/bin/supercronic
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
# El SSE mantiene conexiones abiertas hasta cinco minutos: hilos por trabajador.
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn experience_project.wsgi:application --bind 0.0.0.0:8000 --workers 3 --threads 16 --timeout 330 --access-logfile -"]
