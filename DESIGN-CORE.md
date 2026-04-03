# DESIGN-CORE.md — Base44 Glassmorphism Design System

> **עיצוב: Dark Gradient + Glassmorphism**
> מבוסס על InvoiceFlow Base44 — עדכון אחרון: 2026-04-01

---

## 1. רקע וצבעי בסיס

### רקע ראשי
```
bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950
```
- **body CSS:** `linear-gradient(to bottom right, #0f172a, #172554, #1e1b4b)`
- אין light mode — תמיד dark

### היררכיית טקסט (על רקע כהה)
| שימוש | Class |
|-------|-------|
| כותרת ראשית | `text-white` |
| כותרת משנית | `text-white/80` |
| טקסט רגיל | `text-white/60` |
| טקסט מושתק | `text-white/40` |
| placeholder | `text-white/30` |
| מינימלי | `text-white/20` |

---

## 2. Glassmorphism Cards (הדפוס המרכזי)

```tsx
// ✅ כרטיס רגיל
<div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-5 shadow-xl">

// ✅ כרטיס עם hover
<div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-5 shadow-xl hover:bg-white/15 transition-all duration-300">

// ❌ שגוי — אין להשתמש ב-semantic tokens ישנים
<div className="bg-surface-container-low">
```

### רמות שקיפות
| רמה | Class | שימוש |
|-----|-------|-------|
| Surface | `bg-white/5` | רקע עדין, drop zone |
| Card | `bg-white/10` | כרטיסים, panels |
| Hover | `bg-white/15` | hover state |
| Active | `bg-white/20` | selected state |
| Header | `bg-white/5` | table header, card header |

---

## 3. Gradient Icons (אייקוני קטגוריה)

כל קטגוריה מקבלת gradient ייחודי:

| קטגוריה | Gradient | Glow Shadow |
|---------|----------|-------------|
| Success / Processed | `from-emerald-500 to-teal-500` | `shadow-emerald-500/25` |
| Financial / Total | `from-blue-500 to-cyan-500` | `shadow-blue-500/25` |
| Time / Schedule | `from-amber-500 to-orange-500` | `shadow-amber-500/25` |
| Download / Export | `from-purple-500 to-violet-500` | `shadow-purple-500/25` |
| Upload | `from-pink-500 to-rose-500` | — |
| Table / Data | `from-indigo-500 to-blue-600` | — |
| Header CTA | `from-blue-400 to-indigo-500` | `shadow-blue-500/30` |

```tsx
// ✅ דפוס אייקון gradient
<div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-2.5 rounded-xl shadow-lg">
  <Icon className="w-5 h-5 text-white" />
</div>
```

---

## 4. כפתורים

### Primary (CTA)
```tsx
<button className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 py-2.5 rounded-xl transition-all">
```

### Secondary (Action)
```tsx
<button className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 hover:text-blue-200 text-sm font-medium px-3 py-2 rounded-xl transition-all">
```

### Ghost
```tsx
<button className="bg-white/10 hover:bg-white/15 border border-white/15 text-white/80 hover:text-white text-sm font-medium px-3 py-2 rounded-xl transition-all">
```

### Destructive
```tsx
<button className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-all">
```

### Export Buttons
| סוג | Classes |
|-----|---------|
| ZIP | `bg-indigo-500/20 border-indigo-500/30 text-yellow-400` |
| CSV/Excel | `bg-emerald-500/20 border-emerald-500/30 text-emerald-300` |
| Print | `bg-white/10 border-white/15 text-white/70` |

---

## 5. Inputs & Forms

### Input
```tsx
<input className="h-9 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/50 [color-scheme:dark]" />
```

### Select Trigger
```tsx
<SelectTrigger className="bg-white/10 border-white/15 text-white/80 focus:border-blue-400/50">
```

### Labels
```tsx
<label className="block text-xs text-white/50 mb-1.5">שם שדה</label>
```

---

## 6. Status Badges

| סטטוס | Classes |
|-------|---------|
| Gmail | `bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full` |
| WhatsApp | `bg-green-500/20 text-green-300 border border-green-500/30 rounded-full` |
| Manual | `bg-white/10 text-white/40 border border-white/10 rounded-full` |
| Success | `bg-emerald-500/10 border-emerald-500/20 text-emerald-400` |
| Warning | `bg-amber-500/10 border-amber-500/20 text-amber-400` |
| Error | `bg-red-500/10 border-red-500/20 text-red-400` |
| Processing | `bg-blue-500/10 border-blue-500/20 text-blue-300` |

---

## 7. Table Design

