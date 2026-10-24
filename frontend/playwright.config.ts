import { defineConfig, devices } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '3333';
const frontendPort = process.env.E2E_FRONTEND_PORT ?? '5173';
const apiUrl = `http://127.0.0.1:${apiPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? 'postgresql://greencode:greencode_dev@127.0.0.1:5433/greencode?schema=public';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: frontendUrl,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../backend',
      url: `${apiUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL: databaseUrl ?? '',
        JWT_SECRET: process.env.JWT_SECRET ?? 'e2e-secret-for-local-development-at-least-32-characters',
        PORT: apiPort,
        HOST: '127.0.0.1',
        FRONTEND_ORIGIN: frontendUrl,
      },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort}`,
      url: frontendUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_URL: `${apiUrl}/api` },
    },
  ],
});
