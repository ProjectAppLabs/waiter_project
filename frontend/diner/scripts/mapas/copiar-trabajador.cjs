// Plan D: MapLibre decodifica el mapa en un trabajador web; el empaquetador de Next no lo publica solo, así que se
// copia a public/mapas (misma versión que el paquete instalado). Con una sola app lo corre `npm run build`, no un
// postinstall: el instalador del fleet no corre scripts de instalación. El paquete se busca subiendo de carpeta y el
// script falla fuerte si no lo encuentra: sin el trabajador, el mapa del comensal se rompe en silencio.
const fs = require('node:fs')
const path = require('node:path')
const app = path.join(__dirname, '../../..')
const to = path.join(app, 'public/mapas/maplibre-gl-worker.mjs')
let from = null
for (let dir = app; !from; dir = path.dirname(dir)) {
  const candidato = path.join(dir, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs')
  if (fs.existsSync(candidato)) from = candidato
  else if (path.dirname(dir) === dir) break
}
if (!from) {
  console.error('copiar-trabajador: no encontré maplibre-gl/dist/maplibre-gl-worker.mjs en ningún node_modules; corre npm ci en frontend/.')
  process.exit(1)
}
fs.mkdirSync(path.dirname(to), { recursive: true })
fs.copyFileSync(from, to)
