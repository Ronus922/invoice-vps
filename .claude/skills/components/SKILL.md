---
name: components
description: Extended UI components library - complex patterns, forms, tables, modals, and reusable component templates.
---

# COMPONENTS.md - Extended UI Components

## קובץ זה מכיל פטרנים לקומפוננטות מורכבות. נטען לפי הצורך מ-DESIGN.md.

> ⚠️ **RTL**: וודא שיש `DirectionProvider` מ-Radix עוטף את האפליקציה! ראה [DESIGN.md 7.5](./DESIGN.md)

---

# 1. TOASTS & NOTIFICATIONS

## 1.1 Toast Container

```tsx
// Toast Container - Fixed position
<div className="
  fixed bottom-4 start-4
  z-[70]
  flex flex-col gap-3
  max-w-sm w-full
  pointer-events-none
">
  {toasts.map(toast => (
    <Toast key={toast.id} {...toast} />
  ))}
</div>
```

## 1.2 Toast Variants

```tsx
// Success Toast
<div className="
  pointer-events-auto
  flex items-start gap-3
  p-4
  bg-white dark:bg-slate-900
  border border-slate-200 dark:border-slate-800
  rounded-xl
  shadow-lg
  animate-in slide-in-from-bottom-4 fade-in duration-300
">
  <div className="p-1 bg-green-100 dark:bg-green-900/30 rounded-full">
    <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
  </div>
  <div className="flex-1 min-w-0">
    <p className="font-medium text-slate-900 dark:text-white">הצלחה!</p>
    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">הפעולה בוצעה בהצלחה</p>
  </div>
  <button className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
    <X className="w-4 h-4 text-slate-500" />
  </button>
</div>

// Error Toast
<div className="
  pointer-events-auto
  flex items-start gap-3
  p-4
  bg-red-50 dark:bg-red-900/20
  border border-red-200 dark:border-red-800
  rounded-xl
  shadow-lg
">
  <div className="p-1 bg-red-100 dark:bg-red-900/50 rounded-full">
    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
  </div>
  <div className="flex-1">
    <p className="font-medium text-red-900 dark:text-red-100">שגיאה</p>
    <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">משהו השתבש, נסה שוב</p>
  </div>
</div>

// Warning Toast
<div className="
  pointer-events-auto
  flex items-start gap-3
  p-4
  bg-amber-50 dark:bg-amber-900/20
  border border-amber-200 dark:border-amber-800
  rounded-xl
  shadow-lg
">
  <div className="p-1 bg-amber-100 dark:bg-amber-900/50 rounded-full">
    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
  </div>
  <div className="flex-1">
    <p className="font-medium text-amber-900 dark:text-amber-100">שים לב</p>
    <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">הפעולה דורשת אישור</p>
  </div>
</div>

// Info Toast
<div className="
  pointer-events-auto
  flex items-start gap-3
  p-4
  bg-blue-50 dark:bg-blue-900/20
  border border-blue-200 dark:border-blue-800
  rounded-xl
  shadow-lg
">
  <div className="p-1 bg-blue-100 dark:bg-blue-900/50 rounded-full">
    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
  </div>
  <div className="flex-1">
    <p className="font-medium text-blue-900 dark:text-blue-100">מידע</p>
    <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">עדכון חדש זמין</p>
  </div>
</div>
```

## 1.3 Toast with Action

```tsx
<div className="
  pointer-events-auto
  p-4
  bg-slate-900 dark:bg-white
  text-white dark:text-slate-900
  rounded-xl
  shadow-lg
  flex items-center justify-between gap-4
">
  <p className="text-sm">הפריט הוסר</p>
  <button className="
    text-sm font-semibold
    text-primary-400 dark:text-primary
    hover:underline
  ">
    בטל
  </button>
</div>
```

## 1.4 Toast with Progress

```tsx
<div className="
  pointer-events-auto
  overflow-hidden
  bg-white dark:bg-slate-900
  border border-slate-200 dark:border-slate-800
  rounded-xl
  shadow-lg
">
  <div className="flex items-center gap-3 p-4">
    <Loader2 className="w-5 h-5 text-primary animate-spin" />
    <div className="flex-1">
      <p className="font-medium">מעלה קובץ...</p>
      <p className="text-sm text-slate-500">45% הושלם</p>
    </div>
  </div>
  <div className="h-1 bg-slate-100 dark:bg-slate-800">
    <div className="h-full bg-primary transition-all duration-300" style={{ width: '45%' }} />
  </div>
</div>
```

