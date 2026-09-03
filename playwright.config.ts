import { defineConfig, devices } from '@playwright/test'

// ברירת מחדל: מרים next dev על פורט 3010 (לא מתנגש עם הפרודקשן על 3002).
// לבדיקת עשן מול שרת רץ (כולל פרודקשן):
//   E2E_BASE_URL=http://127.0.0.1:3002 pnpm test:e2e
// localhost ולא 127.0.0.1 — next dev חוסם משאבי dev ממקור אחר ושובר hydration
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3010'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm exec next dev --port 3010',
        url: 'http://localhost:3010/login',
        reuseExistingServer: true,
        timeout: 120_000,
      },
})
