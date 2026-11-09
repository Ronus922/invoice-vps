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
  // receipt scan — every method is answered by the proxy before the handler, so GET proves the gate for the POST-only routes too
  '/api/scan/ocr',
  '/api/scan/save',
  '/api/scan/duplicate',
  '/api/scan/00000000-0000-4000-8000-000000000000/image',
]

test.describe('שער אימות', () => {
  test('עמוד הבית מפנה משתמש לא מאומת ל-/login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  for (const route of ['/api/scan/ocr', '/api/scan/save']) {
    test(`POST ${route} ללא session מחזיר 401 ולא מעבד תמונה`, async ({ request }) => {
      const res = await request.post(route, { multipart: { image: { name: 'x.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) } } })
      expect(res.status()).toBe(401)
    })
  }

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
