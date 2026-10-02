# experience (el sistema propio) con Gunicorn. El contexto es experience/.
# mysqlclient (el controlador de MySQL de Django) se compila en una etapa aparte: la imagen final solo lleva su
# biblioteca de ejecución, sin compilador.
FROM python:3.12-slim AS wheels
RUN apt-get update && apt-get install -y --no-install-recommends build-essential pkg-config default-libmysqlclient-dev \
 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip wheel --no-cache-dir -r requirements.txt -w /wheels

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates libmariadb3 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL -o /usr/local/bin/supercronic https://github.com/aptible/supercronic/releases/download/v0.2.33/supercronic-linux-amd64 \
 && chmod +x /usr/local/bin/supercronic
COPY --from=wheels /wheels /wheels
COPY requirements.txt .
RUN pip install --no-cache-dir --no-index --find-links /wheels -r requirements.txt && rm -rf /wheels
COPY . .
EXPOSE 8000
# El SSE mantiene conexiones abiertas hasta cinco minutos: hilos por trabajador.
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn experience_project.wsgi:application --bind 0.0.0.0:8000 --workers 3 --threads 16 --timeout 330 --access-logfile -"]
