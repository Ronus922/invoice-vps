---
name: code-reviewer
description: Automated code quality review — identifies unnecessary complexity, duplicated logic, SRP violations, performance issues (N+1, unnecessary renders), dead code, and naming inconsistencies. Lightweight pre-presentation pass. Use when reviewing generated or existing code, running quality gates, or auditing before PR. Triggers: "review code", "code review", "check code quality", "audit code", "code smell", "refactor review".
---

# Code Reviewer

> אוטומטי, מהיר, ממוקד — quality pass לפני שמציגים קוד.

---

## מתי להשתמש

- לפני הצגת קוד שנוצר
- code review על PR לפני merge
- בדיקת טיב קוד קיים לפני refactor
- כשמבקשים "תבדוק את הקוד" ללא spec מפורשת

---

## 6 Review Categories

### 1. Complexity Audit
```
□ האם יש abstraction מיותרת?
  → פונקציה של 2 שורות ש"עוטפת" פונקציה קיימת ≈ redundant layer
□ האם if/else/switch ניתן להחליף ב-map/lookup?
□ האם recursion מוצדק — האם ניתן בloop?
□ Cyclomatic complexity > 10 per function → פצל
```

### 2. Duplication Detection
```
□ האם אותו block קוד מופיע 2+ פעמים?
  → Extract utility / shared function
□ האם אותו פתרון כבר קיים בcodebase?
  → grep לפני יצירה
□ Similar logic עם minor variants → generalize עם params
```

### 3. Single Responsibility
```
□ כל function עושה דבר אחד?
  → אם שם הפונקציה מכיל "and" → split
□ כל file/class עם תחום אחראיות אחד?
□ Side effects לא רצויים?
```

### 4. Performance Issues
```
□ N+1 queries? (loop שמריץ DB query)
  → Batch / include / JOIN
□ Unnecessary re-renders? (React)
  → useMemo, useCallback, memo()
□ Missing index on queried fields?
□ Synchronous I/O בasync context?
□ Object creation בhot path?
```

### 5. Dead Code
```
□ Unused variables / imports
□ Unreachable code (after return)
□ Commented-out code שנשאר
□ Functions שלא נקראים
□ TODOs ישנים שהפכו ל-dead TODO
```

### 6. Naming & Consistency
```
□ Boolean variables: is/has/can/should prefix
□ Functions: verb + noun (getUserById, not userData)
□ Constants: UPPER_SNAKE_CASE
□ Consistent naming convention בכל הfile
□ Abbreviations → full words (usr → user, btn → button)
```

---

## Review Output Format

```markdown
## Code Review

### ✅ Good
- {מה עובד טוב}

### ⚠️ Suggestions
- **[Complexity]** {הבעיה} → {הפתרון}
- **[Duplication]** {הבעיה} → {הפתרון}
- **[Performance]** {הבעיה} → {הפתרון}

### ❌ Must Fix
- **[SRP]** {הבעיה חמורה} → {הפתרון}

### 📊 Score: {7/10}
```

---

## Automated Review Checklist

```bash
# Static analysis before review
npx eslint src/ --max-warnings 0
npx tsc --noEmit
npx depcheck  # unused dependencies
```

---

## Quick Fixes

### Extract Duplicate Logic
```typescript
// ❌ Before
const adminUrl = `${BASE_URL}/admin/${userId}`;
const userUrl = `${BASE_URL}/user/${userId}`;

// ✅ After
const buildUrl = (path: string, id: string) => `${BASE_URL}/${path}/${id}`;
```

### Fix N+1
```typescript
// ❌ Before (N+1)
for (const order of orders) {
  order.user = await db.user.findById(order.userId);
}

// ✅ After (batch)
const userIds = orders.map(o => o.userId);
const users = await db.user.findMany({ where: { id: { in: userIds } } });
const userMap = Object.fromEntries(users.map(u => [u.id, u]));
orders.forEach(o => (o.user = userMap[o.userId]));
```

### Boolean Clarity
```typescript
// ❌ Before
if (user.status === 'active' && !user.banned) { ... }

// ✅ After
const isEligibleUser = user.status === 'active' && !user.banned;
if (isEligibleUser) { ... }
```

---

## Integration עם /review-all

```
/code-reviewer  — קוד בלבד, מהיר (5-10 דקות)
/review-all     — קוד + UI + QA במקביל (20-30 דקות)

Use /code-reviewer for: quick pre-commit, single file, spot check
Use /review-all for: full PR review, major feature, release gate
```

---

## Related Skills
- `/review-all` — Full Code + UI/UX + QA parallel review
- `/spec-driven` — Spec review before implementation
- `/dependency-auditor` — Package quality + CVE review
