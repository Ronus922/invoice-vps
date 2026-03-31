---
name: clone-website
description: AI Website Cloner — reverse-engineers any website into a pixel-perfect Next.js clone using Chrome MCP. 5-phase pipeline with parallel agents in isolated git worktrees.
---

# Clone Website — שכפול אתרים עם AI

**Skill**: `/clone-website <url>`
**מקור**: [ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template)
**דרישה**: Claude Code עם Chrome MCP — `claude --chrome`

---

## ⚡ הפעלה מהירה

```bash
# 1. הכן פרויקט Next.js ריק (או השתמש בקיים)
npx create-next-app@latest my-clone --typescript --tailwind --app

# 2. הפעל Claude Code עם Chrome MCP
claude --chrome

# 3. הרץ את הסקייל
/clone-website https://target-site.com

# (אופציונלי) ערוך TARGET.md לפני הרצה לכיוון מדויק יותר
```

---

## 📋 TARGET.md — הגדרת יעד (אופציונלי)

לפני הרצת הסקייל, ניתן ליצור `TARGET.md` בשורש הפרויקט:

```markdown
# Clone Target

## URL
https://target-site.com

## Pages to Clone
- / (homepage)
- /about
- /pricing

## Fidelity Level
pixel-perfect | structure-only | inspired-by

## Scope Limitations
- Skip: auth pages, user dashboard
- Focus: landing pages, marketing

## Planned Modifications
- Replace logo and brand colors
- Add Hebrew RTL support
- Integrate with our Supabase backend
```

---

## 🔄 5-Phase Pipeline

### Phase 1 — Reconnaissance (Chrome MCP)

```
Chrome MCP → target site
     ├── screenshot: full page + above fold
     ├── design tokens: colors, fonts, spacing, shadows
     ├── interactions: scroll, click, hover states
     ├── responsive: mobile / tablet / desktop
     └── assets: images, icons, fonts URLs
```

**Claude פועל כך:**
```typescript
// Chrome MCP commands (auto-executed)
await chrome.screenshot(url)
await chrome.getComputedStyles(selectors)
await chrome.extractDesignTokens()
await chrome.mapInteractions()
```

### Phase 2 — Foundation Setup

```
├── tailwind.config.ts   ← colors, fonts, spacing מהאתר המקורי
├── globals.css          ← @import כל design tokens
├── public/fonts/        ← הורד פונטים מקוריים
├── public/images/       ← assets מהאתר
└── src/lib/tokens.ts    ← oklch design tokens
```

**Design Tokens (Tailwind v4 + oklch):**
```css
/* globals.css */
@import "tailwindcss";

:root {
  --color-primary: oklch(0.5 0.15 250);   /* מחושב מהאתר המקורי */
  --color-surface: oklch(0.98 0 0);
  --font-heading: "Extracted Font", sans-serif;
  --radius-base: 8px;
}
```

### Phase 3 — Component Specifications

לכל section/קומפוננטה — קובץ spec:

```markdown
<!-- docs/specs/hero-section.md -->
# Hero Section Spec

## Layout
- Height: 100vh, centered content
- Background: gradient oklch(0.2 0.1 250) → oklch(0.1 0.05 250)

## Typography
- H1: 64px, font-weight 700, letter-spacing -0.02em
- Subtitle: 20px, opacity 0.7

## Interactions
- CTA Button: hover scale(1.02), transition 200ms ease
- Background: subtle parallax on scroll (0.3 speed)

## Computed CSS (from Chrome DevTools)
.hero { ... }
.hero-title { ... }
```

### Phase 4 — Parallel Build (Git Worktrees)

**הסקייל מחלק עבודה לסוכנים מקבילים:**

```
main branch
    │
    ├── worktree/feat-hero      → Agent A: Hero section
    ├── worktree/feat-nav       → Agent B: Navigation
    ├── worktree/feat-features  → Agent C: Features section
    ├── worktree/feat-pricing   → Agent D: Pricing section
    └── worktree/feat-footer    → Agent E: Footer
```

