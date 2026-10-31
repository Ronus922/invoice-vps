---
name: create-migration
description: יצירה והחלה של migration ל-DB של InvoiceFlow (Supabase self-hosted בדוקר) — קונבנציית שמות, נוהל החלה נכון דרך docker exec, ומלכודות הרשאות של invoice_app. השתמש בכל שינוי סכמה.
---

# יצירת migration — InvoiceFlow

ה-DB הוא **Supabase self-hosted בדוקר על ה-VPS הזה** (container בשם `supabase-db`). אין supabase CLI push — הכל ידני ומבוקר.

## שלב 1 — יצירת הקובץ

- מיקום: `supabase/migrations/`
- קונבנציית שמות: `YYYYMMDD_snake_case_description.sql` (למשל `20260728_add_vat_derived.sql`). תאריך של היום, תיאור קצר באנגלית.
- כתוב SQL אידמפוטנטי כשאפשר (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).

## שלב 2 — הרשאות (קריטי!)

הרול של האפליקציה `invoice_app` (זה שב-`DIRECT_URL`) **אינו הבעלים של הטבלאות**. לכן:

- כל טבלה/עמודה/פונקציה חדשה חייבת GRANT מפורש בסוף ה-migration:
  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.<new_table> TO invoice_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO invoice_app;
  ```
- `check:dupes` כבר לא יוצר DB זמני על ה-cluster האמיתי (חלק 2 רץ ב-CI על Postgres חד-פעמי), ולכן `invoice_app` לא צריך יותר CREATEDB / pg_signal_backend בשבילו. `CREATEDB` נשלל ב-31/10/2026; החברות ב-`pg_signal_backend` נשארה (לא נבדקה).

## שלב 3 — החלה

**הדרך הנכונה היחידה** (כ-postgres, הבעלים):

```bash
docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/<file>.sql
```

**אסור** להחיל דרך `psql $DIRECT_URL -f` — הרול invoice_app אינו owner ו-ALTER TABLE ייכשל.

## שלב 4 — אימות ועדכון מראות

1. ודא שהסכמה הוחלה: `docker exec -i supabase-db psql -U postgres -d postgres -c '\d+ <table>'`
2. הרץ את בדיקות האינווריאנטים הרלוונטיות: `pnpm check:all` (מינימום: `check:money`, `check:dupes` אם נגעת בטבלת invoices).
3. אם השינוי נוגע לכסף/מע"מ — עדכן את המראות: `scripts/backfill-derive-vat.mjs` ו-`scripts/check-money-balanced.mjs` חייבים להישאר מסונכרנים עם הלוגיקה ב-`src/lib/vat-derivation.ts`.
4. עדכן את הטיפוסים ב-`src/types/` אם נוספו עמודות שהאפליקציה קוראת.
