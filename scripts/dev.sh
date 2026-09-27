#!/usr/bin/env bash
# Levanta, detiene o revisa todo el entorno de desarrollo con un solo comando.
#
#   scripts/dev.sh up       arranca lo que falte y espera a que cada servicio responda
#   scripts/dev.sh status   dice qué está arriba y qué no, con un chequeo real de cada uno
#   scripts/dev.sh down     detiene los servicios (los contenedores quedan detenidos, no borrados)
#
# Orden: Postgres → Odoo → registro y experiencia (Django) → POS y comensal (Next). Cada paso es idempotente: si el
# servicio ya responde, no se vuelve a lanzar. Registros en $LOGS; PID de cada proceso en $LOGS/<servicio>.pid, para
# detenerlos sin buscar procesos por nombre (un `pkill -f` puede coincidir con la propia shell que lo lanza).
#
# Variables: HOST (192.168.56.10 si la máquina tiene esa interfaz host-only; si no, su IP en la red local, p. ej. en WSL,
# para que otro equipo de la red llegue a los servicios), REST y SEDE (burger-house / poblado: el restaurante demo del chequeo del comensal).
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
if [[ -z ${HOST:-} ]]; then
  if ip -4 addr show 2>/dev/null | grep -q ' 192.168.56.10/'; then HOST=192.168.56.10
  else HOST=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}'); fi
fi
# docker-compose.yml y `npm run dev` del comensal leen la IP de aquí.
export WAITER_HOST=$HOST
REST=${REST:-burger-house}
SEDE=${SEDE:-poblado}
LOGS=${LOGS:-/tmp/waiter-dev}
COMPOSE=(docker compose -p odoo-spike -f "$ROOT/odoo/compose/docker-compose.yml")
mkdir -p "$LOGS"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
# `fail` anota el fallo: `up` y `status` terminan con código distinto de cero si algo falló, para que
# `scripts/dev.sh up && …` no siga contra un entorno a medias (antes devolvían éxito igual).
FAILED=0
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAILED=1; }
code() { curl -s -o /dev/null -m "${2:-10}" -w '%{http_code}' "$1" 2>/dev/null || true; }
# Espera hasta `secs` segundos a que `cmd` tenga éxito, con pausas (no un bucle que queme CPU).
wait_for() { local secs=$1; shift; local i; for ((i = 0; i < secs; i += 2)); do "$@" && return 0; sleep 2; done; return 1; }

port_open() { (exec 3<>"/dev/tcp/$HOST/$1") 2>/dev/null; }
pid_alive() { local f="$LOGS/$1.pid"; [[ -f $f ]] && kill -0 "$(cat "$f")" 2>/dev/null; }

# Lanza un proceso en segundo plano, desde su carpeta, fuera de esta shell, y guarda su PID.
launch() {
  local name=$1 dir=$2; shift 2
  # El PID lo escribe el propio líder de la sesión nueva: `$!` apuntaba a un bash intermedio y `down` no mataba nada.
  # La redirección va sobre toda la subshell: si no, el bash intermedio se queda con la salida de quien llamó y un
  # `scripts/dev.sh up | tail` no termina nunca.
  (cd "$dir" && setsid bash -c 'echo $$ >"$0"; exec nohup "$@"' "$LOGS/$name.pid" "$@" &) >>"$LOGS/$name.log" 2>&1 < /dev/null
}

odoo_up()       { [[ $(code "http://$HOST:8069/web/login" 30) == 200 ]]; }
experience_up() { [[ $(code "http://$HOST:8001/api/v1/$REST/$SEDE/ubicacion/" 20) == 200 ]]; }
registry_up()   { [[ $(code "http://$HOST:8002/" 10) != 000 ]]; }

check_host() {
  if ! ip -4 addr show 2>/dev/null | grep -q " $HOST/"; then
    fail "la interfaz $HOST no existe en esta máquina (¿está activa la red host-only?)"
    exit 1
  fi
}

up_db() {
  if docker exec odoo-spike-db-1 pg_isready -U odoo >/dev/null 2>&1; then ok "postgres ya estaba arriba"; return; fi
  "${COMPOSE[@]}" up -d db >/dev/null 2>&1
  # Odoo se cae al arrancar si Postgres aún no acepta conexiones: se espera antes de seguir.
  if wait_for 90 docker exec odoo-spike-db-1 pg_isready -U odoo; then ok "postgres"; else fail "postgres no respondió"; exit 1; fi
}

