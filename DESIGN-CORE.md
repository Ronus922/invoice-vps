# DESIGN-CORE.md - חוקי עיצוב בסיסיים

> **הוראות:** העתק קובץ זה ל-CLAUDE.md של כל פרויקט חדש.

---

## 🎨 חוקי עיצוב מחייבים (MANDATORY!)

> ⚠️ **קרא לפני לבצע לפני כל עבודה כזו או אחרת UI!**

### 1. Spacing - GAP על Parent, לא MARGIN על Children!

```tsx
// ✅ נכון - Parent שולט על המרווח
<div className="flex flex-col gap-6">
  <Card />
  <Card />
</div>

// ❌ שגוי - margin על children
<Card className="mb-6" />
<Card className="mb-6" />
```

### 2. טבלת Spacing:

| Class | פיקסלים | שימוש |
|-------|---------|-------|
| `gap-1` | 4px | בין אייקון לטקסט קטן |
| `gap-2` | 8px | icon + text |
| `gap-3` | 12px | שורות בטופס |
| `gap-4` | 16px | form fields |
| `gap-6` | 24px | cards / groups |
| `gap-8` | 32px | sections |
| `gap-12` | 48px | main sections |

### 3. Layout Pattern - Admin/Dashboard Pages:

```tsx
<div className="space-y-6 p-6">
  {/* Header */}
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-bold">כותרת עמוד</h1>
      <p className="text-slate-600 mt-1">תיאור קצר</p>
    </div>
    <Button>פעולה ראשית</Button>
  </div>

  {/* Stats Cards */}
  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
    <StatsCard />
    <StatsCard />
    <StatsCard />
    <StatsCard />
  </div>

  {/* Main Content Card */}
  <div className="bg-white rounded-xl border border-slate-200 p-6">
    {/* תוכן */}
  </div>
</div>
```

### 4. גבהים תקניים:

| רכיב | Class | פיקסלים |
|-------|-------|---------|
| Input/Select | `h-12` | 48px |
| Button Primary | `h-12 px-6` | 48px |
| Button Secondary | `h-10 px-4` | 40px |
| Touch targets | `min-h-[44px]` | 44px+ |
| Table rows | `py-4` | - |

### 5. צבעים - רק semantic:

```tsx
// ✅ נכון - semantic colors
className="bg-white text-slate-900 border-slate-200"
className="bg-teal-600 text-white hover:bg-teal-700"
className="text-slate-600 hover:text-slate-900"

// ❌ שגוי - hardcoded
className="bg-[#123456]"
style={{ color: '#ff0000' }}
```

### 6. טבלת צבעים:

| שימוש | Light Mode | Dark Mode |
|-------|------------|-----------|
| רקע עמוד | `bg-slate-50` | `dark:bg-slate-950` |
| רקע card | `bg-white` | `dark:bg-slate-900` |
| טקסט ראשי | `text-slate-900` | `dark:text-white` |
| טקסט משני | `text-slate-600` | `dark:text-slate-400` |
| גבול | `border-slate-200` | `dark:border-slate-800` |
| Primary | `bg-teal-600` | - |
| Success | `bg-green-100 text-green-700` | - |
| Error | `bg-red-100 text-red-700` | - |
| Warning | `bg-amber-100 text-amber-700` | - |

### 7. RTL Support (עברית):

```tsx
// ✅ נכון - Logical properties
className="ps-4"    // padding-start
className="pe-4"    // padding-end
className="ms-auto" // margin-start
className="text-start"

// ❌ שגוי - Physical properties
className="pl-4"    // padding-left
className="pr-4"    // padding-right
className="text-left"
```

### 8. Form Patterns:

```tsx
<form className="space-y-4">
  {/* Single field */}
  <div className="space-y-2">
    <label className="block text-sm font-medium text-slate-700">
      שם משתמש <span className="text-red-500">*</span>
    </label>
    <input
      type="text"
      className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
      placeholder="placeholder..."
    />
  </div>

  {/* Two columns */}
  <div className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <label>שדה 1</label>
      <input ... />
    </div>
    <div className="space-y-2">
      <label>שדה 2</label>
      <input ... />
    </div>
  </div>

  {/* Actions */}
  <div className="flex gap-3 pt-4">
    <button type="button" className="flex-1 h-12 rounded-xl border border-slate-200 hover:bg-slate-50">
      ביטול
    </button>
    <button type="submit" className="flex-1 h-12 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700">
      שמירה
    </button>
  </div>
</form>
```

### 9. Card Patterns:

```tsx
{/* Stats Card */}
<div className="bg-white rounded-xl border border-slate-200 p-6">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-slate-600 text-sm">כותרת</p>
      <p className="text-3xl font-bold mt-1">123</p>
    </div>
    <div className="p-3 bg-teal-100 rounded-xl">
      <Icon className="w-6 h-6 text-teal-600" />
    </div>
  </div>
</div>

{/* Content Card */}
<div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
  {/* Header */}
  <div className="px-6 py-4 border-b border-slate-100">
    <h3 className="font-bold">כותרת</h3>
  </div>
  {/* Body */}
  <div className="p-6">
    {/* content */}
  </div>
</div>
```

### 10. Table Patterns:

```tsx
<div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
  <table className="w-full">
    <thead className="bg-slate-50 border-b border-slate-200">
      <tr>
        <th className="px-4 py-3 text-right font-bold text-slate-700">עמודה</th>
        ...
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-100">
      <tr className="hover:bg-slate-50 transition-colors">
        <td className="px-4 py-4">תוכן</td>
        ...
      </tr>
    </tbody>
  </table>
</div>
```

---

## מה לא תעשה (NEVER!):

| ❌ שגוי | ✅ נכון |
|--------|--------|
| `mb-4` על children | `gap-4` על parent |
| `bg-[#123456]` | `bg-slate-600` |
| `pl-4` / `pr-4` | `ps-4` / `pe-4` |
| `text-left` | `text-start` |
| `h-10` על input | `h-12` על input |
| `p-2` על button | `px-6 py-3` או `h-12 px-6` |
| חוסר אחידות gap | `space-y-4` על form |

---

## Status Badges Pattern:

```tsx
const STATUS_CONFIG = {
  active: { label: 'פעיל', className: 'bg-green-100 text-green-700' },
  pending: { label: 'ממתין', className: 'bg-amber-100 text-amber-700' },
  inactive: { label: 'לא פעיל', className: 'bg-slate-100 text-slate-600' },
  error: { label: 'שגיאה', className: 'bg-red-100 text-red-700' },
}

<span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[status].className}`}>
  {STATUS_CONFIG[status].label}
</span>
```

---

**זכור: עיצוב נכון = Gap על Parent + גבהים תקניים + צבעים semantic!**
