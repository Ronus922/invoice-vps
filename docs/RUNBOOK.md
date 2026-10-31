# RUNBOOK — invoice-vps (InvoiceFlow)

נוהל תגובה לתקלה. שמות משתנים ושמות שירותים בלבד, בלי ערכי סודות.
שדה שעוד לא ידוע כתוב "טרם הוגדר".
הריפו ציבורי, ולכן אין כאן נתיבי שרת וכתובות פנימיות. הם בקובץ ה-env של השרת
ובהגדרות ה-systemd, לא בגיט.

## זהות

- דומיין: <https://invoice.bios.co.il>
- תיקייה בשרת: לא מתועדת כאן (ריפו ציבורי)
- תהליכים (systemd, לא pm2):
  - `invoice.service`: שרת ה-Next (standalone). מאזין על loopback בלבד, ו-nginx הוא
    היחיד שחשוף החוצה. הפורט נקבע ב-`PORT` בקובץ ה-env של השרת.
  - `invoice-gmail-scan.timer`: **מושבת בכוונה** (10/2026, לפי בקשת רונן) — סריקה
    ידנית בלבד. קבצי ה-unit ו-`scripts/install-gmail-scan-timer.sh` נשארו כדי שאפשר
    יהיה להחזיר; החזרה רק באישור רונן.
  - `invoice-backup.timer`: גיבוי קבצים ל-Google Drive, ב-1 לכל חודש 03:00 UTC
  - טיימר הגיבוי קורא לאפליקציה עצמה (`/api/backup-to-drive`, באימות `CRON_SECRET`).
    אם `invoice.service` למטה, הוא לא ירוץ.
- קובץ env בשרת: לא מתועד כאן (ריפו ציבורי). השירות קורא אותו דרך `EnvironmentFile`
  ב-`invoice.service`. שמות המשתנים: `.env.local.example`.
- DB: Supabase self-hosted בקונטיינר `supabase-db`, סכמת `public` במסד `postgres`.
- מיגרציות: **מנגנון אחר, לא dbmate** (סעיף 7 בתבנית ההקשחה; החלטת רונן, 11/10/2026).
  קובצי SQL ב-`supabase/migrations/` מוחלים ידנית כ-`postgres`:
  `docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/<file>.sql`.
  אין טבלת לדג'ר, ולכן את המצב מאמתים מול הסכמה עצמה. שום מיגרציה לא רצה על פרוד
  בלי גיבוי טרי ואישור של רונן.

## ניטור

- Health: <https://invoice.bios.co.il/api/health>
  - `200 {"ok":true,"db":true}`: תקין
  - `503 {"ok":false,"db":false}`: ה-DB לא מגיב תוך 5 שניות
  - `502` / `504` מ-nginx: התהליך למטה או תקוע
- UptimeRobot: מוניטור "invoice-vps health" (טרם הוגדר)
  - HTTP(s), URL: `https://invoice.bios.co.il/api/health`
  - אינטרוול 5 דקות, התרעה על כל סטטוס שאינו 200, איש קשר: מייל מאומת
- Sentry: `bios-s2/invoice-vps` (טרם הוגדר). צד שרת בלבד, opt-in דרך `SENTRY_DSN`.
  - שורה אחת בכל עלייה: `journalctl -u invoice.service -n 200 --no-pager | grep '\[sentry\]'`
    מציגה "Sentry initialized" או "Sentry disabled (no DSN)".
  - נתפסות שגיאות שלא טופלו (`onRequestError`). routes שתופסים שגיאה ומחזירים 500
    בעצמם לא מגיעים ל-Sentry, רק ל-journal.
  - Sentry MCP: `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp/bios-s2/invoice-vps`
    ואז `/mcp` ו-Authenticate (OAuth של רונן).

## תגובה לקריסה

1. `curl -s -o /dev/null -w '%{http_code}\n' https://invoice.bios.co.il/api/health` ובדיקת
   UptimeRobot, כדי להבחין בין אפליקציה, DB ורשת.
