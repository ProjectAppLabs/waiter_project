import { defineConfig } from '@playwright/test'

const baseURL = process.env.POS_URL ?? 'http://127.0.0.1:3117'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/pago/ronda.spec.ts', '**/historial/ronda.spec.ts', '**/acceso/ronda.spec.ts', '**/pedidos/ronda.spec.ts', '**/consolas/ronda.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.WAITER_PLAYWRIGHT_REPORT ?? '../test-results/improvement/2026-10-08-waiter-r2/playwright.json' }],
  ],
  globalSetup: './e2e/helpers/setupRonda.ts',
  use: {
    baseURL,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
})
