---
name: uiux-review
description: Visual UI/UX review - RTL, spacing, typography, colors, consistency, responsive, accessibility. Use when reviewing existing interfaces.
---

# /uiux-review - ביקורת UI/UX ויזואלית

## מטרה
ביקורת ויזואלית של ממשק קיים מול ה-Design System. לא בודקים פונקציונליות (זה QA) - בודקים **איכות ויזואלית**.

## מה בודקים

### 1. RTL & Alignment
- `dir="rtl"` על html
- טקסט מיושר לימין
- `flex-row-reverse` לרצפים
- Icons בכיוון נכון
- `ps-*/pe-*` (לא `pl-*/pr-*`)
- Radix UI ללא `dir="ltr"` מוזרק

### 2. Spacing & Padding
- תוכן לא נוגע בגבולות (padding חובה!)
- `gap` על parent (לא margin על children)
- Button: min `px-4 py-2`
- Card: min `p-4`
- Input: min `px-3 py-2`
- Table Cell: min `px-4 py-3`
- Modal: min `p-6`

### 3. Typography
- פונטים תואמים ל-Design System
- סקאלת גדלים עקבית
- weights נכונים (headings bold, body normal)
- line-height מתאים
- אין overflow / חיתוך טקסט

### 4. Color Consistency
- צבעים מ-tailwind.config / CSS variables בלבד
- אין hardcoded hex "המצאות"
- contrast ≥ 4.5:1
- hover states עקביים
- צבעים סמנטיים (success/error/warning)

### 5. Component Consistency
- כפתורים באותו סגנון
- כרטיסים באותו border-radius
- inputs באותו גובה
- badges/shadows עקביים

### 6. Responsive (4 breakpoints)
- Mobile 375px - stacks, hamburger, קריא
- Tablet 768px - grid adapts
- Desktop 1024px - full layout
- Wide 1440px - max-width, no stretch

### 7. Accessibility
- Contrast ratios
- Focus indicators (focus-visible)
- Touch targets ≥ 44x44px
- Error = icon + color (לא רק צבע)

---

## Commands

| פקודה | תיאור |
|-------|-------|
| `/uiux-review full [URL]` | ביקורת מלאה - כל הקטגוריות |
| `/uiux-review rtl [URL]` | רק בדיקות RTL |
| `/uiux-review spacing [URL]` | רק spacing & padding |
| `/uiux-review responsive [URL]` | רק responsive |
| `/uiux-review colors [URL]` | רק צבעים ועקביות |

---

## דוח
פלט: קובץ `UIUX-REVIEW.md` בפרויקט, RTL מעוצב עם ציון לפי קטגוריה (X/70).
ראה `agents/uiux-review.md` לפורמט מלא.

---

## Triggers
- "בדוק עיצוב", "review UI", "ביקורת ויזואלית"
- "בדוק RTL", "בדוק spacing", "בדוק צבעים"
- "האם העיצוב עקבי?"
