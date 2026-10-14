import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://192.168.56.10:3001'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  expect: { timeout: 15_000 },
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'Mobile Chrome', use: { ...devices['Pixel 7'] } }],
  webServer: { command: 'npx next dev --hostname 192.168.56.10 --port 3001', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
})