---

# 2. EMPTY STATES

## 2.1 Basic Empty State

```tsx
<div className="
  flex flex-col items-center justify-center
  py-16 px-4
  text-center
">
  <div className="
    w-16 h-16 mb-6
    bg-slate-100 dark:bg-slate-800
    rounded-full
    flex items-center justify-center
  ">
    <Inbox className="w-8 h-8 text-slate-400" />
  </div>
  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
    אין תוצאות
  </h3>
  <p className="text-slate-600 dark:text-slate-400 max-w-sm mb-6">
    לא נמצאו פריטים התואמים לחיפוש שלך. נסה לשנות את הפילטרים.
  </p>
  <Button>
    <Plus className="w-4 h-4" />
    הוסף פריט חדש
  </Button>
</div>
```

## 2.2 Illustrated Empty State

```tsx
<div className="
  flex flex-col items-center justify-center
  py-20 px-4
  text-center
">
  {/* Illustration */}
  <div className="relative w-48 h-48 mb-8">
    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-full blur-2xl" />
    <Image
      src="/illustrations/empty-inbox.svg"
      alt="אין הודעות"
      fill
      className="object-contain relative z-10"
    />
  </div>

  <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
    תיבת הדואר ריקה
  </h3>
  <p className="text-slate-600 dark:text-slate-400 max-w-md mb-8 leading-relaxed">
    כל ההודעות שתקבל יופיעו כאן. בינתיים, למה לא לשלוח הודעה למישהו?
  </p>
  <div className="flex items-center gap-3">
    <Button variant="secondary">ייבא אנשי קשר</Button>
    <Button>כתוב הודעה</Button>
  </div>
</div>
```

## 2.3 Error State

```tsx
<div className="
  flex flex-col items-center justify-center
  py-16 px-4
  text-center
">
  <div className="
    w-16 h-16 mb-6
    bg-red-100 dark:bg-red-900/30
    rounded-full
    flex items-center justify-center
  ">
    <AlertCircle className="w-8 h-8 text-red-500" />
  </div>
  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
    משהו השתבש
  </h3>
  <p className="text-slate-600 dark:text-slate-400 max-w-sm mb-6">
    לא הצלחנו לטעון את הנתונים. בדוק את החיבור לאינטרנט ונסה שוב.
  </p>
  <Button variant="secondary" onClick={retry}>
    <RefreshCw className="w-4 h-4" />
    נסה שוב
  </Button>
</div>
```

## 2.4 No Search Results

```tsx
<div className="
  flex flex-col items-center justify-center
  py-12 px-4
  text-center
">
  <Search className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
    לא נמצאו תוצאות עבור "{query}"
  </h3>
  <p className="text-slate-600 dark:text-slate-400 max-w-sm">
    נסה לחפש במילים אחרות או בדוק את האיות
  </p>
</div>
```

---

# 3. PAGINATION

## 3.1 Simple Pagination

```tsx
<nav className="flex items-center justify-center gap-2">
  <button
    disabled={page === 1}
    className="
      p-2
      rounded-lg
      text-slate-600 dark:text-slate-400
      hover:bg-slate-100 dark:hover:bg-slate-800
      disabled:opacity-50 disabled:cursor-not-allowed
      transition-colors
    "
  >
    <ChevronRight className="w-5 h-5 rtl:rotate-180" />
  </button>

  {pages.map(p => (
    <button
      key={p}
      className={cn(
        "min-w-[40px] h-10 px-3 rounded-lg font-medium transition-colors",
        p === page
          ? "bg-primary text-white"
          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
      )}
    >
      {p}
    </button>
  ))}

  <button
    disabled={page === totalPages}
    className="
      p-2
      rounded-lg
      text-slate-600 dark:text-slate-400
      hover:bg-slate-100 dark:hover:bg-slate-800
      disabled:opacity-50 disabled:cursor-not-allowed
      transition-colors
    "
  >
    <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
  </button>
</nav>
```

## 3.2 Pagination with Info

```tsx
<div className="flex items-center justify-between">
  <p className="text-sm text-slate-600 dark:text-slate-400">
    מציג <span className="font-medium">1-10</span> מתוך <span className="font-medium">97</span> תוצאות
  </p>

  <nav className="flex items-center gap-1">
    <button className="px-3 py-2 text-sm rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
      הקודם
    </button>
    <button className="px-3 py-2 text-sm rounded-lg bg-primary text-white">1</button>
    <button className="px-3 py-2 text-sm rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">2</button>
    <button className="px-3 py-2 text-sm rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">3</button>
    <span className="px-2 text-slate-400">...</span>
    <button className="px-3 py-2 text-sm rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">10</button>
    <button className="px-3 py-2 text-sm rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
      הבא
    </button>
  </nav>
</div>
```

