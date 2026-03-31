---
name: qa
description: QA Testing methodology with Playwright MCP. Use for automated testing, bug hunting, and QA reports.
---

# /qa - Quality Assurance Skill

## Iron Rules

1. **בלי snapshot = בלי PASS** - כל PASS בדוח חייב להפנות ל-browser_snapshot שבוצע. לא בדקת? כתוב NOT TESTED
2. **תשתמש באפליקציה!** - אתה לא כותב דוח, אתה **משתמש** באפליקציה דרך Playwright. כל כפתור - לחץ. כל קישור - לחץ. כל dropdown - פתח. כל טופס - מלא ושלח
3. **כנות מעל שלמות** - אוזל context? עצור וכתוב דוח כנה. NOT TESTED על מה שלא בדקת. לעולם לא PASS על דבר שלא נבדק
4. **עדכן QA-TRACKER.md** - אחרי כל דף שנבדק, עדכן מיידית

---

## MCP Tools

```
browser_navigate        → ניווט ל-URL
browser_snapshot        → מפת אלמנטים (עדיף על screenshot!)
browser_click           → לחיצה (לפי ref מ-snapshot)
browser_type            → הקלדת טקסט
browser_fill_form       → מילוי טפסים
browser_resize          → responsive
browser_take_screenshot → צילום מסך
browser_evaluate        → הרצת JS
browser_press_key       → לחיצת מקש
browser_select_option   → בחירה מ-dropdown
browser_console_messages → שגיאות קונסול
browser_network_requests → בקשות רשת
browser_hover           → ריחוף (tooltips, menus)
browser_wait_for        → המתנה לטקסט/אלמנט
browser_tabs            → ניהול טאבים
browser_close           → סגירת דפדפן
```

---

## Phase 0: מיפוי (לפני פתיחת דפדפן!)

```
1. קרא package.json → טכנולוגיה
2. מפה routes/pages (Next.js: app/**/page.tsx, React: grep Route)
3. צור PAGE_LIST ממוספרת עם סיווג:
   - כמה כפתורים/קישורים בכל דף (הערכה מהקוד)
   - האם יש טפסים
   - האם יש אשפים (wizard/stepper)
   - האם יש טבלאות/רשימות
4. בדוק אם קיים QA-TRACKER.md מ-session קודם
```

**פלט:** רשימת כל הדפים שצריך לבדוק.

---

## Phase 1: פתיחה + אימות

```
browser_navigate → URL
browser_snapshot → מפת דף הבית
browser_console_messages → שגיאות קיימות

אם צריך login:
  browser_fill_form → credentials (שאל את המשתמש!)
  browser_click → submit
  browser_snapshot → ודא מצב מחובר
```

---

## Phase 2: סריקה שיטתית - כל דף, כל אלמנט!

**לכל דף ברשימה, בצע את כל השלבים הבאים:**

### 2a. מצב ראשוני
```
browser_navigate → URL
browser_snapshot → מפת אלמנטים מלאה
browser_console_messages → שגיאות JS
```

### 2b. כל אלמנט אינטראקטיבי (בלי יוצא מן הכלל!)

מה-snapshot, מצא כל אלמנט לחיץ ובדוק אותו:

**כפתורים:**
```
browser_click → כל כפתור
browser_snapshot → ודא שקרה מה שצריך (מודל? שינוי state? ניווט?)
אם נפתח מודל → בדוק גם את תוכן המודל + כפתור סגירה
```

**קישורים:**
```
browser_click → כל קישור
ודא ניווט תקין (לא 404, לא שגיאה)
browser_navigate_back → חזור
```

**Dropdowns:**
```
browser_click → פתח dropdown
browser_snapshot → ודא אפשרויות נפתחות
browser_select_option → בחר אפשרות
browser_snapshot → ודא שינוי
```

**טפסים:**
```
browser_fill_form → מלא בנתונים מ-Test Data Bank
browser_click → submit
browser_snapshot → ודא הצלחה/שגיאה

אם אשף (wizard/stepper) → בצע כל שלב:
  שלב 1: מלא + browser_snapshot + Next
  שלב 2: מלא + browser_snapshot + Next
  ...עד סיום כל השלבים
```

**Tabs/Toggles:**
```
browser_click → כל tab
browser_snapshot → ודא תוכן משתנה
```

**Tooltips/Hover:**
```
browser_hover → אלמנטים עם tooltip
browser_snapshot → ודא tooltip מופיע
```

**Search/Filter:**
```
browser_type → טקסט חיפוש
browser_snapshot → ודא תוצאות מסוננות
```

**Pagination:**
```
browser_click → עמוד הבא
browser_snapshot → ודא תוכן משתנה
```

**Delete/Actions:**
```
browser_click → כפתור מחיקה/פעולה
browser_snapshot → ודא dialog אישור (אם קיים)
```

### 2c. מצבים מיוחדים
```
Empty state: רשימה ריקה / חיפוש ללא תוצאות
Loading state: spinner/skeleton בזמן טעינה?
Overflow: browser_type → טקסט ארוך מאוד, ודא שלא שובר layout
```

