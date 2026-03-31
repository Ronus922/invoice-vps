---
name: design
description: UI/UX guidelines - Spacing system, colors, typography, RTL layout, Tailwind v4 and modern design patterns.
---

# DESIGN.md - Modern Design System 2026

## מסמך זה מגדיר את כללי העיצוב המחייבים. קרא אותו לפני כל עבודה על UI.

> **הוראה ל-Claude:** כשעובדים על קומפוננטות מורכבות (Toasts, Empty States, Pagination, Breadcrumbs, Tooltips, Dropdowns, Alerts, Progress, Accordion, Avatar, File Upload) - קרא גם את `COMPONENTS.md` מאותה תיקייה.

---

# 1. SPACING SYSTEM (הכי חשוב!)

## 1.1 הכלל הזהב: Gap Over Margin

**Parent שולט על הריווח, Children בלי margin חיצוני.**

```tsx
// ✅ נכון - Parent שולט
<div className="flex flex-col gap-6">
  <Card />
  <Card />
</div>

// ❌ שגוי - Child עם margin
<Card className="mb-6" />
```

## 1.2 Spacing Scale (חובה להשתמש רק בערכים אלו)

| Token | Tailwind | Pixels | שימוש |
|-------|----------|--------|-------|
| 3xs | gap-0.5 | 2px | בין icon לטקסט צמוד |
| 2xs | gap-1 | 4px | בין אלמנטים קטנים מאוד |
| xs | gap-2 | 8px | בין icon לטקסט, בין badge לטקסט |
| sm | gap-3 | 12px | בין שדות טופס בשורה |
| md | gap-4 | 16px | בין פריטים ברשימה, בין שדות טופס |
| lg | gap-6 | 24px | בין קבוצות תוכן, בין cards |
| xl | gap-8 | 32px | בין sections קטנים |
| 2xl | gap-10 | 40px | בין sections בינוניים |
| 3xl | gap-12 | 48px | בין sections גדולים |
| 4xl | gap-16 | 64px | בין sections ראשיים |
| 5xl | gap-20 | 80px | padding של section ראשי |

## 1.3 Internal Padding (ריווח פנימי)

| אלמנט | Mobile | Desktop | דוגמה |
|-------|--------|---------|-------|
| **Page Container** | px-4 | px-6 lg:px-8 | תוכן ראשי |
| **Section** | py-12 px-4 | py-20 px-8 | אזור בדף |
| **Card** | p-4 | p-6 | כרטיס |
| **Card Large** | p-6 | p-8 | כרטיס גדול |
| **Button Primary** | px-6 py-3 | px-8 py-4 | כפתור ראשי |
| **Button Secondary** | px-4 py-2 | px-6 py-3 | כפתור משני |
| **Input** | px-4 py-3 | px-4 py-3 | שדה קלט |
| **Table Cell** | px-4 py-4 | px-6 py-4 | תא בטבלה |
| **Modal** | p-4 | p-6 lg:p-8 | חלון קופץ |
| **Dropdown Item** | px-4 py-3 | px-4 py-3 | פריט בתפריט |

## 1.4 Section Spacing

```tsx
// Section סטנדרטי
<section className="py-12 md:py-20 px-4 md:px-8">
  <div className="container mx-auto max-w-7xl">
    <div className="space-y-8 md:space-y-12">
      {/* תוכן */}
    </div>
  </div>
</section>

// Hero Section (יותר גדול)
<section className="py-16 md:py-28 px-4 md:px-8">
  ...
</section>

// Section קומפקטי
<section className="py-8 md:py-12 px-4 md:px-8">
  ...
</section>
```

---

# 2. TYPOGRAPHY SYSTEM

## 2.1 Font Families

```css
/* globals.css */
:root {
  --font-heading: 'Rubik', sans-serif;  /* כותרות */
  --font-body: 'Assistant', sans-serif;  /* גוף טקסט */
  --font-mono: 'JetBrains Mono', monospace; /* קוד */
}
```

## 2.2 Type Scale

| שם | Mobile | Desktop | Weight | שימוש |
|----|--------|---------|--------|-------|
| **Display** | text-4xl (36px) | text-6xl (60px) | font-bold | Hero headline |
| **H1** | text-3xl (30px) | text-5xl (48px) | font-bold | כותרת עמוד |
| **H2** | text-2xl (24px) | text-4xl (36px) | font-bold | כותרת section |
| **H3** | text-xl (20px) | text-2xl (24px) | font-semibold | כותרת משנה |
| **H4** | text-lg (18px) | text-xl (20px) | font-semibold | כותרת קטנה |
| **Body Large** | text-lg (18px) | text-xl (20px) | font-normal | פסקה מודגשת |
| **Body** | text-base (16px) | text-lg (18px) | font-normal | טקסט רגיל |
| **Body Small** | text-sm (14px) | text-base (16px) | font-normal | טקסט משני |
| **Caption** | text-xs (12px) | text-sm (14px) | font-medium | תיאור, תווית |
| **Overline** | text-xs (12px) | text-xs (12px) | font-semibold uppercase tracking-wider | קטגוריה |

## 2.3 Line Height & Letter Spacing

```tsx
// כותרות - צפוף יותר
<h1 className="text-5xl font-bold leading-tight tracking-tight">

// גוף טקסט - נוח לקריאה
<p className="text-lg leading-relaxed">

// Caption - מרווח יותר
<span className="text-sm tracking-wide">
```

