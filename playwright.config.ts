import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5197', headless: true, trace: 'retain-on-failure' },
})