## 3.3 Load More Button

```tsx
<div className="flex flex-col items-center gap-4 py-8">
  <p className="text-sm text-slate-500">
    מציג 20 מתוך 150
  </p>
  <Button variant="secondary" onClick={loadMore} disabled={loading}>
    {loading ? (
      <>
        <Loader2 className="w-4 h-4 animate-spin" />
        טוען...
      </>
    ) : (
      'טען עוד'
    )}
  </Button>
</div>
```

---

# 4. BREADCRUMBS

## 4.1 Simple Breadcrumbs

```tsx
<nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
  <a href="/" className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
    בית
  </a>
  <ChevronLeft className="w-4 h-4 text-slate-400 rtl:rotate-180" />
  <a href="/products" className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
    מוצרים
  </a>
  <ChevronLeft className="w-4 h-4 text-slate-400 rtl:rotate-180" />
  <span className="text-slate-900 dark:text-white font-medium">
    שם המוצר
  </span>
</nav>
```

## 4.2 Breadcrumbs with Icons

```tsx
<nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
  <a href="/" className="p-1 text-slate-500 hover:text-slate-700 transition-colors">
    <Home className="w-4 h-4" />
  </a>
  <ChevronLeft className="w-4 h-4 text-slate-400 rtl:rotate-180" />
  <a href="/settings" className="
    flex items-center gap-1.5
    text-slate-500 hover:text-slate-700
    transition-colors
  ">
    <Settings className="w-4 h-4" />
    הגדרות
  </a>
  <ChevronLeft className="w-4 h-4 text-slate-400 rtl:rotate-180" />
  <span className="flex items-center gap-1.5 text-slate-900 dark:text-white font-medium">
    <User className="w-4 h-4" />
    פרופיל
  </span>
</nav>
```

---

# 5. TOOLTIPS

## 5.1 Basic Tooltip

```tsx
// Tooltip Container
<div className="relative group">
  <button className="p-2 hover:bg-slate-100 rounded-lg">
    <HelpCircle className="w-5 h-5 text-slate-500" />
  </button>

  {/* Tooltip */}
  <div className="
    absolute bottom-full start-1/2 -translate-x-1/2 mb-2
    px-3 py-2
    bg-slate-900 dark:bg-white
    text-white dark:text-slate-900
    text-sm
    rounded-lg
    shadow-lg
    opacity-0 invisible
    group-hover:opacity-100 group-hover:visible
    transition-all duration-200
    whitespace-nowrap
    z-50
  ">
    טקסט עזרה
    {/* Arrow */}
    <div className="
      absolute top-full start-1/2 -translate-x-1/2
      border-4 border-transparent border-t-slate-900 dark:border-t-white
    " />
  </div>
</div>
```

## 5.2 Tooltip Positions

```tsx
// Top (Default)
<div className="absolute bottom-full start-1/2 -translate-x-1/2 mb-2">

// Bottom
<div className="absolute top-full start-1/2 -translate-x-1/2 mt-2">

// Start (Right in RTL)
<div className="absolute end-full top-1/2 -translate-y-1/2 me-2">

// End (Left in RTL)
<div className="absolute start-full top-1/2 -translate-y-1/2 ms-2">
```

---

# 6. DROPDOWN MENU

## 6.1 Basic Dropdown

