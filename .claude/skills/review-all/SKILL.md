---
name: review-all
description: Complete project review orchestrator - runs Code Review + UI/UX Review + QA Testing in parallel and produces a unified report.
---

# /review-all - ביקורת מלאה של הפרויקט

## מה זה עושה?
פקודה אחת שמריצה **3 ביקורות במקביל** ומייצרת דוח מאוחד.

---

## שלב 0: סיור (לפני שליחת agents!)

**חובה לבצע לפני שליחת ה-3 agents:**

```
1. קרא package.json → טכנולוגיה + URL
2. סרוק routes → בנה PAGE_LIST:
   Next.js: glob app/**/page.tsx
   React: grep Route src/
3. בדוק אם קיים QA-TRACKER.md מ-session קודם
4. שאל את המשתמש על credentials (אם צריך login)
```

---

## שלב 1: הרץ 3 agents במקביל

**חובה להשתמש ב-Task tool עם 3 קריאות במקביל:**

### Task 1: Code Review
```
subagent_type: "general-purpose"
prompt: "Review the codebase at [PROJECT_PATH]. Check:
  - TypeScript strict (no 'any', no console.log)
  - Architecture & patterns
  - DRY (no duplicate code)
  - Security (no exposed secrets)
  - Error handling
  Produce a structured review."
```

### Task 2: UI/UX Review
```
subagent_type: "UI/UX Review Agent"
prompt: "Run a full UI/UX visual review on [URL].
  Check all pages for: RTL, spacing, padding, typography,
  color consistency, responsive (375, 768, 1024, 1440), accessibility.
  Produce UIUX-REVIEW.md."
```

### Task 3: QA
```
subagent_type: "QA Agent"
prompt: "You are the QA Agent. Load and follow the /qa skill EXACTLY.

PROJECT: [PROJECT_PATH]
URL: [URL]
AUTH: [credentials or 'ask user']

PAGE LIST (from codebase scan):
[paste PAGE_LIST here]

PREVIOUS STATE: [QA-TRACKER.md content or 'first run']

INSTRUCTIONS:
- Open the browser and USE the application
- Visit EVERY page in the page list
- Click EVERY button, link, dropdown, tab
- Fill and submit EVERY form
- Complete EVERY wizard/stepper end-to-end
- Test responsive at 375 and 1440
- Every PASS must have browser_snapshot evidence
- Update QA-TRACKER.md when done
- Produce QA-REPORT.md with Test Evidence section at the top"
```

---

## שלב 2: אסוף תוצאות

כשכל הagents סיימו:

1. קרא את 3 הדוחות
2. **ודא QA Evidence** - בדוק שQA-REPORT.md מכיל "Test Evidence" section. אם אין, או אם הנתונים נמוכים (0 buttons clicked, 0 forms submitted) - הזהר את המשתמש: "QA coverage was superficial"
3. מזג לדוח אחד

---

## שלב 3: דוח מאוחד

צור `FULL-REVIEW.md`:

```markdown
<div dir="rtl" align="right">

# ביקורת מלאה - [שם הפרויקט]

| | |
|---|---|
| **תאריך** | [DATE] |
| **כתובת** | [URL] |
| **בודקים** | Code Reviewer + UI/UX Review + QA Agent |

## ציון מנהלים

| ביקורת | ציון | סטטוס |
|--------|------|-------|
| קוד | X/10 | PASS/FAIL/WARN |
| עיצוב | X/10 | PASS/FAIL/WARN |
| QA (פונקציונלי) | X/Y דפים | PASS/FAIL/WARN |
| **ציון כולל** | **[A-F]** | |

### QA Coverage
| Metric | Value |
|--------|-------|
| Pages tested | X/Y |
| Buttons clicked | X |
| Forms submitted | X |

## בעיות קריטיות
| # | מקור | בעיה | דף/קובץ |
|---|------|------|---------|

## בעיות בינוניות
| # | מקור | בעיה | דף/קובץ |
|---|------|------|---------|

## המלצות לפעולה
### עדיפות גבוהה
1. ...
### עדיפות בינונית
1. ...

</div>
```

---

## Commands

| פקודה | תיאור |
|-------|-------|
| `/review-all [URL]` | ביקורת מלאה - קוד + עיצוב + QA |

## Triggers
- "ביקורת מלאה", "review all", "full review"
- "בדוק הכל", "מוכן לפרודקשן?"
