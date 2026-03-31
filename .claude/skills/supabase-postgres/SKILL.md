---
name: supabase-postgres
description: Postgres performance optimization for Supabase - Queries, indexes, RLS, connection pooling, schema design. Based on official Supabase best practices.
version: 1.0.0
source: https://github.com/supabase/agent-skills/tree/main/skills/supabase-postgres-best-practices
---

# Supabase Postgres Best Practices

> Performance optimization guidelines from Supabase. 34 rules across 8 categories, prioritized by impact.

---

## Priority Matrix

| Priority | Category | Impact | Common Issues |
|----------|----------|--------|---------------|
| **🔴 CRITICAL** | Query Performance | 10-100x | Missing indexes, N+1 queries |
| **🔴 CRITICAL** | Connection Management | 10-50x | Pool exhaustion, idle connections |
| **🟠 HIGH** | Schema Design | 5-20x | Poor data types, missing FKs |
| **🟠 HIGH** | Concurrency & Locking | 5-15x | Deadlocks, long transactions |
| **🟠 HIGH** | Security & RLS | 2-10x | RLS performance, privilege misconfig |
| **🟡 MEDIUM** | Data Access Patterns | 2-5x | N+1, inefficient pagination |
| **🟢 LOW-MED** | Monitoring & Diagnostics | N/A | Vacuum, statistics, explain |
| **🟢 LOW** | Advanced Features | 1-3x | FTS, JSONB, partitioning |

---

## 🔴 CRITICAL: Query Performance

### 1. Missing Indexes

**Problem:** Full table scans kill performance

```sql
-- ❌ BAD: 500ms on 100k rows
SELECT * FROM users WHERE email = 'user@example.com';
-- Query plan: Seq Scan on users (cost=0.00..2640.00 rows=1)
```

```sql
-- ✅ GOOD: 2ms with index
CREATE INDEX idx_users_email ON users(email);
SELECT * FROM users WHERE email = 'user@example.com';
-- Query plan: Index Scan using idx_users_email (cost=0.42..8.44 rows=1)
```

**When to index:**
- Foreign keys (ALWAYS)
- Columns in WHERE clauses
- Columns in JOIN conditions
- Columns in ORDER BY (if frequently used)

---

### 2. Composite Indexes

**Problem:** Multiple single-column indexes don't combine efficiently

```sql
-- ❌ BAD: Creates 2 separate indexes
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);

-- Query uses only ONE index, scans the rest
SELECT * FROM orders WHERE user_id = 123 AND status = 'pending';
```

```sql
-- ✅ GOOD: Single composite index
CREATE INDEX idx_orders_user_status ON orders(user_id, status);

-- Query uses both columns efficiently
SELECT * FROM orders WHERE user_id = 123 AND status = 'pending';
```

**Rule:** Most selective column first (user_id before status)

---

### 3. Covering Indexes (Include Columns)

**Problem:** Index lookup + table lookup = 2 operations

```sql
-- ❌ BAD: Index finds row, then looks up table for name
CREATE INDEX idx_users_email ON users(email);
SELECT name FROM users WHERE email = 'user@example.com';
-- Index Scan + Heap Fetch
```

```sql
-- ✅ GOOD: Index contains all needed columns
CREATE INDEX idx_users_email_name ON users(email) INCLUDE (name);
SELECT name FROM users WHERE email = 'user@example.com';
-- Index-Only Scan (no table access)
```

---

### 4. Partial Indexes

**Problem:** Indexing ALL rows when you only query a subset

```sql
-- ❌ BAD: Indexes 1M rows, you only query 10K active ones
CREATE INDEX idx_orders_created ON orders(created_at);
SELECT * FROM orders WHERE status = 'active' ORDER BY created_at DESC;
```

```sql
-- ✅ GOOD: Index only active rows (90% smaller index)
CREATE INDEX idx_orders_active_created ON orders(created_at)
WHERE status = 'active';
```

**Benefit:** Smaller index = faster updates, less disk space, faster scans

---

## 🔴 CRITICAL: Connection Management

### 5. Connection Pooling

**Problem:** Each client connection consumes ~10MB RAM

```typescript
// ❌ BAD: Creates new connection for every request
export async function GET() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();  // 200ms overhead!
  const result = await client.query('SELECT ...');
  await client.end();
  return result;
}
```

```typescript
// ✅ GOOD: Reuse connections via pool
import { Pool } from 'pg';
const pool = new Pool({ max: 20 });  // Outside handler

export async function GET() {
  const result = await pool.query('SELECT ...');  // 2ms overhead
  return result;
}
```

**Supabase Settings:**
- **Max Connections:** Depends on plan (Free: 60, Pro: 200+)
- **Pool Size:** `max: Math.floor(maxConnections * 0.8)`
- **Idle Timeout:** 60s default

---

### 6. Idle Connection Timeout

**Problem:** Connections sit idle, blocking new ones