```tsx
<div className="relative">
  {/* Trigger */}
  <button className="
    flex items-center gap-2
    px-4 py-2
    bg-white dark:bg-slate-900
    border border-slate-200 dark:border-slate-800
    rounded-lg
    hover:bg-slate-50 dark:hover:bg-slate-800
    transition-colors
  ">
    <span>אפשרויות</span>
    <ChevronDown className="w-4 h-4" />
  </button>

  {/* Menu */}
  <div className="
    absolute top-full start-0 mt-2
    min-w-[200px]
    bg-white dark:bg-slate-900
    border border-slate-200 dark:border-slate-800
    rounded-xl
    shadow-lg
    py-2
    z-10
    animate-in fade-in slide-in-from-top-2 duration-200
  ">
    <button className="
      w-full px-4 py-2.5
      text-start text-sm
      text-slate-700 dark:text-slate-300
      hover:bg-slate-100 dark:hover:bg-slate-800
      transition-colors
      flex items-center gap-3
    ">
      <Edit className="w-4 h-4" />
      ערוך
    </button>
    <button className="
      w-full px-4 py-2.5
      text-start text-sm
      text-slate-700 dark:text-slate-300
      hover:bg-slate-100 dark:hover:bg-slate-800
      transition-colors
      flex items-center gap-3
    ">
      <Copy className="w-4 h-4" />
      שכפל
    </button>
    <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
    <button className="
      w-full px-4 py-2.5
      text-start text-sm
      text-red-600 dark:text-red-400
      hover:bg-red-50 dark:hover:bg-red-900/20
      transition-colors
      flex items-center gap-3
    ">
      <Trash className="w-4 h-4" />
      מחק
    </button>
  </div>
</div>
```

## 6.2 Select Dropdown

```tsx
<div className="relative">
  <button className="
    w-full
    flex items-center justify-between
    px-4 py-3
    bg-white dark:bg-slate-900
    border border-slate-300 dark:border-slate-700
    rounded-xl
    text-start
    focus:ring-2 focus:ring-primary/50 focus:border-primary
    transition-all
  ">
    <span className={selected ? 'text-slate-900 dark:text-white' : 'text-slate-400'}>
      {selected || 'בחר אפשרות...'}
    </span>
    <ChevronDown className="w-5 h-5 text-slate-400" />
  </button>

  <div className="
    absolute top-full inset-x-0 mt-2
    bg-white dark:bg-slate-900
    border border-slate-200 dark:border-slate-800
    rounded-xl
    shadow-lg
    max-h-60 overflow-auto
    z-10
  ">
    {options.map(option => (
      <button
        key={option.value}
        className={cn(
          "w-full px-4 py-3 text-start text-sm transition-colors flex items-center justify-between",
          option.value === selected
            ? "bg-primary/10 text-primary"
            : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        )}
      >
        {option.label}
        {option.value === selected && <Check className="w-4 h-4" />}
      </button>
    ))}
  </div>
</div>
```

---

# 7. ALERTS & BANNERS

## 7.1 Inline Alerts

```tsx
// Info Alert
<div className="
  flex items-start gap-3
  p-4
  bg-blue-50 dark:bg-blue-900/20
  border border-blue-200 dark:border-blue-800
  rounded-xl
">
  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
  <div>
    <p className="font-medium text-blue-900 dark:text-blue-100">שים לב</p>
    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
      זוהי הודעה מידעית חשובה שכדאי לקרוא.
    </p>
  </div>
</div>

// Success Alert
<div className="
  flex items-start gap-3
  p-4
  bg-green-50 dark:bg-green-900/20
  border border-green-200 dark:border-green-800
  rounded-xl
">
  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
  <div>
    <p className="font-medium text-green-900 dark:text-green-100">הצלחה!</p>
    <p className="text-sm text-green-700 dark:text-green-300 mt-1">
      הפעולה הושלמה בהצלחה.
    </p>
  </div>
</div>

// Warning Alert
<div className="
  flex items-start gap-3
  p-4
  bg-amber-50 dark:bg-amber-900/20
  border border-amber-200 dark:border-amber-800
  rounded-xl
">
  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
  <div>
    <p className="font-medium text-amber-900 dark:text-amber-100">אזהרה</p>
    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
      פעולה זו עלולה לגרום לשינויים בלתי הפיכים.
    </p>
  </div>
</div>

// Error Alert
<div className="
  flex items-start gap-3
  p-4
  bg-red-50 dark:bg-red-900/20
  border border-red-200 dark:border-red-800
  rounded-xl
">
  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
  <div>
    <p className="font-medium text-red-900 dark:text-red-100">שגיאה</p>
    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
      לא ניתן לבצע את הפעולה. אנא נסה שוב.
    </p>
  </div>
</div>
```

## 7.2 Top Banner

```tsx
<div className="
  bg-gradient-to-r from-primary to-secondary
  text-white
  py-3 px-4
">
  <div className="container mx-auto flex items-center justify-center gap-4 text-sm">
    <Sparkles className="w-4 h-4" />
    <p>
      <span className="font-semibold">חדש!</span> גרסה 2.0 זמינה עכשיו עם תכונות מדהימות.
    </p>
    <a href="/changelog" className="font-semibold underline hover:no-underline">
      קרא עוד ←
    </a>
  </div>
</div>
```

