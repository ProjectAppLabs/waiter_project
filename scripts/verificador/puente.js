// Plan K, paquete B: puente 127.0.0.1:<puerto> → WAITER_HOST:<puerto> para los puertos de desarrollo.
// En WSL2 con red en espejo, Windows no llega a los servicios de WSL por la IP de la LAN del propio equipo (salvo con
// hostAddressLoopback=true en .wslconfig), pero sí por localhost, que ambos comparten. Así el Edge del verificador abre
// http://localhost:3001 y el navegador de Windows puede usar localhost para el comensal, el POS y experience.
// Sin WAITER_HOST toma la IP de salida de la máquina, igual que scripts/dev.sh. Servicio: waiter-puente.service.
const net = require('net')
const { execSync } = require('child_process')
// Misma elección que scripts/dev.sh: la red host-only 192.168.56.10 si existe; si no, la IP de salida de la máquina.
function hostIp() {
  if (process.env.WAITER_HOST) return process.env.WAITER_HOST
  try { if (/ 192\.168\.56\.10\//.test(execSync('ip -4 addr show', { encoding: 'utf8' }))) return '192.168.56.10' } catch {}
  try { return execSync('ip -4 route get 1.1.1.1', { encoding: 'utf8' }).match(/src (\S+)/)[1] } catch { return '127.0.0.1' }
}
const host = hostIp()
const ports = (process.env.WAITER_PORTS || '3000,3001,8001').split(',').map(Number).filter(Boolean)
for (const port of ports) {
  net.createServer((client) => {
    const upstream = net.connect(port, host)
    client.pipe(upstream).pipe(client)
    client.on('error', () => upstream.destroy()); upstream.on('error', () => client.destroy())
  }).on('error', (error) => console.error(`puente ${port}: ${error.message}`))
    .listen(port, '127.0.0.1', () => console.log(`puente 127.0.0.1:${port} → ${host}:${port}`))
}
