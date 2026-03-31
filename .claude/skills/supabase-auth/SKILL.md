---
name: supabase-auth
description: Complete Supabase guide - OAuth/Auth + Postgres optimization. Next.js 15, PKCE, RLS, indexes, connection pooling. Production-ready.
---

# Supabase Complete Guide

> Next.js 15 + Supabase Auth + Postgres Optimization

---

## Quick Navigation

| Topic | File | Use When |
|-------|------|----------|
| **OAuth & Authentication** | [SUPABASE-AUTH.md](fullstack-il/SUPABASE-AUTH.md) | Implementing Google/Email auth, fixing 502 errors, session management |
| **Postgres Optimization** | [SUPABASE-POSTGRES.md](fullstack-il/SUPABASE-POSTGRES.md) | Slow queries, missing indexes, RLS performance, connection pooling |

---

## 🔐 Authentication Quick Start

### OAuth with Google (PKCE Flow)

```typescript
// 1. Browser client (NO custom handlers!)
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(url, key);  // Default storage = correct

// 2. Sign in
await supabase.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: `${window.location.origin}/auth/callback` }
});

// 3. Callback route (src/app/auth/callback/route.ts)
const supabase = createServerClient(url, key, {
  cookies: {
    getAll() { return request.cookies.getAll(); },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, {
          ...options,
          httpOnly: false,  // ✅ CRITICAL!
        });
      });
    },
  }
});

await supabase.auth.exchangeCodeForSession(code);
```

**Common Issues:**
- **502 Bad Gateway** → Nginx buffer too small (`proxy_buffer_size 16k`)
- **PKCE not found** → Using custom cookie handlers (don't!)
- **Cookies not readable** → `httpOnly: true` (force to false)

**Full guide:** [fullstack-il/SUPABASE-AUTH.md](fullstack-il/SUPABASE-AUTH.md)

---

## ⚡ Postgres Performance Quick Wins

### 1. Index Foreign Keys (Always!)

```sql
-- ❌ BAD: FK without index
CREATE TABLE orders (user_id UUID REFERENCES users(id));

-- ✅ GOOD: Always index FKs
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

**Impact:** 10-100x faster JOINs and DELETEs

---

### 2. Connection Pooling

```typescript
// ❌ BAD: New connection per request
const client = new Client({ connectionString });
await client.connect();  // 200ms overhead!

// ✅ GOOD: Reuse pool
const pool = new Pool({ max: 20 });
await pool.query('SELECT ...');  // 2ms overhead
```

**Impact:** 10-50x faster, prevents pool exhaustion

---

### 3. RLS with Indexes

```sql
-- ❌ BAD: RLS without index
CREATE POLICY "Users see own data" ON posts
  FOR SELECT USING (user_id = auth.uid());
-- Scans entire table!

-- ✅ GOOD: Index to support RLS
CREATE INDEX idx_posts_user_id ON posts(user_id);
```

**Impact:** 5-20x faster with RLS enabled

---

### 4. Fix N+1 Queries

```typescript
// ❌ BAD: N+1 queries
const users = await supabase.from('users').select('*');
for (const user of users.data) {
  const orders = await supabase.from('orders').eq('user_id', user.id).select('*');
}

// ✅ GOOD: Single query with JOIN
const users = await supabase.from('users').select(`*, orders (*)`);
```

**Impact:** N queries → 1 query

---

### 5. Batch Operations

```typescript
// ❌ BAD: 1000 individual inserts
for (const item of items) {
  await supabase.from('items').insert(item);
}

// ✅ GOOD: Single batch
await supabase.from('items').insert(items);
```

**Impact:** 100-1000x faster bulk operations

---

## Decision Tree

```
Working with Supabase?

1. Setting up authentication?
   → Read fullstack-il/SUPABASE-AUTH.md
   → Focus on: OAuth flow, callback route, NGINX config

2. Queries slow or 502 errors during auth?
   → Check SUPABASE-AUTH.md troubleshooting section
   → Verify: Nginx buffers, httpOnly: false, cookie handlers

3. Database performance issues?
   → Read fullstack-il/SUPABASE-POSTGRES.md
   → Check: Missing indexes, connection pooling, RLS indexes

4. Building new features?
   → Use both guides:
     - AUTH for user management
     - POSTGRES for schema design + performance
```

---

## Critical Checklist

### Before Deploying Auth

- [ ] Nginx `proxy_buffer_size 16k`
- [ ] Nginx `proxy_set_header X-Forwarded-Host $host`
- [ ] Callback route sets `httpOnly: false`
- [ ] Browser client uses default storage (no custom handlers)
- [ ] `onAuthStateChange` listener for UI updates

### Before Deploying Database

- [ ] All foreign keys have indexes
- [ ] All tables have primary keys
- [ ] RLS enabled on user-data tables
- [ ] RLS policies have supporting indexes
- [ ] Connection pooling configured (`max: 20-40`)
- [ ] No N+1 queries in hot paths
- [ ] Using proper data types (not TEXT for everything)

---

## Environment Setup

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...  # Server-only!

# Database (for direct pg connection)
DATABASE_URL=postgresql://postgres:[password]@db.xxx.supabase.co:5432/postgres
```

---

## Quick Commands

```sql
-- Check slow queries
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;

-- Check missing indexes
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';
-- Look for: "Seq Scan" = missing index

-- Check connection pool
SELECT count(*), state FROM pg_stat_activity GROUP BY state;

-- Check RLS policies
SELECT schemaname, tablename, policyname
FROM pg_policies WHERE schemaname = 'public';
```

---

## Resources

### Official Supabase Docs
- [Auth Docs](https://supabase.com/docs/guides/auth)
- [SSR with Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Postgres Docs](https://supabase.com/docs/guides/database)

### Our Guides
- **Auth (30KB):** [fullstack-il/SUPABASE-AUTH.md](fullstack-il/SUPABASE-AUTH.md)
- **Postgres (20KB):** [fullstack-il/SUPABASE-POSTGRES.md](fullstack-il/SUPABASE-POSTGRES.md)

### External
- [Supabase Best Practices (GitHub)](https://github.com/supabase/agent-skills)
- [PostgreSQL Performance Tips](https://wiki.postgresql.org/wiki/Performance_Optimization)

---

## Version History

- **2.0.0** (2026-02-15): Combined auth + postgres optimization guides
- **1.0.0**: Initial OAuth guide from PYE9 production debugging

---

**When in doubt:** Start with SUPABASE-AUTH.md for auth issues, SUPABASE-POSTGRES.md for performance issues.