---

# 8. PROGRESS & STEPS

## 8.1 Progress Bar

```tsx
// Simple Progress
<div className="space-y-2">
  <div className="flex items-center justify-between text-sm">
    <span className="text-slate-600 dark:text-slate-400">התקדמות</span>
    <span className="font-medium">67%</span>
  </div>
  <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
    <div
      className="h-full bg-primary rounded-full transition-all duration-500"
      style={{ width: '67%' }}
    />
  </div>
</div>

// Segmented Progress
<div className="flex gap-1">
  {[1, 2, 3, 4, 5].map(step => (
    <div
      key={step}
      className={cn(
        "h-2 flex-1 rounded-full transition-colors",
        step <= current ? "bg-primary" : "bg-slate-200 dark:bg-slate-800"
      )}
    />
  ))}
</div>
```

## 8.2 Step Indicator

```tsx
<div className="flex items-center justify-between">
  {steps.map((step, index) => (
    <div key={step.id} className="flex items-center">
      {/* Step Circle */}
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors",
        index < current
          ? "bg-primary text-white"
          : index === current
          ? "bg-primary/20 text-primary border-2 border-primary"
          : "bg-slate-100 dark:bg-slate-800 text-slate-400"
      )}>
        {index < current ? (
          <Check className="w-5 h-5" />
        ) : (
          index + 1
        )}
      </div>

      {/* Step Label */}
      <span className={cn(
        "ms-3 text-sm font-medium hidden sm:block",
        index <= current ? "text-slate-900 dark:text-white" : "text-slate-400"
      )}>
        {step.label}
      </span>

      {/* Connector Line */}
      {index < steps.length - 1 && (
        <div className={cn(
          "w-12 md:w-24 h-0.5 mx-4",
          index < current ? "bg-primary" : "bg-slate-200 dark:bg-slate-800"
        )} />
      )}
    </div>
  ))}
</div>
```

---

# 9. ACCORDION

## 9.1 Basic Accordion

```tsx
<div className="
  border border-slate-200 dark:border-slate-800
  rounded-xl
  divide-y divide-slate-200 dark:divide-slate-800
  overflow-hidden
">
  {items.map(item => (
    <div key={item.id}>
      <button
        onClick={() => toggle(item.id)}
        className="
          w-full
          flex items-center justify-between
          p-4
          text-start
          hover:bg-slate-50 dark:hover:bg-slate-800/50
          transition-colors
        "
      >
        <span className="font-medium text-slate-900 dark:text-white">
          {item.title}
        </span>
        <ChevronDown className={cn(
          "w-5 h-5 text-slate-500 transition-transform duration-200",
          open === item.id && "rotate-180"
        )} />
      </button>

      {open === item.id && (
        <div className="px-4 pb-4 text-slate-600 dark:text-slate-400">
          {item.content}
        </div>
      )}
    </div>
  ))}
</div>
```

## 9.2 FAQ Accordion

```tsx
<div className="space-y-3">
  {faqs.map(faq => (
    <div
      key={faq.id}
      className="
        bg-white dark:bg-slate-900
        border border-slate-200 dark:border-slate-800
        rounded-xl
        overflow-hidden
      "
    >
      <button
        onClick={() => toggle(faq.id)}
        className="
          w-full
          flex items-start gap-4
          p-5
          text-start
        "
      >
        <div className={cn(
          "p-1 rounded-full transition-colors",
          open === faq.id
            ? "bg-primary/10 text-primary"
            : "bg-slate-100 dark:bg-slate-800 text-slate-500"
        )}>
          {open === faq.id ? (
            <Minus className="w-4 h-4" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
        </div>
        <span className="font-medium text-slate-900 dark:text-white flex-1">
          {faq.question}
        </span>
      </button>

      <div className={cn(
        "grid transition-all duration-200",
        open === faq.id ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}>
        <div className="overflow-hidden">
          <div className="px-5 pb-5 ps-14 text-slate-600 dark:text-slate-400 leading-relaxed">
            {faq.answer}
          </div>
        </div>
      </div>
    </div>
  ))}
</div>
```

---

# 10. AVATAR SYSTEM

## 10.1 Avatar Sizes

