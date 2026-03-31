---
name: design-pro
description: Full-stack Design Intelligence — מאגד את כל skills העיצוב במערך אחד. משכבות Foundation עד Creative direction, מ-RTL rules עד micro-details. הפעל כשאתה רוצה את הטוב מכולם.
---

# Design Pro — Full Design Intelligence Stack

> כשאתה מפעיל את `/design-pro`, אתה מפעיל **5 שכבות עיצוב** בו-זמנית.
> כל שכבה אחראית על תחום שונה — יחד הן מייצרות ממשקים שמרגישים מושלמים.

---

## Architecture — 5 שכבות, סדר עדיפות ברור

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 5 — /side-panel      (Navigation & Details)          │
│  אין פופאפים — כל modal/sheet → פאנל צדדי RTL אחיד         │
├─────────────────────────────────────────────────────────────┤
│  LAYER 4 — /frontend-design  (Creative & Aesthetic)         │
│  כיוון ויזואלי bold, פונטים ייחודיים, קומפוזיציה           │
├─────────────────────────────────────────────────────────────┤
│  LAYER 3 — /ui-ux-pro-max   (Strategic & Flows)             │
│  היררכיה, flows מורכבים, conversion, נגישות                │
├─────────────────────────────────────────────────────────────┤
│  LAYER 2 — /ui-details      (Micro-refinements)             │
│  text-wrap, shadows, tabular-nums, stagger, concentric r.   │
├─────────────────────────────────────────────────────────────┤
│  LAYER 1 — /design          (Foundation — תמיד פעיל)        │
│  Spacing, tokens, RTL, typography, minimum padding          │
└─────────────────────────────────────────────────────────────┘
```

**כלל:** Layer 1 תמיד. Layers 2-5 לפי הצורך (ראה מטריצה למטה).

---

## מתי להפעיל כל שכבה

| משימה | L1 Design | L2 Details | L3 ProMax | L4 Creative | L5 SidePanel |
|-------|-----------|------------|-----------|-------------|--------------|
| תיקון קומפוננטה קטנה | ✅ | ✅ | — | — | — |
| קומפוננטה חדשה | ✅ | ✅ | — | — | — |
| דף שלם (חדש) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Redesign של דף קיים | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dashboard / מסכי נתונים | ✅ | ✅ | ✅ | — | ✅ |
| Landing page / Marketing | ✅ | ✅ | ✅ | ✅ | — |
| Flow מורכב (onboarding, checkout) | ✅ | ✅ | ✅ | — | ✅ |
| Design System / tokens | ✅ | ✅ | ✅ | — | ✅ |
| בנייה על עיצוב קיים | ✅ | ✅ | — | — | — |

---

## Ritual לפני כל בנייה

```
1. [ ] קרא DESIGN.md → spacing tokens, RTL rules, minimum padding
2. [ ] ls src/components/ → מה קיים? אל תמציא מחדש
3. [ ] grep צבעים → אסור להמציא, רק מ-config / CSS vars
4. [ ] החלט: Layer 3? Layer 4? Layer 5? (לפי טבלה למעלה)
5. [ ] בחר כיוון עיצובי ברור (אם Layer 4) — commit to it!
6. [ ] יש modals/popups? → Layer 5 (שאל icon + background לפני בנייה)
```

---

## Layer 1 — /design (Foundation)

**תמיד פעיל. Source of truth.**

### Spacing Scale (חובה!)
| Token | Tailwind | px | שימוש |
|-------|----------|----|-------|
| 3xs | gap-0.5 | 2 | icon + text צמוד |
| xs | gap-2 | 8 | badge, icon label |
| sm | gap-3 | 12 | שדות בשורה |
| md | gap-4 | 16 | פריטים ברשימה |
| lg | gap-6 | 24 | בין cards |
| xl | gap-8 | 32 | sections |
| 2xl | gap-12 | 48 | בין סקציות גדולות |

### Minimum Padding (מחייב!)
| אלמנט | מינימום |
|-------|---------|
| Button | `px-4 py-2` |
| Card | `p-4` |
| Input | `px-3 py-2` |
| Badge | `px-2 py-0.5` |
| Table Cell | `px-4 py-3` |
| Modal | `p-6` |

### RTL Rules
```tsx
// ✅ תמיד
<div dir="rtl" className="text-right flex flex-row-reverse">
// ps-*/pe-* במקום pl-*/pr-*
// ms-*/me-* במקום ml-*/mr-*
// text-start/text-end במקום text-left/text-right
// start-0/end-0 למיקום absolute
```

---

## Layer 2 — /ui-details (Micro-refinements)

**תמיד פעיל. הפרטים שמרגישים גדולים.**

### Checklist אוטומטי

```tsx
// ✅ Text wrapping — על כל כותרת ופסקה
<h1 className="text-balance">...</h1>
<p className="text-pretty">...</p>

