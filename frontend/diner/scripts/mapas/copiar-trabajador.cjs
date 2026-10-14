// Plan D: MapLibre decodifica el mapa en un trabajador web; el empaquetador de Next no lo publica solo, así que se
// copia a public/mapas en cada instalación (misma versión que el paquete instalado). Con los workspaces de
// frontend/ el paquete suele quedar elevado a frontend/node_modules, así que se busca subiendo de carpeta. Falla
// fuerte si no lo encuentra: sin el trabajador, el mapa del comensal se rompe en silencio.
const fs = require('node:fs')
const path = require('node:path')
const app = path.join(__dirname, '../..')
const to = path.join(app, 'public/mapas/maplibre-gl-worker.mjs')
let from = null
for (let dir = app; !from; dir = path.dirname(dir)) {
  const candidato = path.join(dir, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs')
  if (fs.existsSync(candidato)) from = candidato
  else if (path.dirname(dir) === dir) break
}
if (!from) {
  console.error('copiar-trabajador: no encontré maplibre-gl/dist/maplibre-gl-worker.mjs en ningún node_modules; corré npm ci en frontend/.')
  process.exit(1)
}
fs.mkdirSync(path.dirname(to), { recursive: true })
fs.copyFileSync(from, to)
