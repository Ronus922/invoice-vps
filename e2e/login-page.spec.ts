import { test, expect } from '@playwright/test'

test.describe('עמוד התחברות', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('נטען בעברית ומימין לשמאל', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('html')).toHaveAttribute('lang', 'he')
    await expect(page).toHaveTitle(/InvoiceFlow/)
  })

  test('כפתור התחברות עם Google מוצג', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'התחבר עם Google' })).toBeVisible()
  })

  test('טופס אימייל וסיסמה נפתח מהקישור המשני', async ({ page }) => {
    // לחיצה לפני ש-React hydration חיבר את ה-handler נבלעת — לכן לוחצים שוב עד שהטופס מופיע
    await expect(async () => {
      await page.getByRole('button', { name: 'אפשרויות התחברות נוספות' }).click()
      await expect(page.locator('#email')).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 15_000 })
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'התחבר', exact: true })).toBeVisible()
  })

  test('אין גלילה אופקית', async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
