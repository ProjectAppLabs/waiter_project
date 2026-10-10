// Plan D: MapLibre decodifica el mapa en un trabajador web; el empaquetador de Next no lo publica solo, así que se
// copia a public/mapas en cada instalación (misma versión que el paquete instalado).
const fs = require('node:fs')
const path = require('node:path')
const from = path.join(__dirname, '../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs')
const to = path.join(__dirname, '../../public/mapas/maplibre-gl-worker.mjs')
if (fs.existsSync(from)) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}