```sql
-- ❌ BAD: Connections never close
ALTER DATABASE postgres SET idle_in_transaction_session_timeout = 0;
-- Connections stay open forever!
```

```sql
-- ✅ GOOD: Auto-close idle transactions after 60s
ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '60s';
```

**Check idle connections:**
```sql
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
--  count |        state
-- -------+---------------------
--     15 | idle
--      3 | active
--      2 | idle in transaction  ← These will timeout
```

---

### 7. Prepared Statements

**Problem:** Re-parsing same query wastes CPU

```typescript
// ❌ BAD: Query parsed every time
for (const id of userIds) {
  await pool.query('SELECT * FROM users WHERE id = $1', [id]);
}
```

```typescript
// ✅ GOOD: Parse once, execute many times
const stmt = await pool.query({
  name: 'get-user',
  text: 'SELECT * FROM users WHERE id = $1',
  values: [userId]
});

for (const id of userIds) {
  await pool.query({ name: 'get-user', values: [id] });
}
```

**Benefit:** 20-30% faster on high-volume queries

---

## 🟠 HIGH: Schema Design

### 8. Foreign Key Indexes

**Problem:** FK without index = slow JOINs and DELETEs

```sql
-- ❌ BAD: FK exists but not indexed
CREATE TABLE orders (
  user_id UUID REFERENCES users(id)  -- FK constraint
);
-- Deleting a user scans ALL orders (slow!)
```

```sql
-- ✅ GOOD: Always index foreign keys
CREATE TABLE orders (
  user_id UUID REFERENCES users(id)
);
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

**Rule:** Every FK column should have an index

---

### 9. Primary Keys

**Problem:** Tables without PK = no replication, slow updates

```sql
-- ❌ BAD: No primary key
CREATE TABLE logs (
  timestamp TIMESTAMPTZ,
  message TEXT
);
-- Can't use logical replication!
-- UPDATE/DELETE scans entire table
```

```sql
-- ✅ GOOD: Always have a PK
CREATE TABLE logs (
  id BIGSERIAL PRIMARY KEY,  -- or UUID
  timestamp TIMESTAMPTZ,
  message TEXT
);
```

---

### 10. Data Types

**Problem:** Wrong data type = wasted space + slow queries

```sql
-- ❌ BAD: Storing boolean as TEXT
CREATE TABLE users (
  is_active TEXT  -- "true", "false", "yes", "no", "1", "0" 🤦
);
-- Uses 5+ bytes per row, can't index efficiently
```

```sql
-- ✅ GOOD: Use proper types
CREATE TABLE users (
  is_active BOOLEAN  -- 1 byte, indexed efficiently
);
```

**Common mistakes:**
- TEXT for dates → Use `TIMESTAMPTZ`
- TEXT for numbers → Use `INTEGER` or `BIGINT`
- VARCHAR without limit → Use `TEXT` (same performance, no artificial limit)

---

## 🟠 HIGH: Security & RLS

### 11. RLS Basics

**Problem:** No RLS = any authenticated user can access any row

```sql
-- ❌ BAD: No RLS
CREATE TABLE private_messages (
  id UUID PRIMARY KEY,
  user_id UUID,
  content TEXT
);
-- User A can read User B's messages!
```

```sql
-- ✅ GOOD: Enable RLS + policy
CREATE TABLE private_messages (
  id UUID PRIMARY KEY,
  user_id UUID,
  content TEXT
);

ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own messages" ON private_messages
  FOR SELECT USING (auth.uid() = user_id);
```

---

### 12. RLS Performance

**Problem:** RLS policy runs for EVERY row

```sql
-- ❌ BAD: Expensive function in RLS
CREATE POLICY "Complex check" ON posts
  FOR SELECT USING (
    check_user_permissions(auth.uid(), id)  -- Called per row!
  );
```

```sql
-- ✅ GOOD: Index-friendly RLS
CREATE POLICY "Simple check" ON posts
  FOR SELECT USING (user_id = auth.uid());

-- Create index to support policy
CREATE INDEX idx_posts_user_id ON posts(user_id);
```

**Rule:** Keep RLS policies simple and index-friendly

---

## 🟡 MEDIUM: Data Access Patterns

### 13. N+1 Queries

**Problem:** 1 query for list + 1 query per item = N+1

```typescript
// ❌ BAD: N+1 queries
const users = await supabase.from('users').select('id, name');
for (const user of users.data) {
  const orders = await supabase.from('orders')
    .select('*')
    .eq('user_id', user.id);
  // 1 + N queries!
}
```

```typescript
// ✅ GOOD: Single query with JOIN
const users = await supabase
  .from('users')
  .select(`
    id,
    name,
    orders (*)
  `);
