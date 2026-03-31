---
name: side-panel
description: Side Panel Pattern — מחליף את כל הפופאפים/מודאלים בפאנל צדדי RTL שנפתח מצד שמאל ותופס 55% מהמסך. שואל את המשתמש על אייקון סגירה ורקע לפני הביצוע.
---

# Side Panel — מסך צדדי

**Skill**: `/side-panel`
**Purpose**: אין פופאפים במערכת — כל modal/dialog/sheet → פאנל צדדי אחיד

---

## ❓ שאלות לפני הביצוע — שאל תמיד!

לפני שאתה כותב קוד, שאל את המשתמש **שתי שאלות**:

### שאלה 1 — אייקון סגירה

```
איזה אייקון סגירה להשתמש בפאנל?

1. נתיב מותאם — ספק נתיב לקובץ:
   • SVG/PNG: /icons/close.svg
   • Lottie JSON: /animations/close.json
   • DotLottie: /animations/close.lottie

2. ברירת מחדל — אשתמש באייקון X מהספריה הקיימת בפרויקט
   (Lucide / Heroicons / Tabler — בהתאם למה שנמצא בקוד)
```

### שאלה 2 — רקע הפאנל

```
מה יהיה הרקע של הפאנל הצדדי?

1. לבן    — bg-white
2. שחור   — bg-gray-950
3. זכוכית — bg-white/90 backdrop-blur-md (light glass)
             bg-gray-950/90 backdrop-blur-md (dark glass)
```

**המתן לתשובה לפני שממשיכים.**

---

## 🏗️ מפרט עיצובי

| Property | Value |
|----------|-------|
| מיקום | Left side — `inset-y-0 left-0` |
| רוחב | `w-[55%]` — mobile: `w-full` |
| Overlay opacity | `0.65` (לא 0.5, לא 0.7) |
| הנפשה | Fade in/out, `1.2s ease-in-out` |
| Border-radius | `rounded-tr-[0.65rem] rounded-br-[0.65rem]` |
| Shadow | `shadow-2xl` |
| Header padding | `px-6 py-4` |
| Content padding | `p-6` |
| כיוון | `dir="rtl"` על כל הפאנל — header + תוכן + children |
| יישור תוכן | `text-right` — כל הטקסט בפאנל מיושר לימין |
| Overlay | `bg-black/65` על שאר המסך |

### מיקום אלמנטים בהדר

```
┌─────────────────────────────────┐
│ [✕ Close]     [כותרת + תת-כותרת]│  ← Header (dir="rtl")
├─────────────────────────────────┤
│                                 │
│   תוכן פנימי (RTL, scrollable)  │
│                                 │
└─────────────────────────────────┘
```

- **ימין** — כותרת ראשית + כותרת משנית (`text-right`)
- **שמאל** — אייקון סגירה / קובץ Lottie
- **פינות חשופות** — `rounded-tr-[0.65rem] rounded-br-[0.65rem]`

---

## 💻 קבצים ליצור

### 1. `src/components/ui/SidePanel.tsx`

```tsx
"use client";

import { useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react"; // ← מחלף לפי בחירת המשתמש

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  background?: "white" | "black" | "glass";
  closeIcon?: React.ReactNode;
}

const DURATION = 1.2;

const bgClass: Record<NonNullable<SidePanelProps["background"]>, string> = {
  white: "bg-white",
  black: "bg-gray-950",
  glass: "bg-white/90 backdrop-blur-md dark:bg-gray-950/90",
};

export function SidePanel({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  background = "white",
  closeIcon,
}: SidePanelProps) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKey]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50" dir="rtl">
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION, ease: "easeInOut" }}
            className="absolute inset-0 bg-black/65"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={{ duration: DURATION, ease: "easeInOut" }}
            className={[
              "absolute inset-y-0 left-0",
              "w-[55%] max-sm:w-full",
              "flex flex-col",
              "shadow-2xl",
              "rounded-tr-[0.65rem] rounded-br-[0.65rem]",
              bgClass[background],
            ].join(" ")}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              {/* Right (RTL start) — Title */}
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white text-right">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-right">
                    {subtitle}
                  </p>
                )}
              </div>

              {/* Left (RTL end) — Close */}
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                aria-label="סגור"
              >
                {closeIcon ?? <X size={20} className="text-gray-500" />}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 text-right">
              {children}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
```

