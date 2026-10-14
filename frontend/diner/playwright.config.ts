import { defineConfig, devices } from '@playwright/test'

// El comensal ya no es una app aparte: es el host del menú de la app única (proxy.ts). Las pruebas entran por
// menu.localhost, que Chromium resuelve a 127.0.0.1; en la VM se cambia con PLAYWRIGHT_BASE_URL.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://menu.localhost:3001'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  expect: { timeout: 15_000 },
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'Mobile Chrome', use: { ...devices['Pixel 7'] } }],
  // El servidor es el de toda la app (frontend/); se espera por el puerto porque Node no siempre resuelve *.localhost.
  webServer: { command: 'npm run dev -- --port 3001', cwd: '..', port: 3001, reuseExistingServer: true, timeout: 120_000 },
})
