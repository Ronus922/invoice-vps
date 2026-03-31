---
name: mobile
description: Responsive Adaptation - Makes pages/components fully responsive across 9 screen sizes from Small Mobile (320px) to TV (2560px).
---

# Responsive Adaptation - התאמה רספונסיבית מלאה

הפוך כל עמוד, מסך ורכיב לרספונסיבי מושלם ב-9 גדלי מסך.
עובד פר-עמוד או על כל הפרויקט.

---

## 9 Breakpoints (חובה!)

| # | שם | רוחב x גובה | Tailwind | מכשיר |
|---|-----|-------------|----------|-------|
| 1 | Small Mobile | 320x568 | base (ברירת מחדל) | iPhone SE, Galaxy S |
| 2 | Large Mobile | 375x812 | `min-[375px]:` | iPhone 14, Pixel 7 |
| 3 | Small Tablet | 640x960 | `sm:` | iPad Mini portrait |
| 4 | Large Tablet | 768x1024 | `md:` | iPad portrait |
| 5 | Small Laptop | 1024x768 | `lg:` | iPad landscape, laptop |
| 6 | Large Laptop | 1280x800 | `xl:` | MacBook Pro 13" |
| 7 | Small Desktop | 1440x900 | `2xl:` | MacBook Pro 15" |
| 8 | Large Desktop | 1920x1080 | `min-[1920px]:` | Full HD monitor |
| 9 | TV | 2560x1440 | `min-[2560px]:` | 4K / TV |

### Custom Breakpoints (הוסף ל-tailwind.config אם חסרים)
```js
// tailwind.config.js / tailwind.config.ts
theme: {
  screens: {
    'sm': '640px',
    'md': '768px',
    'lg': '1024px',
    'xl': '1280px',
    '2xl': '1440px',
    '3xl': '1920px',
    '4xl': '2560px',
  }
}
```

---

## מתודולוגיה

### שלב 0: מיפוי הפרויקט
```
1. קרא package.json → טכנולוגיה
2. מפה routes/pages
3. קרא tailwind.config → breakpoints קיימים
4. צור רשימת דפים לבדיקה
```

### שלב 1: ניתוח (לכל דף)
```
browser_navigate → URL
לכל 9 breakpoints:
  browser_resize → (width, height)
  browser_take_screenshot → before
  browser_snapshot → זהה בעיות
```

### שלב 2: תיקון (Mobile First!)
עבור מ-320px כלפי מעלה. כל class מתחיל בלי prefix (mobile), ועולה.

### שלב 3: אימות
```
לכל 9 breakpoints:
  browser_resize + screenshot + snapshot
  ודא: אין overflow, טקסט קריא, padding, RTL, touch targets
```

---

## Responsive Patterns

### Container
```tsx
<div className="
  w-full px-4
  sm:px-6
  lg:max-w-5xl lg:mx-auto lg:px-8
  xl:max-w-6xl
  2xl:max-w-7xl
  min-[1920px]:max-w-[1600px]
  min-[2560px]:max-w-[2200px]
">
```

### Grid
```tsx
<div className="
  grid grid-cols-1 gap-3
  min-[375px]:gap-4
  sm:grid-cols-2
  md:gap-5
  lg:grid-cols-3
  xl:grid-cols-4 xl:gap-6
  min-[1920px]:grid-cols-5
  min-[2560px]:grid-cols-6 min-[2560px]:gap-8
">
```

### Typography
```tsx
{/* Headings */}
<h1 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl min-[1920px]:text-5xl min-[2560px]:text-6xl">
<h2 className="text-lg sm:text-xl lg:text-2xl xl:text-3xl min-[1920px]:text-4xl">
<h3 className="text-base sm:text-lg lg:text-xl xl:text-2xl">

{/* Body */}
<p className="text-sm sm:text-base lg:text-lg min-[1920px]:text-xl">
```

### Spacing Scale
```tsx
{/* Padding */}
<div className="p-3 sm:p-4 lg:p-6 xl:p-8 min-[1920px]:p-10 min-[2560px]:p-12">

{/* Gap */}
<div className="gap-3 sm:gap-4 lg:gap-6 xl:gap-8">

{/* Section spacing */}
<section className="py-8 sm:py-12 lg:py-16 xl:py-20 min-[1920px]:py-24 min-[2560px]:py-32">
```

### Navigation
```tsx
{/* Mobile (< lg): hamburger */}
<button className="lg:hidden" onClick={toggleMenu}>
  <MenuIcon />
</button>

{/* Desktop (>= lg): full navigation */}
<nav className="hidden lg:flex items-center gap-4 xl:gap-6">
  <NavLinks />
</nav>
```

