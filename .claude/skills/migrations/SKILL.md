---
name: migrations
description: Supabase Database Migrations - CLI workflow, safe schema changes, rolling migrations, rollback strategies.
version: 1.0.0
---

# MIGRATIONS.md — Supabase Database Migrations

> מדריך מלא לניהול migrations בסופאבייס — safe, reversible, production-ready

---

## Table of Contents

1. [Supabase CLI Setup](#1-supabase-cli-setup)
2. [Migration Workflow](#2-migration-workflow)
3. [Safe Schema Changes](#3-safe-schema-changes)
4. [Dangerous Operations](#4-dangerous-operations)
5. [RLS Policies Migration](#5-rls-policies-migration)
6. [Rolling Migrations (Zero Downtime)](#6-rolling-migrations-zero-downtime)
7. [Rollback Strategy](#7-rollback-strategy)
8. [Common Patterns](#8-common-patterns)
9. [Production Checklist](#9-production-checklist)

---

## 1. Supabase CLI Setup

```bash
# Install
npm install -g supabase

# Login
supabase login

# Link to existing project
supabase link --project-ref YOUR_PROJECT_REF

# Pull current remote schema (first time)
supabase db pull
```

### Project Structure

```
project/
├── supabase/
│   ├── migrations/
│   │   ├── 20240101000000_initial_schema.sql
│   │   ├── 20240215000000_add_users_profile.sql
│   │   └── 20240301000000_add_payment_table.sql
│   ├── seed.sql
│   └── config.toml
```

---

## 2. Migration Workflow

### יצירת migration חדש

```bash
# צור migration חדש עם שם תיאורי
supabase migration new add_user_preferences

# נוצר: supabase/migrations/20240301120000_add_user_preferences.sql
```

### כתיבת ה-migration

```sql
-- supabase/migrations/20240301120000_add_user_preferences.sql

-- UP migration
ALTER TABLE profiles
ADD COLUMN theme TEXT NOT NULL DEFAULT 'light',
ADD COLUMN language TEXT NOT NULL DEFAULT 'he';

CREATE INDEX idx_profiles_theme ON profiles(theme);
```

### הרצה

```bash
# Local (development)
supabase db reset         # Reset + run all migrations
supabase db push          # Push pending migrations to local

# Production (remote)
supabase db push --linked  # Push to linked project
```

### בדיקת סטטוס

```bash
supabase migration list    # Shows applied vs pending migrations
supabase migration repair  # Fix migration history issues
```

---

## 3. Safe Schema Changes

### ✅ בטוח תמיד

```sql
-- ADD COLUMN עם DEFAULT (non-breaking)
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT false;

-- CREATE TABLE חדש
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'light',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ADD INDEX (CONCURRENTLY בprod)
CREATE INDEX CONCURRENTLY idx_posts_user_id ON posts(user_id);

-- ADD CONSTRAINT (CHECK)
ALTER TABLE products ADD CONSTRAINT price_positive CHECK (price > 0);

-- RENAME שאין עליו תלויות
-- (אם יש — ראה סעיף Rolling Migrations)
```

### ✅ בטוח עם זהירות

```sql
-- הוספת NOT NULL לעמודה קיימת:
-- שלב 1: הוסף עם DEFAULT
ALTER TABLE posts ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
-- שלב 2: מלא ערכים לשורות ישנות אם צריך
UPDATE posts SET status = 'published' WHERE created_at < '2024-01-01';
-- שלב 3: הסר DEFAULT אם לא רוצה (אופציונלי)
ALTER TABLE posts ALTER COLUMN status DROP DEFAULT;
```

### ❌ אסור בלי rolling migration

```sql
-- DROP COLUMN — שובר קוד שעדיין משתמש בעמודה
ALTER TABLE users DROP COLUMN old_field;

-- RENAME COLUMN — שובר queries ישנים
ALTER TABLE users RENAME COLUMN name TO full_name;

-- CHANGE TYPE — שובר indexes ו-queries
ALTER TABLE posts ALTER COLUMN views TYPE BIGINT;

-- ADD NOT NULL ללא DEFAULT — נכשל על שורות קיימות
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
```

---

## 4. Dangerous Operations

### Drop Column — הדרך הבטוחה

```sql
-- Migration 1: Deprecate (הסר מהקוד, שמור בDB)
-- (רק עדכן קוד הapp, ללא שינוי DB)

-- Migration 2 (אחרי deploy שבוע+): Drop בביטחה
ALTER TABLE users DROP COLUMN IF EXISTS old_field;
```

### Rename Column — הדרך הבטוחה

```sql
-- Migration 1: הוסף עמודה חדשה
ALTER TABLE users ADD COLUMN full_name TEXT;

-- Migration 2: מלא נתונים מהעמודה הישנה
UPDATE users SET full_name = name WHERE full_name IS NULL;

-- Migration 3: הוסף trigger לסינכרון (אם הapp עדיין כותב לישנה)
CREATE OR REPLACE FUNCTION sync_name_columns()
RETURNS TRIGGER AS $$
BEGIN
  NEW.full_name := NEW.name;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_name
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION sync_name_columns();

-- Migration 4 (אחרי deploy מלא): Drop עמודה ישנה + trigger
DROP TRIGGER sync_name ON users;
DROP FUNCTION sync_name_columns;
ALTER TABLE users DROP COLUMN name;
```

---

## 5. RLS Policies Migration

### תבנית בסיסית

```sql
-- הפעל RLS
ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;

-- Policy: קרא רק את הרשומות שלך
CREATE POLICY "users_read_own" ON user_documents
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: צור רק עבור עצמך
CREATE POLICY "users_insert_own" ON user_documents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: עדכן רק שלך
CREATE POLICY "users_update_own" ON user_documents
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: מחק רק שלך
CREATE POLICY "users_delete_own" ON user_documents
  FOR DELETE
  USING (auth.uid() = user_id);
```

### Multi-tenant (Org-based)

```sql
-- Policy: גישה לפי org membership
CREATE POLICY "org_members_read" ON org_documents
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
    )
  );

-- Admin Policy
CREATE POLICY "admins_all" ON org_documents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE user_id = auth.uid()
        AND org_id = org_documents.org_id
        AND role = 'admin'
    )
  );
```

### עדכון Policy קיים

```sql
-- מחק policy ישן לפני יצירת חדש
DROP POLICY IF EXISTS "users_read_own" ON user_documents;

-- צור policy מעודכן
CREATE POLICY "users_read_own" ON user_documents
  FOR SELECT
  USING (auth.uid() = user_id AND is_deleted = false);
```

---

## 6. Rolling Migrations (Zero Downtime)

עבור שינויים שיכולים לשבור את הapp הרץ, חלק ל-3 שלבים:

### שלב 1: Expand (הרחבה)

```sql
-- הוסף את החדש מבלי לגעת בישן
ALTER TABLE orders ADD COLUMN status_v2 TEXT;
```

→ Deploy app שכותב לשתיהן

### שלב 2: Migrate (העברה)

```sql
-- מלא נתונים קיימים
UPDATE orders SET status_v2 = status WHERE status_v2 IS NULL;
```

→ Deploy app שקורא רק מהחדש

### שלב 3: Contract (כיווץ)

```sql
-- מחק את הישן
ALTER TABLE orders DROP COLUMN status;
ALTER TABLE orders RENAME COLUMN status_v2 TO status;
```

→ Deploy גרסה סופית

---

## 7. Rollback Strategy

### Migration עם Rollback מובנה

```sql
-- supabase/migrations/20240301_add_feature.sql

BEGIN;

-- UP
ALTER TABLE posts ADD COLUMN featured BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_posts_featured ON posts(featured);

-- וודא שהמיגרציה הצליחה לפני commit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'featured'
  ) THEN
    RAISE EXCEPTION 'Migration failed: column not created';
  END IF;
END $$;

COMMIT;
```

### Manual Rollback Script

```sql
-- supabase/rollbacks/20240301_add_feature_rollback.sql
-- שמור לצד כל migration חשוב!

DROP INDEX IF EXISTS idx_posts_featured;
ALTER TABLE posts DROP COLUMN IF EXISTS featured;
```

### Supabase Dashboard Rollback

```bash
# בדוק migration history
supabase migration list

# Repair אם migration רשום כapplied אבל נכשל
supabase migration repair --status reverted 20240301000000
```

---

## 8. Common Patterns

### Auto-created_at / updated_at

```sql
-- הוסף timestamps לטבלה קיימת
ALTER TABLE posts
ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Trigger לauto-update
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Soft Delete

```sql
ALTER TABLE posts ADD COLUMN deleted_at TIMESTAMPTZ;

-- Index לquery מהיר
CREATE INDEX idx_posts_not_deleted ON posts(id)
WHERE deleted_at IS NULL;

-- RLS policy שמסנן deleted
DROP POLICY IF EXISTS "users_read_own" ON posts;
CREATE POLICY "users_read_own" ON posts
  FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);
```

### ENUM Types

```sql
-- יצירה
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'cancelled');
ALTER TABLE orders ADD COLUMN status order_status NOT NULL DEFAULT 'pending';

-- הוספת ערך לENUM קיים (safe!)
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'refunded';

-- שינוי ערך (מסוכן — יש להשתמש ב-text + constraint במקום)
-- לא ניתן לשנות/למחוק ערך ENUM ישיר ב-Postgres
```

### Foreign Key

```sql
-- הוסף FK עם CASCADE
ALTER TABLE comments
ADD CONSTRAINT fk_comments_post
FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;

-- הוסף FK ללא validation על נתונים קיימים
ALTER TABLE comments
ADD CONSTRAINT fk_comments_post
FOREIGN KEY (post_id) REFERENCES posts(id)
NOT VALID;

-- Validate בנפרד (לא ינעל את הטבלה כמה זמן)
ALTER TABLE comments
VALIDATE CONSTRAINT fk_comments_post;
```

### Large Table — Index CONCURRENTLY

```sql
-- בטבלה גדולה, CREATE INDEX רגיל נועל את הטבלה
-- CONCURRENTLY לא נועל, אבל לוקח יותר זמן
CREATE INDEX CONCURRENTLY idx_events_user_id ON events(user_id);
CREATE INDEX CONCURRENTLY idx_events_created ON events(created_at DESC);

-- Composite index
CREATE INDEX CONCURRENTLY idx_events_user_created
ON events(user_id, created_at DESC);
```

---

## 9. Production Checklist

לפני כל migration בprod:

- [ ] **גיבוי**: וודא שיש backup אוטומטי (Supabase עושה זאת יומי)
- [ ] **בדיקה בlocal**: `supabase db reset` — מריץ את כל ה-migrations מאפס
- [ ] **בדיקת rollback**: יש לך script לחזור אחורה?
- [ ] **זמן ביצוע**: האם ה-migration יכול לנעול טבלה גדולה? → השתמש ב-CONCURRENTLY
- [ ] **Window**: הרץ בשעות שקטות אם אפשר
- [ ] **Monitor**: עקוב אחרי logs מיד אחרי הרצה
- [ ] **App compatibility**: הקוד החדש עובד גם עם הסכמה הישנה?

---

## Related

- `/api` — Server Actions עם Supabase
- `/security` — RLS patterns
- `fullstack-il/SUPABASE-POSTGRES.md` — Query optimization, indexes
- `fullstack-il/SUPABASE-AUTH.md` — Auth + RLS integration
