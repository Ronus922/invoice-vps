import { test, expect } from '@playwright/test'

// כל הבדיקות בקובץ הזה לא-מאומתות בכוונה — הן מוודאות שהשערים סגורים.
// אסור להוסיף כאן בדיקה ששולחת credentials אמיתיים או x-cron-secret אמיתי:
// חבילת ה-E2E רצה גם מול פרודקשן, וכל בקשה מאומתת עלולה להפעיל סריקה/שליחה אמיתית.

const protectedApiRoutes = [
  '/api/invoices',
  '/api/upload',
  '/api/extract-invoice',
  '/api/scan-gmail',
  '/api/scan-state',
  '/api/send-to-accountant',
  '/api/backup-to-drive',
  '/api/settings/accountant-email',
  '/api/file',
  '/api/folder-watch/scan-state',
  '/api/gmail-auth',
]

test.describe('שער אימות', () => {
  test('עמוד הבית מפנה משתמש לא מאומת ל-/login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  for (const route of protectedApiRoutes) {
    test(`GET ${route} ללא session מחזיר 401`, async ({ request }) => {
      const res = await request.get(route)
      expect(res.status()).toBe(401)
    })
  }

  test('cron secret שגוי אינו פותח את scan-gmail', async ({ request }) => {
    const res = await request.get('/api/scan-gmail', {
      headers: { 'x-cron-secret': 'definitely-wrong-secret' },
    })
    expect(res.status()).toBe(401)
  })

  test('cron secret שגוי אינו פותח את backup-to-drive', async ({ request }) => {
    const res = await request.get('/api/backup-to-drive', {
      headers: { 'x-cron-secret': 'definitely-wrong-secret' },
    })
    expect(res.status()).toBe(401)
  })
})