// 1 query total
```

---

### 14. Pagination

**Problem:** OFFSET is slow on large datasets

```sql
-- ❌ BAD: Gets slower as offset increases
SELECT * FROM posts
ORDER BY created_at DESC
LIMIT 20 OFFSET 100000;
-- Scans 100,020 rows, returns 20
```

```sql
-- ✅ GOOD: Cursor-based pagination
SELECT * FROM posts
WHERE created_at < '2026-02-15 10:00:00'
ORDER BY created_at DESC
LIMIT 20;
-- Scans only 20 rows via index
```

---

### 15. Batch Inserts

**Problem:** 1 INSERT per row = slow

```typescript
// ❌ BAD: 1000 individual INSERTs
for (const user of users) {
  await supabase.from('users').insert(user);
}
// 1000 network round-trips!
```

```typescript
// ✅ GOOD: Single batch insert
await supabase.from('users').insert(users);
// 1 network round-trip
```

---

## 🟢 LOW-MED: Monitoring

### 16. EXPLAIN ANALYZE

```sql
-- Always check query plans
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';

-- Look for:
-- 1. Seq Scan (bad) vs Index Scan (good)
-- 2. Execution time vs Planning time
-- 3. Rows estimate vs actual rows
```

---

### 17. pg_stat_statements

```sql
-- Enable query statistics
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Find slowest queries
SELECT query, calls, total_exec_time, mean_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

---

### 18. VACUUM & ANALYZE

```sql
-- Manual vacuum (usually automatic)
VACUUM ANALYZE users;

-- Check last vacuum
SELECT schemaname, relname, last_vacuum, last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public';
```

---

## 🟢 LOW: Advanced Features

### 19. Full-Text Search

```sql
-- ✅ GOOD: Use tsvector for FTS
ALTER TABLE articles ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || content)) STORED;

CREATE INDEX idx_articles_search ON articles USING GIN(search_vector);

SELECT * FROM articles
WHERE search_vector @@ to_tsquery('english', 'postgres & performance');
```

---

### 20. JSONB Indexing

```sql
-- ✅ GOOD: Index JSONB fields
CREATE INDEX idx_users_metadata_email ON users USING GIN((metadata -> 'email'));

SELECT * FROM users WHERE metadata->>'email' = 'test@example.com';
```

---

### 21. Partitioning

```sql
-- ✅ GOOD: Partition large tables by date
CREATE TABLE logs (
  id BIGSERIAL,
  created_at TIMESTAMPTZ,
  message TEXT
) PARTITION BY RANGE (created_at);

CREATE TABLE logs_2026_02 PARTITION OF logs
FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

---

## Quick Reference

### Pre-Deploy Checklist

- [ ] All foreign keys have indexes
- [ ] All tables have primary keys
- [ ] RLS enabled on user-data tables
- [ ] Connection pooling configured
- [ ] Indexes on WHERE/JOIN/ORDER BY columns
- [ ] No N+1 queries in hot paths
- [ ] Proper data types (not everything is TEXT)

### Performance Debug Checklist

1. **Check slow queries:** `pg_stat_statements`
2. **Check query plan:** `EXPLAIN ANALYZE`
3. **Check missing indexes:** Look for `Seq Scan`
4. **Check connection pool:** `pg_stat_activity`
5. **Check RLS policies:** Simplify if slow
6. **Check table bloat:** `VACUUM ANALYZE`

---

## Complete Reference

For all 34 rules with detailed examples:
→ https://github.com/supabase/agent-skills/tree/main/skills/supabase-postgres-best-practices/references

**Categories:**
- **query-***: Missing indexes, composite, covering, partial, index types
- **conn-***: Pooling, limits, idle timeout, prepared statements
- **schema-***: Data types, FK indexes, PKs, constraints, partitioning, lowercase identifiers
- **lock-***: Advisory locks, deadlock prevention, short transactions, SKIP LOCKED
- **security-***: RLS basics, RLS performance, privileges
- **data-***: N+1, pagination, batch inserts, upsert
- **monitor-***: EXPLAIN ANALYZE, pg_stat_statements, VACUUM
- **advanced-***: Full-text search, JSONB indexing

---

## Supabase-Specific Tips

### Connection Limits by Plan

| Plan | Max Connections | Recommended Pool Size |
|------|----------------|----------------------|
| Free | 60 | 40-48 |
| Pro | 200 | 160 |
| Team | 400 | 320 |

### RLS with Supabase Auth

```sql
-- ✅ GOOD: Use auth.uid() in RLS policies
CREATE POLICY "Users see own data" ON user_data
  FOR ALL USING (auth.uid() = user_id);

-- Create supporting index
CREATE INDEX idx_user_data_user_id ON user_data(user_id);
```

### Supabase Client Connection Pooling

```typescript
// ✅ GOOD: Supabase client has built-in pooling
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key, {
  db: {
    schema: 'public',
  },
  global: {
    headers: { 'x-application-name': 'my-app' },
  },
});

// Reuse supabase instance globally
export default supabase;
```

---

## Version History

- **1.0.0** (2026-02-15): Initial compilation from Supabase official best practices

---

## Credits

Based on [Supabase Agent Skills](https://github.com/supabase/agent-skills) - Official Postgres optimization guidelines.

Compiled by Claude + Lior for DevOPS Kit.