### Container
```tsx
<div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl shadow-xl overflow-hidden">
```

### Header
```tsx
<TableRow className="bg-white/5 border-white/10">
  <TableHead className="text-right text-xs font-semibold text-white">
```

### Row
```tsx
<TableRow className="hover:bg-white/10 transition-colors border-white/5 cursor-pointer">
  <TableCell className="text-sm text-white/50">   // date
  <TableCell className="text-sm font-semibold text-white">  // vendor
  <TableCell className="text-sm text-blue-300 font-mono">   // doc number
  <TableCell className="text-sm font-bold text-emerald-400"> // total ₪
```

### Sort Icons
- Unsorted: `opacity-40`
- Active: `text-blue-300`

---

## 8. Dialogs & Modals

### Dialog Content
```tsx
className="bg-slate-900 border border-white/15 rounded-2xl p-6 shadow-2xl"
```

### Overlay
```tsx
className="bg-black/60 backdrop-blur-sm"
```

### Mobile Bottom Sheet
```tsx
className="bg-gradient-to-b from-slate-800 to-slate-900 border-t border-white/10 rounded-t-3xl"
```

---

## 9. Alert / Warning Section

```tsx
// Amber warning container
<div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl">

// Header icon
<div className="bg-amber-500/20 p-1.5 rounded-lg">
  <AlertTriangle className="w-4 h-4 text-amber-400" />
</div>

// Title
<span className="text-amber-300 font-semibold text-sm">
```

---

## 10. Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Page title | Manrope | `text-2xl sm:text-3xl` | `font-bold` |
| Section title | Manrope | `text-lg` | `font-bold` |
| Body text | Heebo/Inter | `text-sm` | `font-medium` |
| Labels | Heebo/Inter | `text-xs` | `font-medium` |
| Stats numbers | Manrope | `text-2xl` | `font-bold` |
| Badge text | Heebo/Inter | `text-xs` | `font-medium` |

### Font Loading
```html
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Heebo:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
```

---

## 11. Spacing

| שימוש | Class |
|-------|-------|
| Page padding | `px-3 sm:px-6 lg:px-10 py-6 sm:py-8` |
| Section gap | `space-y-4 sm:space-y-6` |
| Card padding | `p-5` or `p-6` |
| Card inner gap | `gap-3` or `gap-4` |
| Stats grid | `grid-cols-2 lg:grid-cols-4 gap-4` |
| Filter grid | `grid-cols-2 sm:flex sm:flex-wrap gap-3` |

---

## 12. Hover & Transitions

```tsx
// Card lift
hover:-translate-y-0.5 transition-all duration-300

// Background shift
hover:bg-white/15 transition-all

// Opacity reveal (delete button)
opacity-0 group-hover:opacity-100 transition-opacity

// Color shift
hover:text-blue-200 transition-colors
```

---

## 13. Border Radius

| Element | Class |
|---------|-------|
| Cards | `rounded-2xl` |
| Buttons | `rounded-xl` |
| Inputs | `rounded-xl` |
| Badges | `rounded-full` |
| Dialogs | `rounded-2xl` |
| Mobile sheet | `rounded-t-3xl` |
| Small items | `rounded-lg` |

---

## 14. Queue Item States (Upload)

```tsx
// Pending
'bg-white/5 border-white/10'    → Clock icon text-white/30

// Processing
'bg-blue-500/10 border-blue-500/20' → Loader2 animate-spin text-blue-400

// Done
'bg-emerald-500/10 border-emerald-500/20' → Check text-emerald-400

// Error
'bg-red-500/10 border-red-500/20' → AlertCircle text-red-400

// Duplicate
'bg-amber-500/10 border-amber-500/20' → AlertCircle text-amber-400
```

---

## אנטי-דפוסים (NEVER!)

| ❌ שגוי | ✅ נכון |
|--------|--------|
| `bg-surface-container-low` | `bg-white/10 backdrop-blur-sm border border-white/15` |
| `text-on-surface` | `text-white` |
| `text-on-surface-variant/60` | `text-white/50` |
| `text-primary` (teal) | `text-blue-300` or `text-emerald-400` |
| `bg-error-container` | `bg-red-500/20 border border-red-500/30` |
| `glow-primary` | `shadow-xl shadow-blue-500/25` |
| Flat surface cards | Glassmorphism with `backdrop-blur-sm` |
| Monochrome icon boxes | Gradient icon boxes (`from-X to-Y`) |
| Light mode colors | Dark-only design |

---

**זכור: White opacity layers + colored gradients + backdrop blur = Base44 Design**