up_odoo() {
  if odoo_up; then ok "odoo ya estaba arriba (:8069)"; return; fi
  "${COMPOSE[@]}" up -d >/dev/null 2>&1
  if wait_for 180 odoo_up; then ok "odoo (:8069)"; else fail "odoo no respondió: docker logs odoo-spike-odoo-1"; exit 1; fi
}

# Los Django se lanzan DESDE SU CARPETA: su base sqlite es una ruta relativa (DJANGO_DB_NAME=db.sqlite3), y lanzados
# desde otra carpeta crean una base vacía ahí y responden 500 («no such table»). Con --noreload no ven cambios de Python:
# tras editar hay que reiniciarlos (scripts/dev.sh down && scripts/dev.sh up).
up_django() {
  local name=$1 port=$2 check=$3
  if $check; then ok "$name ya estaba arriba (:$port)"; return; fi
  launch "$name" "$ROOT/$name" venv/bin/python manage.py runserver "$HOST:$port" --noreload
  if wait_for 60 $check; then ok "$name (:$port)"
  else fail "$name no respondió bien: revisa $LOGS/$name.log"; fi
  if [[ -f $ROOT/db.sqlite3 ]]; then warn "hay un db.sqlite3 en la raíz del repo: algún Django se lanzó desde la carpeta equivocada"; fi
}

# Next compila cada pantalla la primera vez que se visita: el puerto abre enseguida, pero la primera carga tarda.
up_next() {
  local name=$1 port=$2; shift 2
  if port_open "$port"; then ok "$name ya estaba arriba (:$port)"; return; fi
  launch "$name" "$ROOT/$name" "$@"
  if wait_for 90 port_open "$port"; then ok "$name (:$port) — la primera visita a cada pantalla compila"
  else fail "$name no abrió el puerto $port: revisa $LOGS/$name.log"; fi
}

cmd_up() {
  echo "Levantando Waiter en $HOST"
  check_host
  if ! redis-cli ping >/dev/null 2>&1; then warn "redis no responde: la caché de la carta del comensal no funcionará"; fi
  up_db
  up_odoo
  up_django registry 8002 registry_up
  up_django experience 8001 experience_up
  up_next pos 3000 npx next dev --hostname "$HOST" --port 3000
  up_next diner 3001 npm run dev
  echo
  cmd_status
}

cmd_status() {
  echo "Estado"
  docker exec odoo-spike-db-1 pg_isready -U odoo >/dev/null 2>&1 && ok "postgres" || fail "postgres"
  odoo_up && ok "odoo        http://$HOST:8069" || fail "odoo        :8069"
  registry_up && ok "registro    http://$HOST:8002" || fail "registro    :8002"
  local e; e=$(code "http://$HOST:8001/api/v1/$REST/$SEDE/ubicacion/" 20)
  if [[ $e == 200 ]]; then ok "experiencia http://$HOST:8001"
  elif [[ $e == 000 ]]; then fail "experiencia :8001 (no responde)"
  else fail "experiencia :8001 responde $e (¿base vacía? ver $LOGS/experience.log)"; fi
  port_open 3000 && ok "pos         http://$HOST:3000" || fail "pos         :3000"
  port_open 3001 && ok "comensal    http://$HOST:3001" || fail "comensal    :3001"
}

cmd_down() {
  echo "Deteniendo Waiter"
  local name pid
  for name in diner pos experience registry; do
    if pid_alive "$name"; then
      pid=$(cat "$LOGS/$name.pid")
      kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null  # el grupo entero: npx y next dev son procesos hijos
      ok "$name"
    fi
    rm -f "$LOGS/$name.pid"
  done
  "${COMPOSE[@]}" stop >/dev/null 2>&1 && ok "odoo y postgres (contenedores detenidos, datos intactos)"
}

case "${1:-up}" in
  up) cmd_up ;;
  status) cmd_status ;;
  down) cmd_down ;;
  *) echo "uso: $0 {up|status|down}"; exit 2 ;;
esac
exit "$FAILED"
