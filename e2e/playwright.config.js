// Testes de ponta a ponta do site (pasta ../web) com a API simulada (ver tests/api-simulada.js).
import { defineConfig, devices } from '@playwright/test';

const PORTA = 5600;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORTA}`,
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'computador', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx http-server ../web -p ${PORTA} -c-1 -s`,
    url: `http://localhost:${PORTA}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
