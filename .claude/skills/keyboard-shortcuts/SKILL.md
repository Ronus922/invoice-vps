---
name: keyboard-shortcuts
description: Complete keyboard shortcuts & tooltips system for Next.js/React apps — ShortcutDef types, Mac-aware formatter (⌘/Ctrl), keyboard event matcher, global listener component, workspace-scoped useEffect pattern, grouped shortcuts dialog, and CSS-only tooltips via group-hover. RTL-first, zero-JS tooltips, isEditableTarget guard. Use when adding keyboard shortcuts, tooltip hints, or a shortcuts discovery dialog to any React app. Triggers: "keyboard shortcuts", "hotkeys", "shortcut system", "tooltip", "keyboard navigation", "shortcuts dialog", "?  dialog", "isEditableTarget".
---

# Keyboard Shortcuts & Tooltips System

> Mac-aware shortcuts + CSS-only tooltips + discoverable dialog. Zero JS for tooltips.

---

## Architecture

```
src/
├── lib/keyboard/
│   └── shortcuts.ts           # Types, matcher, formatter, all definitions
├── components/shared/
│   ├── GlobalShortcuts.tsx    # "use client" — global keydown + dialog trigger
│   └── ShortcutsDialog.tsx    # Modal: all shortcuts grouped by category
└── components/ui/
    └── tooltip-simple.tsx     # CSS-only tooltip (group-hover, no JS)
```

---

## 1. Core: `src/lib/keyboard/shortcuts.ts`

```typescript
"use client";

export type ShortcutDef = {
  key: string;        // "n", "e", "/", "Delete", "?"
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  label: string;      // Display: "Ctrl+N"
  description: string; // Hebrew: "רשומה חדשה"
};

// Mac-aware formatting (⌘ vs Ctrl)
export function formatShortcut(def: ShortcutDef): string {
  const isMac = typeof navigator !== "undefined" && navigator.platform?.includes("Mac");
  const parts: string[] = [];
  if (def.ctrl)  parts.push(isMac ? "⌘" : "Ctrl");
  if (def.shift) parts.push(isMac ? "⇧" : "Shift");
  if (def.alt)   parts.push(isMac ? "⌥" : "Alt");
  parts.push(def.key.length === 1 ? def.key.toUpperCase() : def.key);
  return parts.join(isMac ? "" : "+");
}

// Match keyboard event against definition
export function matchesShortcut(e: KeyboardEvent, def: ShortcutDef): boolean {
  const ctrlOrMeta = e.ctrlKey || e.metaKey;
  if (def.ctrl  && !ctrlOrMeta) return false;
  if (!def.ctrl && ctrlOrMeta)  return false;
  if (def.shift && !e.shiftKey) return false;
  if (def.alt   && !e.altKey)   return false;
  return e.key.toLowerCase() === def.key.toLowerCase();
}

// Guard: prevent shortcuts in text inputs
export function isEditableTarget(e: KeyboardEvent): boolean {
  const tag = (e.target as HTMLElement).tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (e.target as HTMLElement).isContentEditable
  );
}

// ── Shortcut Definitions ─────────────────────────────────────────────────────
export const SHORTCUTS = {
  // Navigation
  SEARCH:         { key: "/",      label: "/",              description: "חיפוש" },
  DASHBOARD:      { key: "d", ctrl: true, shift: true,      label: "Ctrl+Shift+D", description: "דשבורד" },

  // CRUD
  NEW_RECORD:     { key: "n", ctrl: true,                   label: "Ctrl+N",       description: "רשומה חדשה" },
  EDIT:           { key: "e", ctrl: true,                   label: "Ctrl+E",       description: "עריכה" },
  DELETE:         { key: "Delete",                          label: "Del",          description: "מחיקה" },
  COPY_NAME:      { key: "c", ctrl: true, shift: true,      label: "Ctrl+Shift+C", description: "העתק שם" },
  CLOSE_PANEL:    { key: "Escape",                          label: "Esc",          description: "סגירה" },
  SELECT_ALL:     { key: "a", ctrl: true,                   label: "Ctrl+A",       description: "בחר הכל" },

  // Domain-specific (leads example)
  WHATSAPP:       { key: "w", ctrl: true, shift: true,      label: "Ctrl+Shift+W", description: "WhatsApp" },
  ADVANCE_STATUS: { key: "s", ctrl: true, shift: true,      label: "Ctrl+Shift+S", description: "קדם סטטוס" },

  // View
  TOGGLE_CHARTS:  { key: "g", ctrl: true,                   label: "Ctrl+G",       description: "גרפים" },
  TOGGLE_VIEW:    { key: "v", ctrl: true, shift: true,      label: "Ctrl+Shift+V", description: "החלף תצוגה" },

  // Help
  SHOW_SHORTCUTS: { key: "?", shift: true,                  label: "?",            description: "קיצורי מקלדת" },
} as const;

// ── Groups for Dialog ────────────────────────────────────────────────────────
export const SHORTCUT_GROUPS = [
  { title: "ניווט",   items: [SHORTCUTS.SEARCH, SHORTCUTS.DASHBOARD] },
  { title: "פעולות",  items: [SHORTCUTS.NEW_RECORD, SHORTCUTS.EDIT, SHORTCUTS.DELETE, SHORTCUTS.COPY_NAME, SHORTCUTS.CLOSE_PANEL, SHORTCUTS.SELECT_ALL] },
  { title: "לידים",   items: [SHORTCUTS.WHATSAPP, SHORTCUTS.ADVANCE_STATUS] },
  { title: "תצוגה",   items: [SHORTCUTS.TOGGLE_VIEW, SHORTCUTS.TOGGLE_CHARTS] },
  { title: "עזרה",    items: [SHORTCUTS.SHOW_SHORTCUTS] },
];
```

