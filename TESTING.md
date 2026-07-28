# בדיקות — Invoice

מערך בדיקות קבוע לאינווריאנטות הקריטיות של המערכת. הפעלה: `npm run check:all`.
כל בדיקה עצמאית (`node scripts/check-<שם>.mjs`), מחזירה `exit 0` בהצלחה והודעת
כישלון ברורה בעברית כשנשברת. בדיקות DB הן **קריאה בלבד** מול הנתונים האמיתיים;
הבדיקה היחידה שכותבת (הוכחת unique index) רצה מול **מסד חד־פעמי** שנוצר ונמחק —
לעולם לא מול 405 הרשומות האמיתיות.

## הבדיקות — מה כל אחת מגינה

| בדיקה | סקריפט | מגינה מפני |
|---|---|---|
| `check:secrets` | `check-no-secrets.mjs` | דליפת מפתחות ל-git — אף ערך מ-`.env.local` (service-role, Anthropic, Gmail, CRON, DB) לא מופיע בקובץ במעקב, ואין `.env` במעקב (מלבד `*.example`). |
| `check:auth` | `check-api-auth.mjs` | route חשוף — כל handler תחת `src/app/api/**` חייב `getAuthenticatedUser()` או `CRON_SECRET`. (יוצא דופן מותר: `auth/logout`.) קריטי כי ה-routes משתמשים ב-service-role שעוקף RLS. |
| `check:source` | `check-source-enum.mjs` | drift בין הקוד למסד — ערכי `source` ב-`z.enum` של route החשבוניות חייבים להיות זהים ל-`CHECK` במסד (migration). ערך שהקוד שולח והמסד לא מכיר → כל insert כזה נדחה בשקט. בדיקה סטטית (קבצים בלבד, ללא DB). |
| `check:anon` | `check-anon-isolation.mjs` | חשיפת נתונים ל-anon — קורא בפועל עם ה-anon key מ-`invoices`, `gmail_tokens`, `scanned_emails` ומוודא **0 שורות**. מגן מדליפת חשבוניות (כסף) ו-refresh token של Gmail. |
| `check:money` | `check-money-balanced.mjs` | **שגיאה כספית שקטה** — אין חשבונית לא-מאוזנת (`total≤0`, או `pretax+vat≠total` מעבר לסובלנות `max(0.05, total·0.5%)`) שאינה מסומנת `needs_review`. חוזה המערכת: לא-מאוזן ⟹ needs_review. חשבונית לא-מאוזנת **מסומנת** = תקין. |
| `check:currency` | `check-currency-valid.mjs` | חשבונית זרה שנשמרה כ-₪ — לכל רשומה קוד מטבע ISO-4217 תקין (`^[A-Z]{3}$`). |
| `check:review` | `check-needs-review-not-sent.mjs` | שליחת חשבונית לא-מאומתת לרו״ח — אין רשומה עם `needs_review=true` **וגם** `sent_to_accountant_at` מלא, **מלבד** `KNOWN_BACKLOG` מתועד (ראה למטה). כל רגרסיה **חדשה** נכשלת. |
| `check:dupes` | `check-no-duplicate-invoices.mjs` | כפילות מ-scan חוזר — זהות מסמך היא `(vendor, doc_number, doc_type)`: אין שתי רשומות בעלות מפתח זהה שגם זהות בכל שדה מהותי. כולל הוכחה במסד חד־פעמי ש**האינדקס החלקי** (מגן על נתונים חדשים) וגם **האינדקס המלא** (המצב הסופי) דוחים הכנסה חוזרת זהה, מאפשרים `doc_type` שונה (Invoice מול Receipt עם אותו מספר), וש-החלקי משאיר שורות legacy (לפני העוגן) ללא חסימה. |

### הרצה בודדת
```bash
npm run check:money      # או check:secrets / check:auth / check:source / check:anon / check:currency / check:review / check:dupes
npm run check:all        # typecheck + lint + כל הבדיקות, עוצר על הכישלון הראשון
```

## מפתח הזהות — `(vendor, doc_number, doc_type)`

**הכרעה ארכיטקטונית (2026-07-18):** זהות מסמך היא `(vendor, doc_number, doc_type)`,
לא עוד `(vendor, doc_number)`. וונדורים כמו Anthropic מנפיקים Invoice ו-Receipt עם
אותו מספר; בישראל: חשבונית מס / קבלה / חשבונית מס-קבלה / חשבונית זיכוי. עמודת
`doc_type` (מיגרציה `20260718_add_doc_type.sql`, backfill `scripts/backfill-doc-type.mjs`)
מפרידה ביניהם. ה-CHECK: `invoice, receipt, invoice_receipt, credit_note, other, unknown`.