**כל agent מקבל:**
1. את ה-spec שלו (`docs/specs/section-name.md`)
2. את ה-design tokens (`src/lib/tokens.ts`)
3. את הרכיבים המשותפים (`src/components/ui/`)

**קוד הפיצול:**
```typescript
// Claude מריץ במקביל — single message
Task(DesignAgent, "Build hero from docs/specs/hero.md in worktree/feat-hero")
Task(DesignAgent, "Build nav from docs/specs/nav.md in worktree/feat-nav")
Task(DesignAgent, "Build features from docs/specs/features.md in worktree/feat-features")
```

### Phase 5 — Assembly & QA

```
worktree/feat-hero    ──┐
worktree/feat-nav     ──┤
worktree/feat-features──┼── merge → main
worktree/feat-pricing ──┤      │
worktree/feat-footer  ──┘      ▼
                         Visual QA (Chrome MCP)
                              │
                    Screenshot comparison:
                    original vs. clone
```

---

## 🏗️ Output Stack

```
Next.js 15/16 (App Router)
├── TypeScript strict
├── Tailwind CSS v4 (oklch tokens)
├── shadcn/ui + Radix primitives
├── Lucide React (icons fallback)
└── Framer Motion (animations)
```

**מבנה תיקיות הפלט:**
```
src/
├── app/
│   ├── page.tsx         ← homepage
│   └── [pages]/page.tsx ← דפים נוספים
├── components/
│   ├── ui/              ← shadcn base components
│   ├── sections/        ← hero, features, pricing...
│   └── layout/          ← nav, footer, layout
├── lib/
│   └── tokens.ts        ← design tokens
public/
├── fonts/               ← extracted fonts
└── images/              ← extracted images
docs/
└── specs/               ← component specifications
```

---

## 🎯 Fidelity Levels

| Level | משמעות | שימוש |
|-------|--------|-------|
| `pixel-perfect` | העתק מדויק 1:1 | לקוח רוצה clone מדויק |
| `structure-only` | Layout + hierarchy בלי style | בסיס לעיצוב חדש |
| `inspired-by` | רוח האתר, לא exact copy | השראה + עיצוב עצמאי |

---

## ⚠️ כללים חשובים

### לגבי RTL
```typescript
// אם הפרויקט בעברית — הוסף RTL לאחר הclone:
// 1. dir="rtl" על <html>
// 2. ps/pe במקום pl/pr
// 3. flex-row-reverse לרצפים
// 4. text-right כברירת מחדל
// /side-panel במקום modals
```

### לגבי Assets
```bash
# הורד assets מקוריים לפני build
node scripts/download-assets.js <target-url>
```

### לגבי Fonts
```typescript
// גלה font stack מהאתר:
// Chrome DevTools → Computed → font-family
// הורד מ-Google Fonts / Adobe Fonts / CDN
```

---

## ✅ Checklist

### לפני הרצה
- [ ] `claude --chrome` פעיל (לא `claude` רגיל)
- [ ] `TARGET.md` מוגדר (אופציונלי אבל מומלץ)
- [ ] פרויקט Next.js ריק מוכן

### בזמן הרצה
- [ ] Chrome MCP מצליח להגיע לאתר (לא blocked)
- [ ] Design tokens נוצרו ב-`tailwind.config.ts`
- [ ] Specs נוצרו ב-`docs/specs/`

### אחרי הרצה
- [ ] Visual comparison: original vs. clone
- [ ] Mobile responsive תקין
- [ ] אנימציות עובדות
- [ ] כל assets נטענים
- [ ] TypeScript `npm run build` עובר

### אם הפרויקט בעברית
- [ ] RTL הוסף לכל הקומפוננטות
- [ ] `/side-panel` במקום modals
- [ ] תוכן הוחלף לעברית