### 2. `src/hooks/useSidePanel.ts`

```ts
import { useState, useCallback } from "react";

export function useSidePanel() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  return { isOpen, open, close, toggle };
}
```

---

## 🎬 שימוש — דוגמאות

### פתיחה מתוך שורה בטבלה

```tsx
import { SidePanel } from "@/components/ui/SidePanel";
import { useSidePanel } from "@/hooks/useSidePanel";

export function RecordsTable() {
  const panel = useSidePanel();
  const [selected, setSelected] = useState<Record | null>(null);

  function handleRowClick(record: Record) {
    setSelected(record);
    panel.open();
  }

  return (
    <>
      <Table rows={records} onRowClick={handleRowClick} />

      <SidePanel
        isOpen={panel.isOpen}
        onClose={panel.close}
        title={selected?.name ?? ""}
        subtitle={selected?.id ? `#${selected.id}` : undefined}
        background="white"
      >
        {selected && <RecordDetails record={selected} />}
      </SidePanel>
    </>
  );
}
```

### עם Lottie (כשהמשתמש בחר קובץ)

```tsx
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

<SidePanel
  isOpen={panel.isOpen}
  onClose={panel.close}
  title="פרטי לקוח"
  subtitle="עריכה ועדכון"
  background="glass"
  closeIcon={
    <DotLottieReact
      src="/animations/close.lottie"
      loop={false}
      autoplay
      className="w-6 h-6"
    />
  }
>
  <CustomerForm />
</SidePanel>
```

### פתיחה מכפתור / מבלון / מכל אלמנט

```tsx
// כל פופאפ / modal / dialog → SidePanel
// ❌ <Dialog> / <Modal> / <Sheet>
// ✅ <SidePanel>

const panel = useSidePanel();

<Button onClick={panel.open}>פתח פרטים</Button>
<SidePanel isOpen={panel.isOpen} onClose={panel.close} title="פרטים">
  ...
</SidePanel>
```

---

## ✅ Checklist

### יצירה
- [ ] `src/components/ui/SidePanel.tsx` נוצר
- [ ] `src/hooks/useSidePanel.ts` נוצר
- [ ] `framer-motion` מותקן (`npm i framer-motion`)

### הגדרות ראשוניות
- [ ] אייקון סגירה הוגדר (custom path / ברירת מחדל)
- [ ] Background הוגדר (`white` / `black` / `glass`)

### החלפות
- [ ] כל `<Dialog>` / `<Modal>` / `<Sheet>` הוחלף ב-`<SidePanel>`
- [ ] כל `useState(false)` לניהול open/close → `useSidePanel()`

### עיצוב
- [ ] `dir="rtl"` על ה-panel wrapper — מחיל RTL על header + תוכן + כל children
- [ ] `text-right` על ה-content area ועל הכותרת
- [ ] children מקבלים RTL בירושה — לא צריך להוסיף `dir` בכל קומפוננטה פנימית
- [ ] כותרת בפינה ימנית, סגירה בפינה שמאלית
- [ ] `rounded-tr-[0.65rem] rounded-br-[0.65rem]` על ה-panel
- [ ] רוחב `55%` — mobile: `100%`
- [ ] Overlay `bg-black/65`

### אנימציה
- [ ] פתיחה: `x: "-100%" → 0` + `opacity: 0 → 1`, `1.2s`
- [ ] סגירה: `x: 0 → "-100%"` + `opacity: 1 → 0`, `1.2s`
- [ ] `AnimatePresence` עוטף את ה-panel

### Accessibility
- [ ] `role="dialog"` + `aria-modal="true"`
- [ ] `aria-label` על ה-panel (כותרת)
- [ ] `aria-label="סגור"` על כפתור הסגירה
- [ ] Escape key סוגר
- [ ] `overflow: hidden` על body בזמן פתיחה
- [ ] touch target ≥ 44×44px על כפתור סגירה