**התפלגות `doc_type`** אחרי ה-backfill (405 שורות): `unknown` 296 · `invoice` 65 ·
`receipt` 44. הסיווג משם הקובץ (`Invoice-*`/`Receipt-*`) + `total<0 ⇒ credit_note`;
מה שלא ודאי → `unknown` (בטוח — הוספת `doc_type` למפתח רק **מרככת** ייחודיות).
re-extraction לא נדרש: הקבוצה היחידה שחייבת פיצול-סוג (Anthropic) מסווגת בוודאות
משם הקובץ, והשאר נשארות מקובצות ממילא. קבוצות רב-שורתיות שאינן פיצול Invoice/Receipt
אוחדו ל-`doc_type` יחיד כדי שתאום re-scan/שינוי-שם (למשל `Invoice_21981352.pdf` מול
`1006 מים.pdf`) לא ייחשב בטעות למסמכים נפרדים ויסתיר כפילות אמיתית.

## חוב פתוח — 9 קבוצות וריאנט (הכרעת רונן ב-UI)

מתוך 17 קבוצות הווריאנט הקודמות: **8 נפתרו אוטומטית** תחת המפתח החדש — כל קבוצות
Anthropic (0009, 0012, 0013, 0014, 0016, 0017, 0019, 0020) התפצלו ל-`invoice`+`receipt`
(אומת: `total`/`pretax`/`vat`/מטבע זהים בין ה-Invoice ל-Receipt → אף אחת לא סומנה
`needs_review`). **נותרו 9 קבוצות** — אותו `(vendor, doc_number, doc_type)`, נבדלות
בקובץ/מקור (re-scan או ידני-מול-folder). אלה **לא** כשל ב-`check:dupes` (מדווחות `info`);
לפתרון: פתח כל זוג בטבלה, השווה, ומחק את המיותרת ב-UI:

| ספק | מסמך | doc_type |
|---|---|---|
| HEBERGEMENT OVH INC. | WE4389699 | invoice |
| מי כרמל בע"מ | 21981352 | invoice |
| מי כרמל בע"מ | 21981354 | invoice |
| מי כרמל בע"מ | 21981358 | invoice |
| מי כרמל בע"מ | 21981361 | invoice |
| MAX | 1011006844 | unknown |
| Partner | 18447604 | unknown |
| להב יעדים בע"מ | 9559 | unknown |
| להב יעדים בע"מ | 9560 | unknown |

גיבוי מלא לפני השינוי: `backups/doctype-<timestamp>/` (dump + JSON של כל 405 השורות, לא נכנס ל-git).

### אינדקס — מצב נוכחי ושלב סיום
**כבר פעיל:** אינדקס ייחודי **חלקי** שמגן על נתונים חדשים בלי לחכות ל-legacy —
`invoices_vendor_docnum_doctype_new_uniq`, מכסה רק
`created_at >= '2026-07-18 22:16:09.647383+00'`. העוגן = `max(created_at)+1s` ברגע
ה-backfill — נבחר **אחרי** השורה האחרונה הקיימת כדי שאף שורת legacy (כולל כפילויות
להב יעדים שנוצרו באותו יום) לא תיכלל, כך שהאינדקס נבנה מיד.

**שלב סיום** — אחרי שרונן סוגר את 9 הקבוצות שנותרו: DROP לחלקי ויצירת המלא:
```sql
drop index public.invoices_vendor_docnum_doctype_new_uniq;
create unique index concurrently invoices_vendor_docnum_doctype_uniq
  on public.invoices (vendor, doc_number, doc_type)
  where coalesce(doc_number,'') <> '';
```
`check:dupes` מוכיח במסד חד־פעמי שגם החלקי וגם המלא דוחים הכנסה חוזרת זהה.

**שורש הבעיה — נסגר:** `folder-watch.ts` בדק כפילות מול snapshot חד-פעמי (עיוור
לשורה שהוכנסה זה עתה ולמרוץ בין סריקות מקבילות). כעת ה-dedup קורה **ברגע הכתיבה**:
ה-POST ל-`/api/invoices` נשען על האינדקס הייחודי ומחזיר `{ duplicate: true }` על
התנגשות (`23505`) במקום ליצור כפילות — כך גם מרוץ מקבילי נסגר. אותו מפתח הורחב
ב-dedup של סריקת Gmail (`scan-gmail`), ב-pre-check של `UploadZone`/`folder-watch`,
ובשמות הקבצים בגיבוי ל-Drive/ZIP (כדי ש-Invoice ו-Receipt לא ידרסו זה את זה).