## 2.4 Text Colors

| שימוש | Light Mode | Dark Mode |
|-------|------------|-----------|
| **Primary** | text-slate-900 | text-white |
| **Secondary** | text-slate-600 | text-slate-300 |
| **Muted** | text-slate-500 | text-slate-400 |
| **Disabled** | text-slate-400 | text-slate-500 |
| **Link** | text-primary hover:text-primary/80 | |
| **Error** | text-red-600 | text-red-400 |
| **Success** | text-green-600 | text-green-400 |

---

# 3. COLOR SYSTEM

## 3.1 Brand Colors (CSS Variables)

```css
/* globals.css */
:root {
  /* Primary */
  --color-primary: 262 83% 58%;      /* Purple */
  --color-primary-hover: 262 83% 48%;
  --color-primary-light: 262 83% 95%;

  /* Secondary */
  --color-secondary: 199 89% 48%;    /* Cyan */

  /* Accent */
  --color-accent: 38 92% 50%;        /* Orange */

  /* Semantic */
  --color-success: 142 76% 36%;
  --color-warning: 38 92% 50%;
  --color-error: 0 84% 60%;
  --color-info: 199 89% 48%;

  /* Neutrals */
  --color-background: 0 0% 100%;
  --color-foreground: 222 47% 11%;
  --color-card: 0 0% 100%;
  --color-border: 214 32% 91%;
  --color-muted: 210 40% 96%;
}

.dark {
  --color-background: 222 47% 11%;
  --color-foreground: 210 40% 98%;
  --color-card: 217 33% 17%;
  --color-border: 217 33% 25%;
  --color-muted: 217 33% 20%;
}
```

## 3.2 Background Hierarchy

| Layer | Light | Dark | שימוש |
|-------|-------|------|-------|
| **Base** | bg-white | bg-slate-950 | רקע עמוד |
| **Elevated** | bg-slate-50 | bg-slate-900 | sections, sidebars |
| **Card** | bg-white | bg-slate-900 | כרטיסים |
| **Overlay** | bg-black/50 | bg-black/70 | רקע modal |
| **Hover** | bg-slate-100 | bg-slate-800 | hover states |
| **Active** | bg-slate-200 | bg-slate-700 | active states |

## 3.3 Ready-Made Palettes

```tsx
// 5 פלטות מוכנות - בחר אחת והחלף ב-globals.css
const palettes = {
  // 🌊 Ocean - מקצועי, אמין
  ocean: {
    primary: '#0ea5e9',     // sky-500
    secondary: '#0284c7',   // sky-600
    accent: '#f97316',      // orange-500
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
  },

  // 🌲 Forest - טבעי, רגוע
  forest: {
    primary: '#22c55e',     // green-500
    secondary: '#16a34a',   // green-600
    accent: '#a855f7',      // purple-500
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
  },

  // 🌅 Sunset - חם, אנרגטי
  sunset: {
    primary: '#f97316',     // orange-500
    secondary: '#ea580c',   // orange-600
    accent: '#8b5cf6',      // violet-500
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
  },

  // 👑 Royal - יוקרתי, אלגנטי
  royal: {
    primary: '#8b5cf6',     // violet-500
    secondary: '#7c3aed',   // violet-600
    accent: '#f59e0b',      // amber-500
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
  },

  // ⚫ Minimal - נקי, מודרני
  minimal: {
    primary: '#18181b',     // zinc-900
    secondary: '#27272a',   // zinc-800
    accent: '#3b82f6',      // blue-500
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
  },
}
```

## 3.4 Hebrew Font Pairings

```css
/* Combo 1: מודרני ונקי */
:root {
  --font-heading: 'Heebo', sans-serif;
  --font-body: 'Assistant', sans-serif;
}

/* Combo 2: אלגנטי ומעוגל */
:root {
  --font-heading: 'Rubik', sans-serif;
  --font-body: 'Noto Sans Hebrew', sans-serif;
}

/* Combo 3: טכני ומקצועי */
:root {
  --font-heading: 'IBM Plex Sans Hebrew', sans-serif;
  --font-body: 'Open Sans Hebrew', sans-serif;
}

/* Combo 4: קלאסי ורציני */
:root {
  --font-heading: 'Frank Ruhl Libre', serif;
  --font-body: 'Heebo', sans-serif;
}

/* Combo 5: צעיר ודינמי */
:root {
  --font-heading: 'Secular One', sans-serif;
  --font-body: 'Assistant', sans-serif;
}
```

```tsx
// טעינה ב-Next.js
import { Heebo, Assistant } from 'next/font/google'

const heebo = Heebo({ subsets: ['hebrew'], variable: '--font-heading' })
const assistant = Assistant({ subsets: ['hebrew'], variable: '--font-body' })

// בlayout.tsx
<body className={`${heebo.variable} ${assistant.variable}`}>
```

---

# 4. COMPONENT PATTERNS

## 4.1 Buttons

