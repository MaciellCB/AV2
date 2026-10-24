import { defineConfig, devices } from '@playwright/test';

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? 'postgresql://greencode:greencode_dev@127.0.0.1:5433/greencode?schema=public';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../backend',
      url: 'http://127.0.0.1:3333/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL: databaseUrl ?? '',
        JWT_SECRET: process.env.JWT_SECRET ?? 'e2e-secret-for-local-development-at-least-32-characters',
        PORT: '3333',
        HOST: '127.0.0.1',
        FRONTEND_ORIGIN: 'http://127.0.0.1:5173',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_URL: 'http://127.0.0.1:3333/api' },
    },
  ],
});