### Tables
```tsx
{/* Mobile: card layout */}
<div className="md:hidden space-y-3">
  {data.map(item => (
    <div key={item.id} className="bg-white rounded-lg p-4 shadow-sm">
      <div className="flex justify-between">
        <span className="font-medium">{item.name}</span>
        <Badge>{item.status}</Badge>
      </div>
      <div className="mt-2 text-sm text-gray-500">{item.email}</div>
    </div>
  ))}
</div>

{/* Desktop: full table */}
<table className="hidden md:table w-full">
  <thead>
    <tr>
      <th className="px-4 py-3 text-start">שם</th>
      <th className="px-4 py-3 text-start">אימייל</th>
      <th className="px-4 py-3 text-start">סטטוס</th>
    </tr>
  </thead>
  <tbody>...</tbody>
</table>
```

### Sidebar
```tsx
{/* Mobile: slide-over overlay */}
<aside className={`
  fixed inset-y-0 start-0 z-50 w-64 transform transition-transform
  ${isOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'}
  lg:relative lg:translate-x-0 lg:w-72 xl:w-80
`}>
  <SidebarContent />
</aside>

{/* Overlay backdrop */}
{isOpen && (
  <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={close} />
)}
```

### Images
```tsx
<img
  className="w-full h-auto object-cover
    sm:max-w-md sm:rounded-lg
    lg:max-w-lg
    xl:max-w-xl"
  src={src}
  alt={alt}
/>
```

### Form Inputs
```tsx
<input className="
  w-full px-3 py-2 text-sm
  sm:text-base
  lg:max-w-md
  xl:max-w-lg
" />
```

### Cards
```tsx
<div className="
  bg-white rounded-lg shadow-sm p-4
  sm:p-5
  lg:p-6
  xl:rounded-xl
  min-[1920px]:p-8
">
```

---

## Checklist לכל Breakpoint

### Small Mobile (320px)
- [ ] Layout single column
- [ ] Font readable (min 14px)
- [ ] Touch targets >= 44px
- [ ] No horizontal overflow
- [ ] Hamburger menu
- [ ] Cards stacked vertically

### Large Mobile (375px)
- [ ] Slightly larger spacing
- [ ] Images fit properly
- [ ] Forms usable

### Small Tablet (640px - sm)
- [ ] 2-column grid where appropriate
- [ ] Larger padding
- [ ] Side margins increase

### Large Tablet (768px - md)
- [ ] Tables become visible
- [ ] Cards in 2-3 column grid
- [ ] Navigation might expand

### Small Laptop (1024px - lg)
- [ ] Full navigation visible
- [ ] Sidebar appears (not overlay)
- [ ] 3-column grids
- [ ] max-width container starts

### Large Laptop (1280px - xl)
- [ ] 4-column grids
- [ ] Wider sidebar
- [ ] Larger typography
- [ ] More breathing room

### Small Desktop (1440px - 2xl)
- [ ] max-width container
- [ ] Comfortable spacing
- [ ] No wasted space

### Large Desktop (1920px)
- [ ] Larger max-width
- [ ] Bigger typography
- [ ] 5-column grids where appropriate
- [ ] Content doesn't stretch too wide

### TV (2560px)
- [ ] Very large max-width
- [ ] Even larger typography
- [ ] 6-column grids
- [ ] Extra padding/spacing
- [ ] Content centered with good margins

---

## בעיות נפוצות

| בעיה | פתרון |
|------|-------|
| Overflow אופקי | `overflow-x-hidden` + בדוק absolute elements |
| טקסט קטן מדי ב-TV | הגדל ב-`min-[1920px]:` ו-`min-[2560px]:` |
| הכל צפוף ב-mobile | הקטן grid cols, הגדל gap |
| תמונות מעוותות | `object-cover` + `aspect-ratio` |
| Navigation שבור | hamburger mobile / full desktop |
| RTL שבור ב-responsive | `ps-*/pe-*`, `ms-*/me-*`, `flex-row-reverse` |
| Table לא נכנס | card layout ב-mobile |
| Sidebar חוסם content | overlay ב-mobile, fixed ב-desktop |
| Touch targets קטנים | `min-h-[44px] min-w-[44px]` |
| Content נוגע בבורדר | padding תמיד! |

---

## RTL + Responsive
```tsx
// ps/pe instead of pl/pr
<div className="ps-4 pe-4 sm:ps-6 sm:pe-6 lg:ps-8 lg:pe-8">

// ms/me instead of ml/mr
<span className="ms-2 sm:ms-4">

// flex-row-reverse for sequences (steps, breadcrumbs)
<div className="flex flex-row-reverse gap-2 sm:gap-4">

// text-start/text-end instead of text-left/text-right
<p className="text-start">
```