```tsx
// Primary Button - CTA ראשי
<button className="
  px-8 py-4
  bg-primary text-white font-semibold
  rounded-xl
  shadow-md shadow-primary/25
  hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30
  active:scale-[0.98]
  transition-all duration-200
  flex items-center justify-center gap-2
  min-h-[48px] min-w-[120px]
">
  <span>התחל עכשיו</span>
  <ArrowLeft className="w-5 h-5" />
</button>

// Secondary Button
<button className="
  px-6 py-3
  bg-transparent text-primary font-medium
  border-2 border-primary
  rounded-xl
  hover:bg-primary/10
  active:scale-[0.98]
  transition-all duration-200
  min-h-[44px]
">
  מידע נוסף
</button>

// Ghost Button
<button className="
  px-4 py-2
  text-slate-600 font-medium
  rounded-lg
  hover:bg-slate-100 hover:text-slate-900
  transition-colors duration-200
">
  ביטול
</button>

// Icon Button
<button className="
  p-3
  rounded-full
  text-slate-500
  hover:bg-slate-100 hover:text-slate-700
  transition-colors duration-200
" aria-label="תפריט">
  <Menu className="w-5 h-5" />
</button>
```

## 4.2 Cards

```tsx
// Standard Card
<div className="
  bg-white dark:bg-slate-900
  rounded-2xl
  border border-slate-200 dark:border-slate-800
  shadow-sm
  hover:shadow-md hover:border-slate-300
  transition-all duration-300
  overflow-hidden
">
  {/* Image */}
  <div className="relative aspect-video">
    <Image src="..." alt="..." fill className="object-cover" />
  </div>

  {/* Content */}
  <div className="p-6 space-y-4">
    <div className="space-y-2">
      <span className="text-xs font-semibold text-primary uppercase tracking-wider">
        קטגוריה
      </span>
      <h3 className="text-xl font-bold text-slate-900 dark:text-white">
        כותרת הכרטיס
      </h3>
    </div>
    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
      תיאור קצר של התוכן...
    </p>
  </div>

  {/* Footer */}
  <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
    <span className="text-sm text-slate-500">12 ינואר 2026</span>
    <button className="text-primary font-medium hover:underline">
      קרא עוד
    </button>
  </div>
</div>

// Stats Card
<div className="
  bg-gradient-to-br from-primary to-primary/80
  text-white
  rounded-2xl
  p-6
  shadow-lg shadow-primary/25
">
  <div className="flex items-start justify-between">
    <div className="space-y-1">
      <p className="text-white/80 text-sm font-medium">סה"כ משתמשים</p>
      <p className="text-4xl font-bold">2,847</p>
    </div>
    <div className="p-3 bg-white/20 rounded-xl">
      <Users className="w-6 h-6" />
    </div>
  </div>
  <div className="mt-4 flex items-center gap-2 text-sm">
    <span className="flex items-center gap-1 text-green-300">
      <TrendingUp className="w-4 h-4" />
      +12.5%
    </span>
    <span className="text-white/60">מהחודש שעבר</span>
  </div>
</div>

// Interactive List Card
<div className="
  bg-white dark:bg-slate-900
  rounded-xl
  border border-slate-200 dark:border-slate-800
  divide-y divide-slate-100 dark:divide-slate-800
  overflow-hidden
">
  {items.map(item => (
    <div key={item.id} className="
      p-4
      flex items-center gap-4
      hover:bg-slate-50 dark:hover:bg-slate-800/50
      transition-colors duration-200
      cursor-pointer
    ">
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{item.title}</p>
        <p className="text-sm text-slate-500 truncate">{item.subtitle}</p>
      </div>
      <ChevronLeft className="w-5 h-5 text-slate-400" />
    </div>
  ))}
</div>
```

## 4.3 Tables