// ✅ Font smoothing — על ה-body
<body className="antialiased">

// ✅ Tabular nums — על מספרים חיים
<span className="tabular-nums">{count}</span>

// ✅ Concentric radius — בכל nesting
// outer(20) = inner(12) + padding(8)
<div className="rounded-[20px] p-2">
  <div className="rounded-[12px]">...</div>
</div>

// ✅ Shadows במקום borders על cards
box-shadow:
  0px 0px 0px 1px rgba(0,0,0,0.06),
  0px 1px 2px -1px rgba(0,0,0,0.06),
  0px 2px 4px 0px rgba(0,0,0,0.04);

// ✅ Transitions (לא keyframes) על hover
transition: transform 0.15s ease, box-shadow 0.2s ease;

// ✅ Exit animations — עדינות
exit={{ y: "-12px", opacity: 0, transition: { duration: 0.15 } }}

// ✅ Stagger — כניסת אלמנטים
animation-delay: calc(var(--stagger) * 80ms);
```

---

## Layer 3 — /ui-ux-pro-max (Strategic)

**להפעיל על flows מורכבים, dashboards, redesign.**

### 5 שאלות אסטרטגיות
```
1. מה המשתמש מנסה להשיג? (job to be done)
2. מה ה-hierarchy of information? (מה רואים ראשון)
3. מה ה-primary action? (אחד בלבד לכל מסך)
4. איפה friction? (מה מאט את המשתמש)
5. mobile-first — מה נעלם/מתכווץ קודם?
```

### Interaction States (חובה!)
```
כל אלמנט אינטראקטיבי חייב:
[ ] default
[ ] hover (visual change ברור)
[ ] focus (ring ≥ 2px)
[ ] active/pressed
[ ] disabled (opacity 50%, לא pointer events)
[ ] loading (skeleton או spinner)
[ ] empty state (לא ריק — הנחה ויזואלית)
[ ] error state (red + icon + מסר)
```

### Accessibility Minimum
```
[ ] contrast ratio ≥ 4.5:1 לטקסט
[ ] contrast ≥ 3:1 לאלמנטי UI
[ ] keyboard navigation מלאה
[ ] aria-label על אייקונים בלי טקסט
[ ] role="alert" על שגיאות
[ ] prefers-reduced-motion נכבד
```

---

## Layer 4 — /frontend-design (Creative)

**להפעיל על דפים חדשים, landing pages, redesign מלא.**

### בחר כיוון — commit to it!
```
לא "אפשרויות" — בחירה אחת ברורה:

● Brutally minimal   — שחור/לבן, טיפוגרפיה גדולה, ללא decoration
● Editorial          — layout א-סימטרי, עיתון, גריד שבור
● Luxury/Refined     — neutral palette, spacing גדול, details עדינים
● Playful            — צבעים bold, illustrations, curves
● Retro-futuristic   — monospace, scanlines, neon accents
● Dark Premium       — deep backgrounds, glows, glass effects
```

### Typography — אל תיקח Inter
```tsx
// ✅ פונטים ייחודיים
'Space Grotesk'    // גאומטרי-טכני
'Clash Display'    // bold editorial
'Satoshi'          // clean modern
'Cabinet Grotesk'  // playful geometric
'Syne'             // futuristic
'Instrument Serif' // editorial elegant
```

### Motion — רק moments עם impact
```tsx
// ✅ Page load — staggered reveal
<motion.div variants={container} initial="hidden" animate="show">

