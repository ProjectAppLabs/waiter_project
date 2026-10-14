#!/usr/bin/env bash
# Plan D: descarga el mapa vectorial (Protomaps, datos de OpenStreetMap) para el mapa de domicilio del comensal.
# Uso: scripts/mapas/descargar.sh [región] — «colombia» (predeterminada, ~920 MB) o «medellin» (12 MB, para pruebas).
# El archivo queda en public/mapas/<región>.pmtiles (no va a git). En producción se sirve desde el mismo servidor del
# comensal o un CDN con soporte de rangos (Range); NEXT_PUBLIC_MAP_TILES apunta a otra ruta si hace falta.
set -euo pipefail
cd "$(dirname "$0")/../.."
region="${1:-colombia}"
case "$region" in
  colombia) bbox="-79.1,-4.3,-66.8,13.4" ;;
  medellin) bbox="-75.72,6.05,-75.45,6.40" ;;
  *) echo "Región desconocida: $region (usa colombia o medellin)"; exit 1 ;;
esac
tools="${HOME}/.cache/waiter-maps/bin"
mkdir -p "$tools" public/mapas
if [ ! -x "$tools/pmtiles" ]; then
  version="1.31.2"
  curl -sL "https://github.com/protomaps/go-pmtiles/releases/download/v${version}/go-pmtiles_${version}_Linux_x86_64.tar.gz" | tar -xz -C "$tools" pmtiles
fi
# El último mapa mundial completo publicado (se construye a diario).
build=$(curl -s https://build-metadata.protomaps.dev/builds.json | python3 -c "import json,sys; print(json.load(sys.stdin)[-2]['key'])")
echo "Recortando ${region} de ${build}…"
"$tools/pmtiles" extract "https://build.protomaps.com/${build}" "public/mapas/${region}.pmtiles.tmp" --bbox="$bbox"
mv "public/mapas/${region}.pmtiles.tmp" "public/mapas/${region}.pmtiles"
echo "Listo: public/mapas/${region}.pmtiles"
