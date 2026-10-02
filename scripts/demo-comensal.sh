#!/usr/bin/env bash
# Recorrido del comensal contra la experiencia levantada (:8001), que sirve todo desde el sistema propio.
# Uso: scripts/demo-comensal.sh [TOKEN_DE_MESA]   (sin token: usa el de la mesa 8 de la demo)
set -u
API=${EXPERIENCE_URL:-http://192.168.56.10:8001}
REST=${REST:-burger-house}; SEDE=${SEDE:-poblado}
TOKEN=${1:-$(cd "$(dirname "$0")/../experience" && venv/bin/python manage.py shell -v 0 --no-imports -c "from tables.models import Table as T; print(T.objects.get(number=8, active=True, floor__restaurant__slug='$SEDE', floor__restaurant__organization__slug='$REST').token)" | tail -1)}
JAR=$(mktemp)
j() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
echo "1) Toca el NFC de la mesa: GET /api/v1/$REST/$SEDE/t/$TOKEN/"
curl -s "$API/api/v1/$REST/$SEDE/t/$TOKEN/" | j "'   mesa', d['contexto']['mesa']['numero'], '·', len(d['carta']['categorias']), 'categorías ·', sum(len(c['productos']) for c in d['carta']['categorias']), 'productos'"
echo "2) Abre sesión (cookie waiter_diner): POST /api/v1/sesiones/"
SID=$(curl -s -c "$JAR" -b "$JAR" -H 'Content-Type: application/json' -d "{\"restaurante\":\"$REST\",\"sede\":\"$SEDE\",\"token\":\"$TOKEN\"}" "$API/api/v1/sesiones/" | j "d['sesion']['id']")
echo "   sesión $SID"
echo "3) Agrega 2× Hamburguesa Angus y 1× Limonada de Coco"
ANGUS=$(curl -s "$API/api/v1/$REST/$SEDE/t/$TOKEN/" | j "next(p['id'] for c in d['carta']['categorias'] for p in c['productos'] if 'Angus' in p['nombre'])")
LIMON=$(curl -s "$API/api/v1/$REST/$SEDE/t/$TOKEN/" | j "next(p['id'] for c in d['carta']['categorias'] for p in c['productos'] if 'Limonada' in p['nombre'])")
curl -s -b "$JAR" -H 'Content-Type: application/json' -d "{\"producto_id\":$ANGUS,\"cantidad\":2,\"nota\":\"término medio\"}" "$API/api/v1/sesiones/$SID/lineas/" > /dev/null
curl -s -b "$JAR" -H 'Content-Type: application/json' -d "{\"producto_id\":$LIMON}" "$API/api/v1/sesiones/$SID/lineas/" | j "'   carrito: total', d['total'], '· mío', d['mio'], '·', len(d['lineas']), 'líneas'"
echo "4) Confirma: POST /api/v1/sesiones/$SID/confirmar/  → sistema propio → cocina"
PEDIDO=$(curl -s -b "$JAR" -X POST "$API/api/v1/sesiones/$SID/confirmar/" | j "d['pedido'] + ' total ' + str(d['total'])")
echo "   pedido $PEDIDO"
echo "5) Estado: GET /api/v1/pedidos/${PEDIDO%% *}/"
curl -s -b "$JAR" "$API/api/v1/pedidos/${PEDIDO%% *}/" | j "'   estado', d['estado'], '· total', d['total'], '· impuestos', d['impuestos']"
rm -f "$JAR"