```tsx
// Size Scale
const sizes = {
  xs: 'w-6 h-6 text-xs',    // 24px
  sm: 'w-8 h-8 text-sm',    // 32px
  md: 'w-10 h-10 text-base', // 40px
  lg: 'w-12 h-12 text-lg',  // 48px
  xl: 'w-16 h-16 text-xl',  // 64px
  '2xl': 'w-24 h-24 text-3xl', // 96px
}

// Avatar Component
<div className={cn(
  "relative rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700",
  sizes[size]
)}>
  {src ? (
    <Image src={src} alt={name} fill className="object-cover" />
  ) : (
    <span className="absolute inset-0 flex items-center justify-center font-medium text-slate-600 dark:text-slate-300">
      {getInitials(name)}
    </span>
  )}
</div>
```

## 10.2 Avatar with Status

```tsx
<div className="relative inline-block">
  <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200">
    <Image src={avatar} alt={name} fill className="object-cover" />
  </div>
  {/* Status Indicator */}
  <span className={cn(
    "absolute bottom-0 end-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900",
    status === 'online' && "bg-green-500",
    status === 'away' && "bg-amber-500",
    status === 'busy' && "bg-red-500",
    status === 'offline' && "bg-slate-400"
  )} />
</div>
```

## 10.3 Avatar Group

```tsx
<div className="flex -space-x-3 rtl:space-x-reverse">
  {users.slice(0, 4).map((user, index) => (
    <div
      key={user.id}
      className="
        relative
        w-10 h-10
        rounded-full
        border-2 border-white dark:border-slate-900
        overflow-hidden
        bg-slate-200
      "
      style={{ zIndex: users.length - index }}
    >
      <Image src={user.avatar} alt={user.name} fill className="object-cover" />
    </div>
  ))}
  {users.length > 4 && (
    <div className="
      relative
      w-10 h-10
      rounded-full
      border-2 border-white dark:border-slate-900
      bg-slate-100 dark:bg-slate-800
      flex items-center justify-center
      text-sm font-medium text-slate-600 dark:text-slate-400
    ">
      +{users.length - 4}
    </div>
  )}
</div>
```

---

# 11. FILE UPLOAD

## 11.1 Drag & Drop Zone

```tsx
<div
  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
  onDragLeave={() => setDragging(false)}
  onDrop={handleDrop}
  className={cn(
    "relative border-2 border-dashed rounded-2xl p-8 text-center transition-colors",
    dragging
      ? "border-primary bg-primary/5"
      : "border-slate-300 dark:border-slate-700 hover:border-slate-400"
  )}
>
  <input
    type="file"
    multiple
    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
    onChange={handleFileSelect}
  />

  <div className="flex flex-col items-center gap-4">
    <div className={cn(
      "w-16 h-16 rounded-full flex items-center justify-center transition-colors",
      dragging ? "bg-primary/10" : "bg-slate-100 dark:bg-slate-800"
    )}>
      <Upload className={cn(
        "w-8 h-8",
        dragging ? "text-primary" : "text-slate-400"
      )} />
    </div>

    <div>
      <p className="font-medium text-slate-900 dark:text-white">
        גרור קבצים לכאן
      </p>
      <p className="text-sm text-slate-500 mt-1">
        או <span className="text-primary font-medium">לחץ לבחירת קבצים</span>
      </p>
    </div>

    <p className="text-xs text-slate-400">
      PNG, JPG עד 10MB
    </p>
  </div>
</div>
```

## 11.2 File Preview List

```tsx
<div className="space-y-3">
  {files.map(file => (
    <div
      key={file.id}
      className="
        flex items-center gap-4
        p-4
        bg-slate-50 dark:bg-slate-800/50
        rounded-xl
      "
    >
      {/* File Icon/Preview */}
      {file.type.startsWith('image/') ? (
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-200">
          <img src={file.preview} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
          <File className="w-6 h-6 text-slate-500" />
        </div>
      )}

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 dark:text-white truncate">
          {file.name}
        </p>
        <p className="text-sm text-slate-500">
          {formatFileSize(file.size)}
        </p>
      </div>

      {/* Upload Progress or Status */}
      {file.uploading ? (
        <div className="w-24">
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${file.progress}%` }}
            />
          </div>
        </div>
      ) : file.error ? (
        <span className="text-red-500 text-sm">{file.error}</span>
      ) : (
        <Check className="w-5 h-5 text-green-500" />
      )}

      {/* Remove Button */}
      <button
        onClick={() => removeFile(file.id)}
        className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
      >
        <X className="w-4 h-4 text-slate-500" />
      </button>
    </div>
  ))}
</div>
```