```tsx
<div className="
  bg-white dark:bg-slate-900
  rounded-xl
  border border-slate-200 dark:border-slate-800
  overflow-hidden
">
  <table className="w-full">
    {/* Header */}
    <thead>
      <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
        <th className="px-6 py-4 text-start text-sm font-semibold text-slate-900 dark:text-white">
          שם
        </th>
        <th className="px-6 py-4 text-start text-sm font-semibold text-slate-900 dark:text-white">
          תפקיד
        </th>
        <th className="px-6 py-4 text-start text-sm font-semibold text-slate-900 dark:text-white">
          סטטוס
        </th>
        <th className="px-6 py-4 text-end text-sm font-semibold text-slate-900 dark:text-white">
          פעולות
        </th>
      </tr>
    </thead>

    {/* Body */}
    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map(row => (
        <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
          <td className="px-6 py-4">
            <div className="flex items-center gap-3">
              <Avatar src={row.avatar} size="sm" />
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{row.name}</p>
                <p className="text-sm text-slate-500">{row.email}</p>
              </div>
            </div>
          </td>
          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
            {row.role}
          </td>
          <td className="px-6 py-4">
            <Badge variant={row.status === 'active' ? 'success' : 'warning'}>
              {row.status}
            </Badge>
          </td>
          <td className="px-6 py-4 text-end">
            <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <MoreVertical className="w-5 h-5 text-slate-500" />
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

## 4.4 Forms

```tsx
// Form Layout
<form className="space-y-6">
  {/* Form Section */}
  <div className="space-y-4">
    <h3 className="text-lg font-semibold">פרטים אישיים</h3>

    {/* Two Columns */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <FormField label="שם פרטי" required>
        <Input placeholder="הזן שם פרטי" />
      </FormField>
      <FormField label="שם משפחה" required>
        <Input placeholder="הזן שם משפחה" />
      </FormField>
    </div>

    {/* Full Width */}
    <FormField label="אימייל" required>
      <Input type="email" placeholder="example@email.com" />
    </FormField>
  </div>

  {/* Actions */}
  <div className="flex items-center justify-end gap-3 pt-4 border-t">
    <Button variant="ghost">ביטול</Button>
    <Button type="submit">שמור</Button>
  </div>
</form>

// Input Field
<div className="space-y-2">
  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
    שם מלא <span className="text-red-500">*</span>
  </label>
  <input
    type="text"
    className="
      w-full
      h-12
      px-4
      bg-white dark:bg-slate-900
      border border-slate-300 dark:border-slate-700
      rounded-xl
      text-slate-900 dark:text-white
      placeholder:text-slate-400
      focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
      transition-all duration-200
    "
    placeholder="הזן שם מלא..."
  />
  <p className="text-sm text-slate-500">טקסט עזרה אופציונלי</p>
</div>

// Select
<div className="space-y-2">
  <label className="block text-sm font-medium text-slate-700">
    בחר אפשרות
  </label>
  <select className="
    w-full
    h-12
    px-4
    bg-white dark:bg-slate-900
    border border-slate-300 dark:border-slate-700
    rounded-xl
    text-slate-900 dark:text-white
    focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
    transition-all duration-200
    appearance-none
    bg-[url('data:image/svg+xml;...')] bg-no-repeat bg-[center_right_1rem]
  ">
    <option value="">בחר...</option>
    <option value="1">אפשרות 1</option>
    <option value="2">אפשרות 2</option>
  </select>
</div>

// Textarea
<textarea className="
  w-full
  min-h-[120px]
  px-4 py-3
  bg-white dark:bg-slate-900
  border border-slate-300 dark:border-slate-700
  rounded-xl
  text-slate-900 dark:text-white
  placeholder:text-slate-400
  focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  resize-y
  transition-all duration-200
"
  placeholder="הזן תיאור..."
/>

// Checkbox
<label className="flex items-start gap-3 cursor-pointer group">
  <input
    type="checkbox"
    className="
      w-5 h-5 mt-0.5
      rounded
      border-slate-300
      text-primary
      focus:ring-primary/50
      transition-colors
    "
  />
  <span className="text-slate-700 group-hover:text-slate-900 transition-colors">
    אני מסכים לתנאי השימוש
  </span>
</label>
```

## 4.5 Badges & Tags

```tsx
// Status Badge
<span className="
  inline-flex items-center gap-1.5
  px-3 py-1
  text-xs font-semibold
  rounded-full
  bg-green-100 text-green-700
  dark:bg-green-900/30 dark:text-green-400
">
  <span className="w-1.5 h-1.5 rounded-full bg-current" />
  פעיל
</span>

// Count Badge
<span className="
  inline-flex items-center justify-center
  min-w-[24px] h-6
  px-2
  text-xs font-bold
  rounded-full
  bg-primary text-white
">
  12
</span>

// Tag
<span className="
  inline-flex items-center gap-1
  px-3 py-1.5
  text-sm
  rounded-lg
  bg-slate-100 text-slate-700
  dark:bg-slate-800 dark:text-slate-300
">
  עיצוב
  <button className="hover:text-slate-900 transition-colors">
    <X className="w-3.5 h-3.5" />
  </button>
</span>
```

## 4.6 Navigation

```tsx
// Header Navigation
<header className="
  sticky top-0 z-40
  bg-white/80 dark:bg-slate-950/80
  backdrop-blur-md
  border-b border-slate-200 dark:border-slate-800
">
  <div className="container mx-auto px-4 md:px-8">
    <div className="h-16 md:h-20 flex items-center justify-between">
      <Logo />
      <nav className="hidden md:flex items-center gap-8">
        <NavLink href="/">בית</NavLink>
        <NavLink href="/about">אודות</NavLink>
        <NavLink href="/contact">צור קשר</NavLink>
      </nav>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm">התחברות</Button>
        <Button size="sm">הרשמה</Button>
      </div>
    </div>
  </div>
</header>

// Sidebar Navigation
<aside className="
  w-64
  h-screen
  bg-slate-50 dark:bg-slate-900
  border-e border-slate-200 dark:border-slate-800
  p-4
">
  <nav className="space-y-1">
    <SidebarLink icon={Home} active>דשבורד</SidebarLink>
    <SidebarLink icon={Users}>משתמשים</SidebarLink>
    <SidebarLink icon={Settings}>הגדרות</SidebarLink>
  </nav>
</aside>

// Sidebar Link
<a className="
  flex items-center gap-3
  px-4 py-3
  rounded-xl
  text-slate-600 dark:text-slate-400
  hover:bg-slate-100 dark:hover:bg-slate-800
  hover:text-slate-900 dark:hover:text-white
  transition-colors duration-200

  /* Active State */
  data-[active]:bg-primary/10
  data-[active]:text-primary
  data-[active]:font-medium
">
  <Icon className="w-5 h-5" />
  <span>טקסט</span>
</a>

// Tabs
<div className="border-b border-slate-200 dark:border-slate-800">
  <nav className="flex gap-8">
    <button className="
      px-1 py-4
      text-slate-600 dark:text-slate-400
      border-b-2 border-transparent
      hover:text-slate-900 dark:hover:text-white
      hover:border-slate-300
      transition-all duration-200

      /* Active */
      data-[active]:text-primary
      data-[active]:border-primary
      data-[active]:font-medium
    ">
      כללי
    </button>
  </nav>
</div>
```

## 4.7 Modals & Dialogs

```tsx
// Modal Container
<div className="
  fixed inset-0 z-50
  flex items-center justify-center
  p-4
">
  {/* Backdrop */}
  <div className="
    absolute inset-0
    bg-black/50
    backdrop-blur-sm
  " onClick={onClose} />

  {/* Modal */}
  <div className="
    relative
    w-full max-w-lg
    bg-white dark:bg-slate-900
    rounded-2xl
    shadow-2xl
    overflow-hidden
    animate-in fade-in zoom-in-95 duration-200
  ">
    {/* Header */}
    <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
      <h2 className="text-xl font-bold">כותרת Modal</h2>
      <button
        onClick={onClose}
        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
    </div>

    {/* Body */}
    <div className="p-6">
      {children}
    </div>

    {/* Footer */}
    <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
      <Button variant="ghost" onClick={onClose}>ביטול</Button>
      <Button onClick={onConfirm}>אישור</Button>
    </div>
  </div>
</div>
```

## 4.5 StatusBadge Pattern

```tsx
// Pattern לתצוגת סטטוס צבעוני
const statusConfig = {
  active: { label: 'פעיל', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  pending: { label: 'ממתין', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  sold: { label: 'נמכר', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  inactive: { label: 'לא פעיל', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  error: { label: 'שגיאה', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
} as const

type Status = keyof typeof statusConfig

function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status]
  return (
    <span className={`px-2 py-1 rounded-full text-sm font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}

// שימוש
<StatusBadge status="active" />
<StatusBadge status="pending" />
<StatusBadge status="error" />
```

---

# 5. RESPONSIVE DESIGN

## 5.1 Breakpoints

| Name | Min Width | Tailwind | שימוש |
|------|-----------|----------|-------|
| **Mobile** | 0px | (default) | טלפונים |
| **sm** | 640px | sm: | טלפונים גדולים |
| **md** | 768px | md: | טאבלטים |
| **lg** | 1024px | lg: | לפטופים |
| **xl** | 1280px | xl: | מסכים גדולים |
| **2xl** | 1536px | 2xl: | מסכים רחבים |

## 5.2 Container Width

```tsx
// Standard Container
<div className="container mx-auto px-4 md:px-6 lg:px-8 max-w-7xl">

// Narrow Container (for reading)
<div className="container mx-auto px-4 max-w-3xl">

// Full Width with Padding
<div className="w-full px-4 md:px-8 lg:px-12">
```

## 5.3 Responsive Patterns

```tsx
// Grid - Cards
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">

// Grid - Two Columns Layout
<div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8">

// Flex - Stack on Mobile
<div className="flex flex-col md:flex-row md:items-center gap-4">

// Hide on Mobile
<div className="hidden md:block">

// Show only on Mobile
<div className="md:hidden">

// Different Font Sizes
<h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl">

// Different Padding
<section className="py-8 sm:py-12 md:py-16 lg:py-20">
```

## 5.4 Touch Targets

**מינימום 44x44 pixels לכל אלמנט לחיץ במובייל!**

```tsx
// ✅ נכון
<button className="min-h-[44px] min-w-[44px] p-3">

// ❌ שגוי
<button className="p-1"> // קטן מדי!
```

---

# 6. ANIMATIONS - Framer Motion & ScrollTrigger

## 6.1 Setup

```bash
pnpm add framer-motion
pnpm add gsap @gsap/react  # לScrollTrigger
```

## 6.2 Reduced Motion (חובה!)

```tsx
// hooks/useReducedMotion.ts
import { useReducedMotion } from 'framer-motion'

export function useAnimationConfig() {
  const shouldReduce = useReducedMotion()

  return {
    initial: shouldReduce ? false : { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: shouldReduce ? { duration: 0 } : { duration: 0.5 }
  }
}
```

```css
/* Global CSS fallback */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## 6.3 Framer Motion Patterns

### Page Transitions
```tsx
// components/PageTransition.tsx
'use client'
import { motion } from 'framer-motion'

const variants = {
  hidden: { opacity: 0, x: -20 },
  enter: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 }
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="enter"
      exit="exit"
      transition={{ type: 'tween', duration: 0.3 }}
    >
      {children}
    </motion.div>
  )
}
```

### Stagger Children
```tsx
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
}

<motion.ul variants={container} initial="hidden" animate="show">
  {items.map(i => (
    <motion.li key={i} variants={item}>{i}</motion.li>
  ))}
</motion.ul>
```

### Scroll-Triggered Fade In
```tsx
<motion.div
  initial={{ opacity: 0, y: 50 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-100px" }}
  transition={{ duration: 0.6 }}
>
  {content}
</motion.div>
```

### Hover & Tap
```tsx
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
  transition={{ type: "spring", stiffness: 400 }}
>
  לחץ כאן
</motion.button>
```

## 6.4 ScrollTrigger (GSAP)

### Basic Setup
```tsx
'use client'
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function AnimatedSection() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    gsap.from('.animate-item', {
      opacity: 0,
      y: 100,
      stagger: 0.2,
      scrollTrigger: {
        trigger: containerRef.current,
        start: 'top 80%',
        end: 'bottom 20%',
        toggleActions: 'play none none reverse'
      }
    })
  }, { scope: containerRef })

  return <div ref={containerRef}>...</div>
}
```

### Parallax Effect
```tsx
useGSAP(() => {
  gsap.to('.parallax-bg', {
    yPercent: -30,
    ease: 'none',
    scrollTrigger: {
      trigger: '.parallax-section',
      start: 'top bottom',
      end: 'bottom top',
      scrub: true
    }
  })
})
```

### Pin Section
```tsx
useGSAP(() => {
  ScrollTrigger.create({
    trigger: '.pin-section',
    start: 'top top',
    end: '+=500',
    pin: true,
    pinSpacing: true
  })
})
```

## 6.5 CSS Transitions (Tailwind)

| Duration | Use Case |
|----------|----------|
| duration-75 | Instant feedback (active states) |
| duration-150 | Quick transitions (colors, opacity) |
| duration-200 | Standard transitions (most UI) |
| duration-300 | Emphasis transitions (cards, modals) |
| duration-500 | Slow transitions (page transitions) |

```tsx
// Color Transition
<button className="transition-colors duration-200">

// Transform Transition
<div className="transition-transform duration-300 hover:scale-105">

// Lift Effect
<div className="hover:-translate-y-1 hover:shadow-lg transition-all duration-300">

// Scale Effect
<div className="hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200">
```

## 6.6 Loading States

```tsx
// Skeleton
<div className="animate-pulse">
  <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
  <div className="h-4 bg-slate-200 rounded w-1/2" />
</div>

// Spinner
<div className="w-6 h-6 border-2 border-slate-200 border-t-primary rounded-full animate-spin" />

// Button Loading
<button disabled className="opacity-50 cursor-not-allowed">
  <Spinner className="w-4 h-4 animate-spin" />
  <span>טוען...</span>
</button>
```

## 6.7 Animation Best Practices

| כלל | נכון | שגוי |
|-----|------|------|
| **Duration** | 200-500ms | >1000ms |
| **Easing** | ease-out, spring | linear |
| **Properties** | transform, opacity | width, height, top |
| **Reduced Motion** | תמיד לבדוק | להתעלם |

### Performance Rules
- Animate only `transform` and `opacity`
- Use `will-change` sparingly
- Prefer CSS for simple animations
- Don't animate `width`, `height`, `top`, `left`
- Don't use too many simultaneous animations

---

# 7. RTL SUPPORT (חובה!)

## 7.1 Logical Properties

```tsx
// ✅ נכון - Logical
className="ps-4"    // padding-start
className="pe-4"    // padding-end
className="ms-auto" // margin-start
className="me-4"    // margin-end
className="text-start"
className="text-end"
className="start-0" // position
className="end-0"

// ❌ שגוי - Physical
className="pl-4"    // padding-left
className="pr-4"    // padding-right
className="ml-auto"
className="text-left"
```

## 7.2 Flex Direction

```tsx
// Flex items will auto-reverse in RTL with flex-row
<div className="flex flex-row gap-4"> // יתהפך אוטומטית
```

## 7.3 Icons

```tsx
// Directional icons need RTL variants
<ArrowLeft className="rtl:rotate-180" />
<ChevronRight className="rtl:rotate-180" />
```

## 7.4 HTML Setup

```tsx
// layout.tsx
<html lang="he" dir="rtl">
```

## 7.5 Radix UI & shadcn RTL Fix (קריטי!)

> ⚠️ **בעיה נפוצה**: Radix UI מוסיף `dir="ltr"` אוטומטית לקומפוננטות ושובר RTL!

**פתרון - DirectionProvider:**

```bash
# התקנה
pnpm add @radix-ui/react-direction
```

```tsx
// app/layout.tsx - עטיפת האפליקציה
import { DirectionProvider } from '@radix-ui/react-direction';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <DirectionProvider dir="rtl">
          {children}
        </DirectionProvider>
      </body>
    </html>
  );
}
```

**קומפוננטות שמושפעות:**
- `Select`, `DropdownMenu`, `ContextMenu` - מיקום הפופאפ
- `Dialog`, `Sheet` - כיוון האנימציה
- `Tooltip`, `Popover` - יישור
- `Tabs` - כיוון הניווט

**בדיקה**: פתח DevTools ובדוק שאין `dir="ltr"` על אלמנטים של Radix.

---

# 8. ACCESSIBILITY (נגישות)

## 8.1 Color Contrast

| Element | Minimum Ratio |
|---------|---------------|
| Body text | 4.5:1 |
| Large text (18px+) | 3:1 |
| UI components | 3:1 |
| Decorative | No requirement |

```tsx
// ❌ Bad - low contrast
className="text-slate-400 bg-slate-100"

// ✅ Good - sufficient contrast
className="text-slate-700 bg-slate-100"
```

## 8.2 Focus States (חובה!)

```tsx
// ✅ Focus visible for keyboard only
className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"

// Button with proper focus
<button className="
  rounded-lg px-4 py-2
  focus:outline-none
  focus-visible:ring-2
  focus-visible:ring-primary
  focus-visible:ring-offset-2
">

// Skip link
<a href="#main" className="
  sr-only focus:not-sr-only
  focus:absolute focus:top-4 focus:start-4
  focus:z-50 focus:bg-white focus:p-4 focus:rounded
">
  דלג לתוכן הראשי
</a>
```

## 8.3 ARIA Labels

```tsx
// Icons without text
<button aria-label="סגור חלון">
  <XIcon className="w-5 h-5" />
</button>

// Loading states
<button disabled aria-busy="true">
  <Spinner aria-hidden="true" />
  <span>שומר...</span>
</button>

// Form errors
<input
  aria-invalid={!!error}
  aria-describedby={error ? "email-error" : undefined}
/>
{error && <p id="email-error" role="alert">{error}</p>}

// Hidden visually, available to screen readers
<span className="sr-only">פתח תפריט ניווט</span>
```

## 8.4 Semantic HTML

```tsx
// ✅ Correct
<nav aria-label="ניווט ראשי">
<main id="main">
<article>
<section aria-labelledby="section-title">
<aside>
<footer>

// ❌ Wrong
<div className="nav">
<div className="main">
<div className="article">
```

## 8.5 Keyboard Navigation

```tsx
// Ensure all interactive elements are focusable
<div
  tabIndex={0}
  role="button"
  onKeyDown={(e) => e.key === 'Enter' && onClick()}
>

// Trap focus in modals
import { FocusTrap } from '@headlessui/react'

<FocusTrap>
  <div role="dialog" aria-modal="true">
    {/* Modal content */}
  </div>
</FocusTrap>
```

## 8.6 Touch Targets

```tsx
// Minimum touch target size: 44x44px
<button className="min-h-[44px] min-w-[44px] p-3">
  <Icon className="w-5 h-5" />
</button>

// Adequate spacing between targets
<div className="flex gap-2">
  <button className="p-3">...</button>
  <button className="p-3">...</button>
</div>
```

---

# 9. DARK MODE

## 9.1 Implementation

```tsx
// tailwind.config.js
module.exports = {
  darkMode: 'class', // or 'media'
}

// Usage
<div className="bg-white dark:bg-slate-900">
<p className="text-slate-900 dark:text-white">
```

## 9.2 Color Mapping

| Light | Dark |
|-------|------|
| bg-white | dark:bg-slate-950 |
| bg-slate-50 | dark:bg-slate-900 |
| bg-slate-100 | dark:bg-slate-800 |
| text-slate-900 | dark:text-white |
| text-slate-600 | dark:text-slate-400 |
| border-slate-200 | dark:border-slate-800 |

---

# 10. Z-INDEX SCALE

| Layer | Z-Index | Use |
|-------|---------|-----|
| Base | z-0 | Default |
| Dropdown | z-10 | Dropdowns, popovers |
| Sticky | z-20 | Sticky elements |
| Fixed | z-30 | Fixed navigation |
| Modal Backdrop | z-40 | Modal backgrounds |
| Modal | z-50 | Modal content |
| Popover | z-[60] | Tooltips over modals |
| Toast | z-[70] | Notifications |
| Maximum | z-[9999] | Dev tools only |

---

# 11. QUICK REFERENCE

## Common Layouts

```tsx
// Page Layout
<main className="min-h-screen bg-slate-50 dark:bg-slate-950">
  <Header />
  <div className="container mx-auto px-4 md:px-8 py-8 md:py-12">
    {children}
  </div>
  <Footer />
</main>

// Dashboard Layout
<div className="flex min-h-screen">
  <Sidebar className="w-64 shrink-0" />
  <main className="flex-1 p-6 md:p-8">
    {children}
  </main>
</div>

// Card Grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {cards.map(card => <Card key={card.id} {...card} />)}
</div>
```

## Do's and Don'ts

```tsx
// ✅ DO
- Use gap for spacing between siblings
- Use p-* for internal padding
- Use consistent spacing scale
- Use semantic colors
- Use min-h-[44px] for touch targets
- Use rounded-xl or rounded-2xl for cards
- Use transition for hover effects

// ❌ DON'T
- Use margin on children
- Use arbitrary values (p-[13px])
- Mix spacing approaches
- Use hardcoded colors
- Make tiny buttons
- Use sharp corners
- Forget dark mode
```

---

# 12. ANTI-PATTERNS (מה לא לעשות!)

## 12.1 Spacing Anti-Patterns

```tsx
// ❌ WRONG - margin on children
<div>
  <Card className="mb-4" />
  <Card className="mb-4" />
  <Card />  // inconsistent!
</div>

// ✅ CORRECT - gap on parent
<div className="flex flex-col gap-4">
  <Card />
  <Card />
  <Card />
</div>
```

## 12.2 RTL Anti-Patterns

```tsx
// ❌ WRONG - physical directions
className="ml-4 mr-2 pl-3 pr-1 text-left border-l-2"

// ✅ CORRECT - logical directions
className="ms-4 me-2 ps-3 pe-1 text-start border-s-2"
```

## 12.3 Animation Anti-Patterns

```tsx
// ❌ WRONG - animating layout properties
className="transition-all duration-300 hover:w-full hover:h-auto"

// ✅ CORRECT - animating transform/opacity
className="transition-transform duration-300 hover:scale-105"

// ❌ WRONG - ignoring reduced motion
<motion.div animate={{ x: 100 }}>

// ✅ CORRECT - respecting user preference
const shouldReduce = useReducedMotion()
<motion.div animate={shouldReduce ? {} : { x: 100 }}>
```

## 12.4 Accessibility Anti-Patterns

```tsx
// ❌ WRONG - div as button
<div onClick={handleClick} className="cursor-pointer">

// ✅ CORRECT - semantic button
<button onClick={handleClick} type="button">

// ❌ WRONG - no alt text
<img src={url} />

// ✅ CORRECT - descriptive alt
<img src={url} alt="תמונת מוצר - חולצה כחולה" />

// ❌ WRONG - color only indication
<span className="text-red-500">שגיאה</span>

// ✅ CORRECT - icon + color + text
<span className="text-red-500 flex items-center gap-1">
  <AlertIcon aria-hidden="true" />
  שגיאה: שדה חובה
</span>
```

## 12.5 TypeScript Anti-Patterns

```tsx
// ❌ WRONG
const data: any = await fetch()
console.log(data)

// ✅ CORRECT
interface UserResponse { id: string; name: string }
const data = await fetchJson<UserResponse>('/api/user')
// No console.log in production
```

## 12.6 Component Anti-Patterns

```tsx
// ❌ WRONG - inline styles
<div style={{ marginTop: 20, color: 'red' }}>

// ✅ CORRECT - Tailwind classes
<div className="mt-5 text-red-500">

// ❌ WRONG - hardcoded colors
<div className="bg-[#1a73e8]">

// ✅ CORRECT - semantic colors
<div className="bg-primary">

// ❌ WRONG - fixed widths
<div className="w-[347px]">

// ✅ CORRECT - responsive/fluid
<div className="w-full max-w-sm">
```

---

# 13. UX CHECKLIST

## 13.1 Before Launch

```markdown
## 🚀 Launch Checklist

### States (חובה!)
- [ ] Loading states לכל פעולה אסינכרונית
- [ ] Empty states לכל רשימה/טבלה ריקה
- [ ] Error states לכל שגיאה אפשרית
- [ ] Success states לכל פעולה שהושלמה

### Feedback
- [ ] Toast/Alert לכל action
- [ ] Confirmation לפעולות הרסניות (מחיקה)
- [ ] Progress indicators לפעולות ארוכות
- [ ] Optimistic updates כשרלוונטי

### Navigation & Interaction
- [ ] Keyboard navigation עובד
- [ ] Focus states ברורים
- [ ] Back button עובד כצפוי
- [ ] Breadcrumbs לניווט עמוק

### Responsive & RTL
- [ ] Mobile responsive (בדוק 375px)
- [ ] Tablet responsive (בדוק 768px)
- [ ] RTL verified - כל הכיוונים נכונים
- [ ] Touch targets מינימום 44x44px

### Performance
- [ ] Images optimized (WebP, lazy load)
- [ ] No layout shifts (CLS)
- [ ] Fast initial load (<3s)
- [ ] Skeleton loaders לתוכן

### Accessibility
- [ ] Color contrast עובר (4.5:1)
- [ ] Alt text לכל תמונה
- [ ] Screen reader tested
- [ ] Form labels מחוברים
```

## 13.2 Common UX Patterns

| Pattern | מתי להשתמש | דוגמה |
|---------|------------|-------|
| **Optimistic Update** | פעולות מהירות | Like, Follow |
| **Infinite Scroll** | רשימות ארוכות | Feed, Gallery |
| **Pagination** | נתונים מובנים | טבלאות, תוצאות חיפוש |
| **Debounce** | קלט מהיר | חיפוש, autocomplete |
| **Skeleton** | טעינת תוכן | כרטיסים, רשימות |
| **Pull to Refresh** | מובייל | רשימות, feeds |
| **Swipe Actions** | מובייל | מחיקה, ארכיון |

## 13.3 Error Handling UX

```tsx
// ✅ Error State מלא
function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertCircle className="w-12 h-12 text-red-500" />
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">משהו השתבש</h3>
        <p className="text-slate-500 text-sm max-w-sm">
          {error.message || 'אירעה שגיאה בטעינת הנתונים. אנא נסה שוב.'}
        </p>
      </div>
      <Button onClick={onRetry} variant="outline">
        <RefreshCw className="w-4 h-4 me-2" />
        נסה שוב
      </Button>
    </div>
  )
}

