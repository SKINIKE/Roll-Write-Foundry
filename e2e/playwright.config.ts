import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from '@playwright/test';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './tests',
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'pnpm --filter @rwf/app-desktop dev:web',
    cwd: path.resolve(currentDir, '..'),
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
