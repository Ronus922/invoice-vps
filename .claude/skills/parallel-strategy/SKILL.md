---
name: parallel-strategy
description: Parallel Agents Strategy - מדריך מקיף לעבודה עם סוכנים מקבילים ב-Claude Code, מתי לחלק ומתי לא.
---

# Parallel Agents Strategy

**Skill**: `/parallel-strategy`
**Purpose**: מדריך מקיף לעבודה עם סוכנים מקבילים

---

## 🎯 מתי להשתמש בסוכנים מקבילים?

### ✅ כדאי לחלק
- **פיצ'ר חדש** עם UI + Backend + Auth
- **באג מורכב** שדורש חקירה + תיקון
- **רפקטור גדול** עם מספר תת-מערכות
- **אופטימיזציה** (ביצועים + UX במקביל)
- **תוכן + עיצוב** (Content + Design)

### ❌ לא כדאי לחלק
- משימה קטנה (< 3 צעדים)
- תיקון טריוויאלי (typo, CSS tweak)
- כשיש תלות קשיחה (B חייב לחכות ל-A)

---

## 📊 Agent Selection Matrix

| Task Type | Primary Agent | Support Agents | Parallel? | Notes |
|-----------|---------------|----------------|-----------|-------|
| **New CRUD feature** | Fullstack | Design, API, Security | ✅ | חלק ל: UI, Backend, RLS |
| **Bug (simple)** | - | Explore (אם צריך) | ❌ | לא שווה overhead |
| **Bug (complex)** | Fullstack | Explore, Security | ✅ | חקירה במקביל לתיקון |
| **Performance issue** | Performance | Explore | ✅ | Profile + מצא דוגמאות |
| **Content writing** | Content | Design (layout) | ✅ | טקסטים + קומפוננטות |
| **Security audit** | Security | API, Design | ✅ | בדוק כל layer |
| **Animation task** | Animation | Design | ✅ | Motion + UI styling |
| **n8n workflow** | n8n Agent | API (webhooks) | ✅ | Workflow + integration |
| **Refactor (large)** | Fullstack | Design, API | ✅ | ארכיטקטורה + ביצוע |
| **UI redesign** | Design | Content (copy) | ✅ | עיצוב + טקסטים |

---

## 🧩 Task Decomposition Guide

### שלב 1: זיהוי רכיבים
פרק את המשימה לרכיבים לוגיים:
- **Frontend** (UI/UX)
- **Backend** (API/Database)
- **Security** (Auth/Validation)
- **Testing** (E2E/Unit)
- **Content** (Copy/i18n)
- **Performance** (Optimization)

### שלב 2: מיפוי תלויות
- מה חייב לקרות **לפני** מה?
- מה יכול לרוץ **במקביל**?
- מה **לא תלוי** בשאר?

**דוגמה - פיצ'ר Login:**
```
Parallel (אין תלויות):
├── Design Agent → UI של טופס
├── API Agent → endpoint auth
├── Security Agent → RLS policies
└── Content Agent → טקסטים

Sequential (יש תלויות):
1. כל הסוכנים מסיימים
2. אינטגרציה → חיבור הכל ביחד
3. Testing → Playwright E2E
```

### שלב 3: הקצאת סוכנים
בחר סוכן לכל רכיב לפי התמחות:
- **Design** - כל מה שקשור ל-UI/UX
- **API** - route handlers, Supabase queries
- **Security** - auth, validation, RLS
- **Performance** - profiling, optimization
- **Content** - טקסטים בעברית, SEO

### שלב 4: ביצוע מקבילי
```typescript
// ❌ לא נכון - רץ בסדר
Task(Design) → wait → Task(API) → wait → Task(Security)

// ✅ נכון - במקביל
single message with:
- Task(Design)
- Task(API)
- Task(Security)
→ כל 3 רצים יחד
```

---

## 🎯 Common Patterns

### Pattern 1: New CRUD Feature
```
Phase 1 - Parallel:
├── Task 1 (Design): UI components (form + table + filters)
├── Task 2 (API): Route handlers + Supabase CRUD
└── Task 3 (Security): RLS policies + input validation

Phase 2 - Integration:
- Wire components → API
- Test all CRUD operations

Phase 3 - Validation:
- Playwright E2E (create, read, update, delete)
- Security audit (RLS, validation)
```

### Pattern 2: Performance Optimization
```
Phase 1 - Parallel:
├── Task 1 (Performance): Profile app + identify bottlenecks
└── Task 2 (Explore): Find existing optimized patterns in codebase

Phase 2 - Integration:
- Apply optimizations based on findings
- Measure before/after metrics

Phase 3 - Validation:
- Performance Agent: verify improvements
- MCP tools: check bundle size, load time
```

### Pattern 3: Bug Investigation
```
Phase 1 - Parallel:
├── Task 1 (Explore): Reproduce bug + find related code
└── Task 2 (Fullstack): Propose potential fixes

Phase 2 - Integration:
- Implement chosen fix
- Add regression test

Phase 3 - Validation:
- Ensure bug doesn't reproduce
- Run full test suite
```

### Pattern 4: New Landing Page
```
Phase 1 - Parallel:
├── Task 1 (Design): Layout + components + animations
├── Task 2 (Content): Hebrew copy + SEO metadata
└── Task 3 (Performance): Image optimization + lazy loading

Phase 2 - Integration:
- Combine design + content
- Apply performance optimizations

Phase 3 - Validation:
- Playwright (responsive, RTL, a11y)
- Lighthouse (Core Web Vitals)
```