// ✅ Empty State מלא
function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="p-4 bg-slate-100 rounded-full">
        <Inbox className="w-8 h-8 text-slate-400" />
      </div>
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-slate-500 text-sm max-w-sm">{description}</p>
      </div>
      {action && (
        <Button onClick={action.onClick}>
          <Plus className="w-4 h-4 me-2" />
          {action.label}
        </Button>
      )}
    </div>
  )
}
```

---

# 14. RECOMMENDED LIBRARIES

## 13.1 Core (חובה בכל פרויקט)

```bash
pnpm add lucide-react date-fns clsx tailwind-merge next-themes
```

| ספרייה | שימוש |
|--------|-------|
| **lucide-react** | אייקונים |
| **date-fns** | עיצוב תאריכים |
| **clsx + tailwind-merge** | cn() utility |
| **next-themes** | Dark mode |

## 13.2 cn() Utility

```ts
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

## 13.3 Animation

```bash
pnpm add framer-motion gsap @gsap/react
```

## 13.4 Optional (לפי צורך)

| ספרייה | מתי להוסיף |
|--------|------------|
| **@tanstack/react-table** | טבלאות מורכבות |
| **nuqs** | URL state management |
| **lenis** | Smooth scroll |
| **react-hook-form + zod** | טפסים |
| **recharts** | גרפים |

## 13.5 Full Install Command

```bash
# Core stack
pnpm add next@latest react@latest react-dom@latest
pnpm add -D typescript @types/react @types/node

# Styling
pnpm add tailwindcss@latest @tailwindcss/postcss postcss

# UI & Utils
pnpm add lucide-react date-fns clsx tailwind-merge next-themes
pnpm add framer-motion

# Optional
pnpm add @tanstack/react-table nuqs react-hook-form zod @hookform/resolvers
```
