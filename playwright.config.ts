import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5175',
    // Usa el Chrome instalado en la máquina; no descarga navegadores.
    channel: 'chrome',
    viewport: { width: 390, height: 900 },
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
  },
  webServer: {
    // El modo e2e usa tests/e2e/env (sin credenciales) y arranca en modo local.
    command: 'npx vite --mode e2e --port 5175 --strictPort',
    url: 'http://localhost:5175',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