// ✅ Scroll-triggered
whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}

// ✅ Hover שמפתיע
whileHover={{ scale: 1.02, rotate: 0.5 }}

// ❌ אנימציות על כל דבר — זה noise, לא ערך
```

---

## Layer 5 — /side-panel (No Popups)

**הפעל כשיש: modals, dialogs, sheets, drawers, פתיחת רשומות, חלונות פרטים.**

### כלל ברזל
```
❌ <Dialog> / <Modal> / <Sheet> / <Popover> (לתוכן גדול)
✅ <SidePanel> — תמיד, בכל מקרה
```

### לפני בנייה — שאל את המשתמש
```
1. אייקון סגירה: נתיב מותאם (SVG/Lottie) OR ברירת מחדל מהספריה?
2. רקע: לבן / שחור / זכוכית?
```

### Specs מהיר
```
מיקום:    left-0 (55% רוחב, mobile: 100%)
Overlay:  bg-black/65
הנפשה:    x: -100%→0 + opacity 0→1, duration: 1.2s
פינות:    rounded-tr-[0.65rem] rounded-br-[0.65rem]
Header:   title (ימין) | close icon (שמאל)
כיוון:    dir="rtl", text-right
```

---

## Master Checklist לפני Merge

```
FOUNDATION (Layer 1)
[ ] RTL — dir="rtl", ps/pe, flex-row-reverse לרצפים
[ ] Spacing — רק מה-scale, gap בין children
[ ] Padding — מינימום לפי טבלה
[ ] Colors — רק מ-config/vars, לא hardcoded hex
[ ] Touch targets — ≥ 44x44px

MICRO-DETAILS (Layer 2)
[ ] text-balance על כותרות
[ ] antialiased על body
[ ] tabular-nums על מספרים שמתעדכנים
[ ] Concentric border-radius בכל nesting
[ ] Shadows במקום borders על cards
[ ] Transitions (לא keyframes) על hover/focus
[ ] Exit animations ≤ 0.15s, ≤ 12px

STRATEGIC (Layer 3 — אם רלוונטי)
[ ] Primary action אחד בלבד לכל מסך
[ ] כל interaction states מוגדרים
[ ] Empty state לכל list/data
[ ] Error state לכל form
[ ] contrast ratio תקין
[ ] focus ring ברור

CREATIVE (Layer 4 — אם רלוונטי)
[ ] כיוון עיצובי ברור ועקבי
[ ] פונט ייחודי (לא Inter)
[ ] אנימציות רק ב-high-impact moments
[ ] לא "generic AI look"

SIDE PANEL (Layer 5 — כשיש modals/popups)
[ ] אין Dialog / Modal / Sheet — רק SidePanel
[ ] אייקון סגירה הוגדר (שאלת המשתמש)
[ ] רקע הוגדר (שאלת המשתמש)
[ ] dir="rtl" על ה-panel
[ ] כותרת ימין, סגירה שמאל
[ ] rounded-tr + rounded-br 0.65rem
[ ] overlay bg-black/65
[ ] animation 1.2s, x: -100%→0
[ ] mobile: w-full
```

---

## טריגרים אוטומטיים

**הפעל Layer 2+3+4+5 כאשר:**
- "תבנה דף חדש / עמוד חדש"
- "redesign", "שדרוג עיצוב"
- "UI premium / polished / high-quality"

**הפעל Layer 2+3+4 בלבד (ללא 5):**
- "landing page / marketing" (בדרך כלל אין modals)

**הפעל Layer 2+3+5 כאשר:**
- "dashboard", "admin panel", "data table", "CRM"
- "flow מורכב", "onboarding", "checkout"
- "פתיחת רשומה", "פאנל פרטים"

**הפעל Layer 1+2 בלבד:**
- "תיקון קומפוננטה", "הוסף field לטופס"
- "שנה צבע", "תקן spacing"

**הפעל Layer 5 בנפרד:**
- "צור modal", "פופאפ", "dialog", "drawer", "sheet"
- "חלון פרטים", "פאנל צדדי", "side panel"
