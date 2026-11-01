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
- התפקיד `invoice_app` (ה-`DIRECT_URL` של סקריפטי `check:*` והסקריפטים החד-פעמיים)
  **בלי `CREATEDB`** מאז 31/10/2026.
  - למה: האפליקציה עצמה לא מתחברת איתו (אין בקוד לקוח Postgres ישיר, היא עובדת מול
    Supabase דרך REST). הבדיקה היחידה שיצרה מסד, `check:dupes` חלק 2, עברה ל-CI על
    Postgres חד-פעמי. אין סיבה שתפקיד של האפליקציה יוכל ליצור מסדים בקלאסטר המשותף.
  - נשארו לו `BYPASSRLS` והחברות ב-`pg_signal_backend`.
  - צריך מסד זמני? מריצים אותו על Postgres חד-פעמי, לא על `supabase-db`.
    החזרה (רק באישור רונן): `ALTER ROLE invoice_app CREATEDB;` כ-`postgres`.
  - **`invoice_app` נשאר עם הרשאות כתיבה ועם `BYPASSRLS` בכוונה** (החלטת רונן, 1/11/2026,
    אחרי מיפוי כל השימושים בו). אין `REVOKE` על טבלאות, על sequences או על default
    privileges. לא מציעים את זה שוב בלי החלטה חדשה.
    - למה כתיבה: ארבעה סקריפטים תפעוליים כותבים דרכו, ומורצים ידנית, לא אוטומטית:
      `dedup-cleanup` (DELETE), `backfill-derive-vat` ו-`apply-reextract` (UPDATE),
      `backfill-doc-type` (DDL ו-UPDATE; ה-DDL כבר נכשל כי התפקיד אינו הבעלים).
      `check:dupes` מפנה ל-`dedup-cleanup` בהודעת הכשל שלו, ולכן הסרת הכתיבה הייתה שוברת
      את נוהל התיקון.
    - למה אין טעם להגביל: מפתח ה-service-role (`SUPABASE_SERVICE_ROLE_KEY`) יושב על אותו
      שרת ונותן ממילא גישה מלאה לכל הנתונים. הגבלת `invoice_app` לא מצמצמת את הסיכון
      בפועל, והיא רק מוסיפה חיכוך לסקריפטים.
    - סקריפטי `check:*` על ה-DB האמיתי קוראים בלבד (SELECT). `check:dupes` חלק 2 כותב רק
      ל-Postgres חד-פעמי ב-CI, לעולם לא דרך `DIRECT_URL`.
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
- **בדיקת עשן מאומתת אחרי פריסה (משתמש בדיקה) לא נבנתה, בכוונה (31/10/2026).**
  באפליקציה אין רמות הרשאה: כל משתמש שנמצא ב-`ALLOWED_EMAILS` מקבל גישה מלאה (קריאה,
  כתיבה, מחיקה, העלאה, סריקה, גיבוי ושליחה לרו"ח). משתמש בדיקה ייעודי עם סיסמה בקובץ
  על השרת היה מפתח ראשי לכל הנתונים.
  - במקום זה: אחרי שדרוג framework או שינוי ב-auth, בדיקה ידנית בדפדפן: התחברות,
    רשימת החשבוניות, ההגדרות, ומצב הגיבוי ל-Drive (צפייה בלבד, בלי להפעיל גיבוי).
  - מה כן אוטומטי ב-`deploy.sh`: health ובדיקת ה-proxy (`/zz-proxy-probe` מחזיר 307,
    `/api/zz-proxy-probe` מחזיר 401). שתיהן בלי התחברות, ולכן לא מוכיחות שמשתמש
    מחובר רואה נתונים.
  - ההחלטה תיבדק מחדש אם תתווסף שכבת הרשאות (למשל צפייה בלבד).
- **ה-job `dupes-isolated` תלוי ב-Docker Hub.** הוא required ב-ruleset של `main`
  ומושך את ה-image `postgres:15.8`. נפל בגלל משיכת image (שגיאת pull, rate limit או
  תקלה ב-Docker Hub, לפני שהבדיקה עצמה התחילה): **Re-run** של ה-job
  (`gh run rerun <run-id> --failed`, או הכפתור ב-GitHub), לא bypass. ל-ruleset אין
  bypass, ולא מסירים את הצ'ק מרשימת ה-required. נפל אחרי שה-Postgres עלה: זה כשל
  אמיתי של האינדקס הייחודי, וחוקרים אותו.
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