### Pattern 5: Security Audit
```
Phase 1 - Parallel:
├── Task 1 (Security): Auth flow + RLS review
├── Task 2 (API): Input validation + rate limiting
└── Task 3 (Design): XSS prevention in UI

Phase 2 - Integration:
- Create comprehensive security report
- Prioritize fixes

Phase 3 - Validation:
- Security Agent: verify all fixes
- Penetration test (if applicable)
```

---

## ✅ Validation Checklist

לפני סיום משימה, וודא:

### כיסוי מלא
- [ ] כל רכיבי התוכנית בוצעו (לא נשכח כלום?)
- [ ] כל הסוכנים סיימו בהצלחה
- [ ] התוצאות שולבו כראוי

### איכות קוד
- [ ] TypeScript - אין `any`, הכל typed
- [ ] Security Agent אישר (אם יש auth/validation)
- [ ] Performance Agent בדק (אם יש optimizations)
- [ ] קוד עוקב אחרי conventions הפרויקט

### Testing (משמעותי בלבד)
- [ ] Playwright E2E לקומפוננטות חדשות
- [ ] Playwright לרפקטור UI
- [ ] Playwright לתיקון באגים בממשק
- [ ] **לא** Playwright ל-CSS tweaks קטנים

### תיעוד
- [ ] Commit message ברור ומתאר את השינוי
- [ ] PROJECT.md עודכן אם נדרש
- [ ] דיווח למשתמש על הצלחה + next steps

---

## 💡 Best Practices

### DO ✅
- **שקול תמיד** אם משימה ניתנת לחלוקה
- הרץ סוכנים במקביל ב-**single message**
- דווח למשתמש אחרי כל phase
- השתמש ב-Playwright רק **בשינויים משמעותיים**
- שלב תוצאות לפני validation

### DON'T ❌
- אל תעשה עבודה סדרתית כשאפשר מקבילית
- אל תשכח רכיבים - כל חלק חייב להתבצע
- אל תריץ Playwright על CSS tweaks
- אל תחלק משימות קטנות מדי (overhead)
- אל תשכח לדווח למשתמש בסיום

---

## 🚀 דוגמאות מעשיות

### דוגמה 1: "צור פיצ'ר רישום משתמשים"

**שלב תכנון:**
```
רכיבים:
1. UI - טופס רישום RTL
2. API - endpoint registration
3. Security - validation + RLS
4. Content - טקסטים + error messages
```

**ביצוע:**
```
// Single message, 4 Task calls:
Task 1 (Design Agent):
  "צור טופס רישום RTL: שדות (name, email, password),
   validation UI, error states, success state"

Task 2 (API Agent):
  "צור API endpoint POST /api/auth/register:
   - Supabase user creation
   - Email verification
   - Error handling"

Task 3 (Security Agent):
  "הגדר RLS policies למשתמשים חדשים:
   - Row-level security
   - Input validation (Zod)
   - Rate limiting"

Task 4 (Content Agent):
  "כתוב טקסטים בעברית:
   - כותרת טופס
   - labels לשדות
   - error messages
   - success message"
```

**אינטגרציה:**
```typescript
// חבר את כל הרכיבים:
1. טופס מ-Design → API מ-API Agent
2. Validation מ-Security → טופס
3. טקסטים מ-Content → כל הרכיבים
```

**Validation:**
```
Playwright E2E:
✅ Happy path - רישום מוצלח
✅ Error states - email קיים, סיסמה חלשה
✅ Loading state
✅ RTL + responsive
```

### דוגמה 2: "תקן באג - טבלה לא נטענת"

**שלב תכנון:**
```
רכיבים:
1. Explore - reproduce + find cause
2. Fullstack - propose fix
```

**ביצוע:**
```
// Single message, 2 Task calls:
Task 1 (Explore Agent):
  "חקור למה הטבלה לא נטענת:
   - Reproduce הבאג
   - Check network requests
   - Check console errors
   - Find related code"

Task 2 (Fullstack Agent):
  "הכן תיקון מוצע:
   - Analyze possible causes
   - Propose fix (code diff)
   - Consider edge cases"
```

**אינטגרציה:**
```
1. קרא תוצאות שני הסוכנים
2. בחר את התיקון הטוב ביותר
3. Implement + add regression test
```

**Validation:**
```
Playwright:
✅ הטבלה נטענת בהצלחה
✅ Data מוצג נכון
✅ Loading state מופיע
✅ Error state (אם אין data)
```

---

## 🎓 למידה מתקדמת

### מתי לא לחלק?
- **משימה קטנה**: "שנה צבע כפתור" → רק Design, לא צריך חלוקה
- **תלות קשיחה**: "B צריך תוצאה מדויקת של A" → סדרתי
- **Overhead גדול**: הסנכרון בין סוכנים גדול מהחיסכון

### איך לזהות הזדמנויות?
שאל את עצמך:
1. האם יש > 2 רכיבים **עצמאיים** במשימה?
2. האם כל רכיב יכול להתבצע **בנפרד**?
3. האם השילוב ביניהם **פשוט**?

אם כן לכל 3 → חלק לסוכנים!

### שגיאות נפוצות
❌ **שכחה**: "שכחתי לבדוק Security" → השתמש ב-Checklist
❌ **Sequential**: "הרצתי סוכן אחד, חיכיתי, הרצתי עוד" → single message
❌ **Over-testing**: "הרצתי Playwright על שינוי צבע" → רק משמעותי
❌ **Under-integration**: "כל סוכן עבד, אבל לא שילבתי" → Phase 2 חובה

---

**💬 שאלות? דווח בעיות?**
פתח issue או דון עם המשתמש