## חוב פתוח — 3 חשבוניות legacy שנשלחו לרו״ח (backlog שליחה-מחדש)

`check:money` תפס **11 חשבוניות legacy** (03–05/2026) עם חישוב לא-מאוזן שנשמרו
לפני שהאימות החשבוני היה קיים, וכולן כבר נשלחו לרו״ח. חילוץ מחדש מה-PDF
(`scripts/reextract-legacy.mjs`) תיקן **8** לסכומים נכונים (למשל בום: total היה
`711.8`, בפועל `771.8`; פז גז: `vat=-9.14` → `30.99`). **3** לא הצליחו להתאזן
ותוקנו + סומנו `needs_review=true` (`scripts/apply-reextract.mjs`):

| ספק | מסמך | מצב |
|---|---|---|
| פזגז | 44100314533 | זיכוי (credit note), total −104.1 |
| יחיאל שדר | 855931801 | total 250 מול 253.90 (הנחה?) |
| יחיאל שדר | 1040193419 | total 150 מול 148.60 |

3 אלה מופיעות ב-`KNOWN_BACKLOG` שבתוך `check-needs-review-not-sent.mjs`. **פעולה
נדרשת:** שלח לרו״ח עותק מתוקן של כל אחת, נקה `needs_review`, והסר את ה-id מ-
`KNOWN_BACKLOG`. גיבוי לפני העדכון: `backups/pre-correction-<timestamp>.json`.

## תוכנית בדיקה ידנית (לפני deploy)

בצע בדפדפן על סביבת ה-staging/prod אחרי `npm run check:all` ירוק:

1. **התחברות** — פתח את האתר בגלישה פרטית. ודא שהפניה ל-`/login`. התחבר עם
   `r@bios.co.il`. צפוי: הגעה לטבלת החשבוניות.
2. **חסימת לא-מורשה** — התנתק, נסה לגשת ישירות ל-`/` או לקרוא `/api/invoices`
   בטאב אנונימי. צפוי: הפניה ל-login / `401`, **לא** נתוני חשבוניות.
3. **העלאה + חילוץ** — לחץ "העלאה", גרור PDF/תמונה של חשבונית. צפוי: החשבונית
   מעובדת, שדות (ספק, מספר, סכום, מטבע) מתמלאים אוטומטית.
4. **אימות חישוב** — ערוך חשבונית וקבע `total` שלא שווה ל-`pretax+vat`. שמור.
   צפוי: מסומנת ⚠️ "בדיקה" (`needs_review`) עם הודעת אי-התאמה.
5. **מטבע זר** — העלה חשבונית של Anthropic/AWS. צפוי: `currency=USD` ומוצג `$`,
   לא `₪`.
6. **דחיית שליחה** — נסה "שלח לרו״ח" על חשבונית עם ⚠️ בדיקה. צפוי: נחסם עם
   הודעה, לא נשלח.
7. **שליחה תקינה** — קבע אימייל רו״ח בהגדרות, שלח חשבונית תקינה. צפוי: "נשלח",
   הרשומה מקבלת חותמת `sent_to_accountant_at`.
8. **כפילות** — העלה שוב את **אותו** קובץ חשבונית שכבר קיים. צפוי: "כבר קיימת
   במערכת" / מסומנת ככפילות, **לא** נוצרת שורה שנייה. לעומת זאת, Invoice ו-Receipt
   של Anthropic עם **אותו מספר** (doc_type שונה) — **שתיהן** נשמרות, לא ככפילות.
9. **סריקת Gmail** — הרץ "סרוק Gmail", ואז הרץ שוב מיד. צפוי: הריצה השנייה
   מדווחת 0 חדשות / כפילויות, בלי רשומות כפולות בטבלה.

## הכלל

לפני **כל** deploy:
1. `npm run check:all` — חייב לחזור ירוק.
2. הרץ את תוכנית הבדיקה הידנית למעלה.
3. **אדום = לא פורסים.** מתקנים את השורש (אסור להחליש בדיקה כדי שתעבור), ומריצים שוב.
