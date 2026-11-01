# RUNBOOK — invoice-vps (InvoiceFlow)

נוהל תגובה לתקלה. שמות משתנים ושמות שירותים בלבד, בלי ערכי סודות.
שדה שעוד לא ידוע כתוב "טרם הוגדר".
הריפו ציבורי, ולכן אין כאן נתיבי שרת וכתובות פנימיות. הם בקובץ ה-env של השרת
ובהגדרות ה-systemd, לא בגיט. החריג היחיד הוא נתיבי ה-Node (סעיף Node), כי `/opt/node-24`
כתוב גם ב-`scripts/deploy.sh`.

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

## Node

- **גרסה:** Node 24 LTS ("Krypton"), מוצמד ל-`v24.22.2` (נכון ל-1/11/2026). `engines.node` ב-`package.json`
  הוא `>=24 <25`, `.nvmrc` הוא `24`, וה-CI רץ על Node 24. Renovate לא מציע Node או `@types/node`
  מעל 24 (מעבר לקו אחר הוא החלטה, לא PR אוטומטי).
- **איפה:** `/opt/node-v24.22.2-linux-x64` (tarball רשמי מ-nodejs.org, אומת מול `SHASUMS256.txt`),
  ו-`/opt/node-24` הוא symlink אליו (אותה תבנית כמו `/opt/node22` של billing). רק `invoice` משתמש בו.
  ה-Node של המערכת (`/usr/bin/node`, חבילת NodeSource 20 מ-apt) לא שונה. הוא משרת את sea-tower, את
  pm2 ואת שאר האפליקציות, ולכן לא מעדכנים אותו ולא משנים `PATH` או alias גלובלי בשביל invoice.
- **pnpm:** ה-shim של corepack ב-`/opt/node-24/bin/pnpm`; הגרסה נקבעת לפי `packageManager`.
  `deploy.sh` מוסיף את `/opt/node-24/bin` ל-`PATH` של הסקריפט בלבד, ויוצא ב-exit 1 אם `node` אינו v24
  או אם `pnpm` אינו ה-shim משם. אחרי ה-restart הוא בודק שהתהליך החי באמת רץ מ-`/opt/node-24`.
- **השירות:** drop-in ב-`/etc/systemd/system/invoice.service.d/node24.conf`
  (ה-`ExecStart=` הריק מבטל את השורה של היחידה המקורית; שאר היחידה לא שונתה):

  ```ini
  [Service]
  ExecStart=
  ExecStart=/opt/node-24/bin/node /var/www/invoice/.next/standalone/server.js
  ```

  אימות: `sudo readlink -f /proc/$(systemctl show -p MainPID --value invoice.service)/exe` מחזיר
  נתיב תחת `/opt/node-v24...`. חייבים `sudo`: השירות רץ עם `Group=devops-www`, ולכן משתמש ה-deploy
  מקבל `Permission denied` על `/proc/<pid>/exe` שלו (`deploy.sh` משתמש באותה דרך).
- **עדכון patch** (24.x.y חדש; הגרסה מ-<https://nodejs.org/dist/index.json>, רק שורת 24, תמיד מקובעת ולא latest):

  ```bash
  V=v24.x.y
  cd "$(mktemp -d)" && curl -fsSO "https://nodejs.org/dist/$V/node-$V-linux-x64.tar.xz" -O "https://nodejs.org/dist/$V/SHASUMS256.txt"
  grep " node-$V-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c -     # חייב להדפיס OK, אחרת עוצרים
  sudo mkdir "/opt/node-$V-linux-x64" && sudo tar -xJf "node-$V-linux-x64.tar.xz" --no-same-owner -C "/opt/node-$V-linux-x64" --strip-components=1
  sudo env PATH="/opt/node-$V-linux-x64/bin:$PATH" corepack enable --install-directory "/opt/node-$V-linux-x64/bin"
  readlink /opt/node-24                                                    # לרשום את הגרסה הנוכחית, זו נקודת החזרה
  sudo ln -sfn "node-$V-linux-x64" /opt/node-24
  cd /var/www/invoice && bash scripts/deploy.sh                            # בונה מחדש, מפעיל מחדש ומאמת Node החי
  ```

  נכשל? חוזרים לתיקייה הקודמת: `sudo ln -sfn node-<הקודמת>-linux-x64 /opt/node-24 && sudo systemctl restart invoice.service`.
  את התיקייה הקודמת מוחקים רק אחרי שהחדשה אומתה.
- **Rollback ל-Node 20** (פקודות מדויקות; עותק של היחידה המקורית נשמר ב-`/var/backups/invoice-node20/`):
  1. `git revert <merge-commit של ה-PR של Node 24>` דרך PR, ומיזוג (`gh pr merge --squash --delete-branch`).
     הגרסה המוחזרת של `deploy.sh` רצה על ה-Node הגלובלי.
  2. `sudo rm /etc/systemd/system/invoice.service.d/node24.conf && sudo rmdir /etc/systemd/system/invoice.service.d && sudo systemctl daemon-reload`
     (לא מפעיל מחדש בעצמו, השירות ממשיך לרוץ עד הפריסה).
  3. `cd /var/www/invoice && git pull --ff-only && bash scripts/deploy.sh`.
  4. אימות: `curl -s http://127.0.0.1:3002/api/health` מחזיר `{"ok":true,"db":true}`, והתהליך החי
     רץ מ-`/usr/bin/node`.

  חירום, כשאין זמן ל-PR: מבצעים רק את שלב 2 ואחריו `sudo systemctl restart invoice.service`. ה-build של Node 24
  רץ בלי בעיה על Node 20 (כל המודולים הנייטיב הם N-API עם בינאריים מוכנים), ואת ה-PR מסיימים אחרי.

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