---

## 2. Global Listener: `GlobalShortcuts.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { matchesShortcut, isEditableTarget, SHORTCUTS } from "@/lib/keyboard/shortcuts";
import { ShortcutsDialog } from "./ShortcutsDialog";

export function GlobalShortcuts() {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return;

      if (matchesShortcut(e, SHORTCUTS.SHOW_SHORTCUTS)) {
        e.preventDefault();
        setDialogOpen(prev => !prev);
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.SEARCH)) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('[placeholder*="חיפוש"]');
        searchInput?.focus();
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.DASHBOARD)) {
        e.preventDefault();
        router.push("/dashboard");
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return <ShortcutsDialog open={dialogOpen} onOpenChange={setDialogOpen} />;
}
```

**Add to layout:**
```tsx
// app/(dashboard)/layout.tsx
import { GlobalShortcuts } from "@/components/shared/GlobalShortcuts";

export default function DashboardLayout({ children }) {
  return (
    <>
      <GlobalShortcuts />
      {children}
    </>
  );
}
```

---

## 3. Workspace-Scoped Shortcuts Pattern

```tsx
"use client";
// In any workspace component (EntityWorkspace, LeadsWorkspace, etc.)

import { useEffect } from "react";
import { matchesShortcut, isEditableTarget, SHORTCUTS } from "@/lib/keyboard/shortcuts";

