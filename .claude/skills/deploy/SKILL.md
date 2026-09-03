---
name: deploy
description: פריסת InvoiceFlow לפרודקשן דרך scripts/deploy.sh — כולל בדיקות מקדימות, אימות בריאות ונוהל rollback. להפעלה ידנית בלבד.
disable-model-invocation: true
---

# פריסה לפרודקשן — InvoiceFlow

פריסה רצה **רק מ-`main`** ורק דרך `scripts/deploy.sh`. אין לפרוס בשום דרך אחרת.

## שלב 1 — בדיקות מקדימות (חובה, לפי הסדר)

1. ודא branch ועץ נקי:
   ```bash
   git rev-parse --abbrev-ref HEAD   # חייב להיות main
   git status --porcelain            # חייב להיות ריק
   ```
2. הרץ את כל שערי האיכות והאינווריאנטים הפיננסיים:
   ```bash
   pnpm check:all
   ```
   אם משהו נכשל — **עצור**. אין לפרוס עם check אדום. תקן, commit, והתחל מחדש.
3. ודא שכל מה שאמור להיפרס נדחף ל-origin (`git log origin/main..main` ריק) — הסקריפט מושך מ-origin, לא מהעץ המקומי.

## שלב 2 — פריסה

```bash
bash scripts/deploy.sh
```

הסקריפט עושה: ff-pull מ-origin → `pnpm install --frozen-lockfile --prod=false` → `pnpm build` (כולל שער lint) → restart ל-`invoice.service` → health check על 127.0.0.1:3002 (עד 30 שניות).

שמור את שורת "previous commit" שהסקריפט מדפיס — זו נקודת ה-rollback.

## שלב 3 — אימות

- הסקריפט מסתיים ב-`✓ deploy ok: <old> → <new>`. אם ה-health check נכשל הוא מדפיס את 30 שורות הלוג האחרונות של השירות.
- הרץ בדיקת עשן E2E מול הפרודקשן החי (קריאה בלבד — שער אימות + עמוד login):
  ```bash
  E2E_BASE_URL=http://127.0.0.1:3002 pnpm test:e2e
  ```
- בדיקה ידנית נוספת: `systemctl status invoice.service` ו-`journalctl -u invoice.service -n 30 --no-pager`.

## Rollback

```bash
git reset --hard <previous>   # ה-commit שהודפס לפני המשיכה
bash scripts/deploy.sh
```

## מוקשים ידועים — אל תיגע

- **nginx**: הקונפיג החי הוא **קובץ רגיל** ב-`/etc/nginx/sites-enabled/invoice` (לא symlink!) ומכיל `client_max_body_size 20M`. העותק ב-sites-available חסר את השורה — יצירת symlink מחדש תשבור בשקט העלאות מעל 1MB.
- **`--prod=false`** בסקריפט הוא מכוון (מבטיח eslint ב-devDependencies עבור שער ה-build). אסור להסיר.
- **env בפרודקשן**: השירות קורא מ-`/etc/invoice/invoice.env` (root:600). `.env.local` משמש רק builds/סקריפטים כמשתמש ubuntu. שינוי env לפרודקשן = עריכת הקובץ ב-/etc (דרך sudo) + restart.