### 2d. RTL ויזואלי
```
לכל דף, ודא:
- טקסט מיושר לימין
- Flex direction נכון
- Icons בכיוון נכון (חצים!)
- Padding קיים (תוכן לא נוגע בגבולות)
- Touch targets ≥ 44x44px
```

### 2e. עדכון tracker
```
אחרי סיום בדיקת הדף, עדכן QA-TRACKER.md מיידית
```

---

## Phase 3: Responsive - לכל דף שנבדק

```
browser_resize → 375, 812   (Mobile)
  browser_snapshot → layout מותאם?
  hamburger menu עובד?

browser_resize → 768, 1024  (Tablet)
  browser_snapshot → layout מתאים?

browser_resize → 1024, 768  (Desktop)
  browser_snapshot

browser_resize → 1440, 900  (Wide)
  browser_snapshot → max-width? לא נמתח?
```

---

## Phase 4: בדיקות חוצות-דפים

```
ניווט:
  כל קישורי navbar/sidebar עובדים
  breadcrumbs תקינים (אם יש)
  back button

Console:
  browser_console_messages → level: "error"
  תעד כל שגיאת JS
```

---

## Test Data Bank

| שדה | ערך תקין | ערך לא תקין |
|-----|---------|-------------|
| שם פרטי | ישראל | (ריק) |
| שם משפחה | ישראלי | a |
| טלפון | 052-1234567 | 123 |
| אימייל | test@example.co.il | not-email |
| ת.ז. | 123456789 | abc |
| כתובת | רחוב הרצל 1, תל אביב | (ריק) |
| הערות | טקסט לבדיקה בעברית כדי לוודא שהכל עובד כמו שצריך | `<script>alert(1)</script>` |
| מספר | 42 | -1 |
| תאריך | 2026-01-15 | not-a-date |
| סכום | 1000.50 | abc |

---

## Context Budget

```
≤5 דפים:   בדוק הכל - כל אלמנט, כל breakpoint
6-15 דפים:  כל אלמנט בכל דף, responsive רק על 2 breakpoints (375, 1440)
15+ דפים:  כל דף לפחות snapshot + כפתורים/קישורים, responsive רק על דפים ראשיים
אוזל context: עצור! כתוב דוח כנה עם NOT TESTED על מה שנשאר
```

---

## QA-TRACKER.md

קובץ שנוצר/מתעדכן בroot של הפרויקט הנבדק:

```markdown
# QA Tracker - [Project]
Last Run: [DATE]

## Pages
| # | Page | URL | Buttons | Links | Forms | Wizards | Tables | Status | Date |
|---|------|-----|---------|-------|-------|---------|--------|--------|------|
| 1 | Dashboard | /dashboard | 5 | 8 | 0 | 0 | 2 | TESTED | 2026-02-14 |
| 2 | Add Customer | /customers/new | 3 | 2 | 1 | 1 | 0 | TESTED | 2026-02-14 |
| 3 | Settings | /settings | 4 | 1 | 2 | 0 | 0 | NOT TESTED | - |

## Issues Found
| # | Page | Element | Description | Severity |
|---|------|---------|-------------|----------|

## Untested (next session)
- /settings
- /reports
```

---

## פורמט דוח - QA-REPORT.md

```markdown
<div dir="rtl" align="right">

# דוח QA - [שם הפרויקט]

| | |
|---|---|
| **תאריך** | [DATE] |
| **כתובת** | [URL] |
| **בודק** | QA Agent (Playwright MCP) |

## Test Evidence
| Metric | Value |
|--------|-------|
| Pages Visited | X |
| Snapshots Taken | X |
| Buttons Clicked | X |
| Links Clicked | X |
| Forms Submitted | X |
| Wizards Completed | X |
| Dropdowns Tested | X |

## סיכום
| מדד | ערך |
|-----|-----|
| **דפים שנבדקו** | X מתוך Y |
| **בעיות קריטיות** | X |
| **בעיות בינוניות** | X |
| **אחוז הצלחה** | XX% |

## בעיות קריטיות
### 1. [כותרת]
- **דף:** [URL]
- **אלמנט:** [תיאור]
- **מה קורה:** [תיאור הבעיה]
- **מה צריך לקרות:** [ציפייה]
- **שלבי שחזור:** 1... 2... 3...

## בעיות בינוניות
### 1. [כותרת]
- **דף:** [URL]
- **תיאור:** [פירוט]

## מסכים שנבדקו
| # | מסך | URL | כפתורים | קישורים | טפסים | Responsive | סטטוס |
|---|-----|-----|---------|---------|-------|------------|-------|

## שגיאות Console
| # | שגיאה | דף | חומרה |
|---|-------|-----|-------|

</div>
```

---

## Commands

| פקודה | תיאור |
|-------|-------|
| `/qa [URL]` | בדיקה מלאה - כל דף, כל אלמנט |
| `/qa quick [URL]` | סריקה מהירה - רק כפתורים ושגיאות |

---

## Triggers
- "בדוק", "test", "QA", "בדיקות"
- "סרוק את האתר", "מצא באגים"
- "bug hunt", "בדיקת איכות"