2. `systemctl status invoice.service --no-pager`, ואז 50 שורות לוג אחרונות:
   `journalctl -u invoice.service -n 50 --no-pager`. ל-DB: `docker ps --filter name=supabase-db`.
   לטיימרים: `journalctl -u invoice-gmail-scan.service -n 50` / `journalctl -u invoice-backup.service -n 50`.
3. Sentry: יש אירוע חדש שמסביר את התקלה? אם Sentry MCP מחובר, שואלים דרכו.
4. פריסה אחרונה חשודה: revert דרך PR (`main` מוגן, אין push ישיר), merge, ואז
   `bash scripts/deploy.sh`. לעולם לא `git reset --hard` על פרוד: הסקריפט מריץ
   `git pull --ff-only` ומחזיר את הקומיט מ-`origin/main`. ה-"previous commit" ש-`deploy.sh`
   מדפיס הוא נקודת ייחוס, לא פקודה להרצה.
5. DB פגוע: שחזור לפי נוהל הגיבוי (סעיף גיבויים), **קודם ל-DB בדיקה**. שחזור על פרוד
   רק עם גיבוי טרי ואישור מפורש של רונן.
6. כל פעולה שמשנה מצב מדווחת לרונן לפני ביצוע. עצירת התהליך: `sudo systemctl stop invoice.service`
   או `kill <PID>`. לעולם לא `pkill -f` או `killall`, כי על השרת רצים תהליכי production
   של פרויקטים אחרים.

## פריסה

- פקודה: מ-`main` בלבד, עם עץ נקי: `git checkout main && git pull && bash scripts/deploy.sh`.
  לפני PR מריצים `pnpm check:all` על השרת, כי ארבע בדיקות ה-DB לא רצות ב-CI.
- אימות: `deploy.sh` מחכה עד 30 שניות לתשובה מהאפליקציה אחרי ה-restart. אימות
  BUILD_ID (build מוגש = build בדיסק) ובדיקת `/api/health` בתוך הסקריפט: טרם הוגדרו.
- **לא בונים בתיקיית האפליקציה מענף אחר.** השירות מגיש ישירות מ-`.next/standalone`
  שלה, ו-build שם מחליף את מה שרץ. בדיקת build של ענף: `git worktree add` לתיקייה
  זמנית, ובונים שם.

## גיבויים

- דלי: ה-restic repository של billing (B2, משותף). אין דלי ייעודי ל-invoice.
- יחידת גיבוי: `billing-backup.service` (פרויקט almogbilling), יומי 03:00 UTC:
  - `pg_dumpall` של כל ה-cluster של `supabase-db`, כולל טבלאות InvoiceFlow
    (dump מקומי ל-7 ימים + restic off-site, 7d/4w/6m)
  - snapshot של קובצי ה-Storage עם `--tag storage`, כולל הבאקט `invoice-files`
- עותק נוסף של הקבצים: `invoice-backup.timer` שולח חודשית ל-Google Drive.
- **תלות:** הגיבוי של הפרויקט הזה נשען כולו על `billing-backup.service`. שינוי או
  השבתה שם מפסיקים גם את הגיבוי כאן. הנוהל המלא: `docs/backup.md` בריפו almogbilling.
- דריל: טרם הוגדר לפרויקט הזה. שחזור ידני לקונטיינר זמני, עם הסקריפט של billing:
  `RESTORE_DB=postgres VERIFY_TABLES="public.invoices public.gmail_tokens public.scanned_emails" scripts/backup/pg-restore.sh --keep <cluster-dump>`
  (מתוך ריפו almogbilling, כ-root; `--keep` לפני הקובץ). משווים את הספירות מול הפרוד.
- משמורת מפתח ההצפנה: מפתח ה-restic של billing, במנהל הסיסמאות של רונן (לפי תבנית
  ההקשחה; לא נבדק במסגרת הפרויקט הזה).
