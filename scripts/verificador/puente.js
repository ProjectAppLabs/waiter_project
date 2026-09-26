// Plan K, paquete B: puente TCP 127.0.0.1:3001 → WAITER_HOST:3001 para que el Edge de Windows llegue al comensal.
// En WSL2 con red en espejo, el firewall de Hyper-V no deja que Windows abra la IP de la LAN del propio equipo, pero sí
// localhost, que WSL comparte. El verificador usa DINER_URL=http://localhost:3001 y pasa por aquí. Sin WAITER_HOST toma
// la IP de salida de la máquina, igual que scripts/dev.sh. Se instala como servicio con scripts/verificador/waiter-puente.service.
const net = require('net')
const { execSync } = require('child_process')
function hostIp() {
  if (process.env.WAITER_HOST) return process.env.WAITER_HOST
  try { return execSync('ip -4 route get 1.1.1.1', { encoding: 'utf8' }).match(/src (\S+)/)[1] } catch { return '127.0.0.1' }
}
const host = hostIp(), port = Number(process.env.WAITER_PORT || 3001)
net.createServer((client) => {
  const upstream = net.connect(port, host)
  client.pipe(upstream).pipe(client)
  client.on('error', () => upstream.destroy()); upstream.on('error', () => client.destroy())
}).listen(port, '127.0.0.1', () => console.log(`puente 127.0.0.1:${port} → ${host}:${port}`))