export function EntityWorkspace() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailRecord, setDetailRecord] = useState<Entity | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return;

      if (matchesShortcut(e, SHORTCUTS.NEW_RECORD)) {
        e.preventDefault();
        openNewForm();
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.EDIT) && selectedId) {
        e.preventDefault();
        editSelected();
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.DELETE) && selectedId) {
        e.preventDefault();
        deleteSelected(); // Always with confirmation dialog
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.COPY_NAME) && detailRecord) {
        e.preventDefault();
        navigator.clipboard.writeText(detailRecord.name);
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.CLOSE_PANEL)) {
        setDetailRecord(null);
        setSelectedId(null);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, detailRecord]); // ← deps: everything handler uses

  // ...
}
```

**Leads-specific additions:**
```tsx
// Additional shortcuts for LeadsWorkspace
if (matchesShortcut(e, SHORTCUTS.TOGGLE_VIEW)) {
  e.preventDefault();
  setViewMode(v => v === "table" ? "kanban" : "table");
}
if (matchesShortcut(e, SHORTCUTS.TOGGLE_CHARTS)) {
  e.preventDefault();
  setShowCharts(prev => !prev);
}
if (matchesShortcut(e, SHORTCUTS.SELECT_ALL)) {
  e.preventDefault();
  setSelectedIds(leads.map(l => l.id));
}
if (matchesShortcut(e, SHORTCUTS.WHATSAPP) && selectedId) {
  e.preventDefault();
  openWhatsApp(selectedLead?.phone);
}
if (matchesShortcut(e, SHORTCUTS.ADVANCE_STATUS) && selectedId) {
  e.preventDefault();
  advanceLeadStatus(selectedId);
}
```

---

## 4. Shortcuts Dialog: `ShortcutsDialog.tsx`

```tsx
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SHORTCUT_GROUPS } from "@/lib/keyboard/shortcuts";

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>קיצורי מקלדת</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.map(item => (
                  <div key={item.label} className="flex items-center justify-between py-1">
                    <span className="text-sm text-foreground">{item.description}</span>
                    <kbd className="rounded border border-border/60 bg-muted/80 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                      {item.label}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 5. Tooltip: `tooltip-simple.tsx`

```tsx
import { cn } from "@/lib/utils";

const positionClasses = {
  top:    "-top-8 left-1/2 -translate-x-1/2",
  bottom: "-bottom-8 left-1/2 -translate-x-1/2",
  start:  "top-1/2 -translate-y-1/2 -right-2 translate-x-full",  // RTL: right side
  end:    "top-1/2 -translate-y-1/2 -left-2 -translate-x-full",   // RTL: left side
} as const;

export function TooltipSimple({
  content,
  children,
  position = "top",
}: {
  content: string;
  children: React.ReactNode;
  position?: keyof typeof positionClasses;
}) {
  return (
    <div className="group relative inline-flex">
      {children}
      <div className={cn(
        "pointer-events-none absolute z-50 whitespace-nowrap rounded-md",
        "bg-foreground px-2.5 py-1 text-xs text-background",
        "opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100",
        positionClasses[position]
      )}>
        {content}
      </div>
    </div>
  );
}
```

---

## 6. Tooltip Application Map

| Area | Elements |
|------|----------|
| AppHeader | Hamburger, search, drive sync, theme toggle, logout |
| EntityWorkspace | New record (+shortcut hint), export CSV/Excel, pagination prev/next, panel close, action buttons |
| LeadsWorkspace | View toggle (+shortcut), charts toggle (+shortcut), pipeline steps, bulk actions, close panel |
| WhatsApp | Tabs, send button, copy buttons |
| Dashboard | KPI card info icons, alert dismiss |

**Pattern — tooltip with shortcut hint:**
```tsx
<TooltipSimple content="רשומה חדשה (Ctrl+N)">
  <button onClick={openForm} className="touch-target">
    <Plus className="size-4" />
  </button>
</TooltipSimple>
```

---

## Design Decisions

| Decision | Why |
|----------|-----|
| `isEditableTarget()` guard | Shortcuts never fire in forms/inputs |
| `ctrlKey \|\| metaKey` in matcher | Mac Cmd = Windows Ctrl — one definition covers both |
| `formatShortcut()` on display only | Definitions use `ctrl: true`, display is platform-aware |
| CSS-only tooltips | Zero JS, no state, no render overhead |
| Workspace useEffect deps `[selectedId, detailRecord]` | Handler always has fresh values without re-registering |
| Delete always with confirmation | Never destructive without user confirmation |

---

## Anti-Patterns

```
❌ Shortcut fires in <input> — שכחת isEditableTarget() guard
❌ Handler in useEffect with empty [] + stale closure — הוסף deps: [selectedId, ...]
❌ Tooltip עם useState/useEffect — CSS-only מספיק, אל תוסיף JS
❌ Shortcut conflicts — "/" זה חיפוש, "?" זה help dialog, "Esc" זה סגירה — לא לשנות
❌ e.preventDefault() on Escape — Esc סוגר dialog בעצמו, אל תמנע
❌ Missing cleanup — תמיד return () => window.removeEventListener(...)
```

---

## Related Skills
- `/components` — Complex UI components library
- `/design` — RTL spacing & touch targets (min 44x44px)
- `/ui-details` — Micro UI polish — kbd styling, focus rings
- `/features` — Common feature patterns
