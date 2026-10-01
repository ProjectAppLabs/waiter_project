#!/usr/bin/env bash
# Corre las pruebas de los addons de Odoo sobre una COPIA desechable de la base de desarrollo.
#
#   scripts/odoo-test.sh projectapp_ops                       todas las del addon
#   scripts/odoo-test.sh projectapp_ops,projectapp_reservations
#   scripts/odoo-test.sh projectapp_ops TestFloorPlan         solo una clase
#
# Encapsula lo que hace falta para que den un resultado cierto:
# - La copia se crea desde `projectapp` y se borra SIEMPRE al terminar (también si falla o se interrumpe).
# - `--db-filter` de la copia: el Odoo de desarrollo solo admite la base `projectapp`, y sin esto cierra la sesión en cada
#   petición HTTP de las pruebas («dbfilter rejects it») y las de pasarelas fallan por eso, no por el código.
# - Puerto HTTP propio (8075): el 8069 lo usa el Odoo en marcha.
# - Revisa el disco antes: una copia más con el disco lleno tumbó a Postgres el 2026-09-21.
# - Termina con 1 si alguna prueba falla o da error.
#
# Las pruebas deben poder correr sobre una copia de la base de desarrollo: no deben suponer que está vacía (usar un
# terminal propio, neutralizar la configuración que puedan heredar).
set -uo pipefail

ADDONS=${1:?uso: $0 <addon[,addon…]> [Clase]}
CLASS=${2:-}
SOURCE=${SOURCE:-projectapp}
DB="waiter_test_$$"
LOG=$(mktemp -t odoo-test-XXXX.log)
MIN_FREE_MB=2048

free_mb=$(df -Pm / | awk 'NR==2 {print $4}')
if (( free_mb < MIN_FREE_MB )); then
  echo "Quedan ${free_mb} MB libres en el disco: hacen falta al menos ${MIN_FREE_MB} MB para una copia de la base." >&2
  exit 1
fi

# KEEP_LOG=<ruta> guarda el registro completo (con las trazas) antes de borrarlo.
cleanup() { docker exec odoo-spike-db-1 dropdb -U odoo --if-exists --force "$DB" >/dev/null 2>&1; [[ -n ${KEEP_LOG:-} ]] && cp "$LOG" "$KEEP_LOG"; rm -f "$LOG"; }
trap cleanup EXIT

tags=""
IFS=',' read -ra list <<<"$ADDONS"
for addon in "${list[@]}"; do tags+="${tags:+,}/${addon}${CLASS:+:$CLASS}"; done

echo "Copiando $SOURCE → $DB…"
docker exec odoo-spike-db-1 sh -c "createdb -U odoo '$DB' && pg_dump -U odoo '$SOURCE' | psql -U odoo -q '$DB' >/dev/null 2>&1" || { echo "No se pudo crear la copia." >&2; exit 1; }
echo "Probando $tags…"
docker exec odoo-spike-odoo-1 odoo -d "$DB" --db-filter="^${DB}\$" -u "$ADDONS" --test-enable --test-tags "$tags" \
  --stop-after-init --http-port 8075 >"$LOG" 2>&1

grep -E "(FAIL|ERROR): " "$LOG" | sed -E 's/.* (FAIL|ERROR): /\1: /'
result=$(grep -E "odoo.tests.result: .* of [0-9]+ tests when loading database '$DB'" "$LOG" | sed -E "s/.*odoo.tests.result: //" | tail -1)
echo "${result:-No se encontró el resultado de las pruebas: ¿falló la actualización del addon?}"
# Cero pruebas no es un verde: suele ser un nombre de clase mal escrito.
if [[ $result == *" of 0 tests"* ]]; then echo "No corrió ninguna prueba: revisa el nombre del addon o de la clase." >&2; exit 1; fi
[[ $result == "0 failed, 0 error(s)"* ]]
