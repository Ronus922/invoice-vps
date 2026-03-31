---
name: web-artifacts-builder
description: Build elaborate multi-component HTML artifacts using React 18 + TypeScript + Vite + shadcn/ui, then bundle into a single self-contained HTML file for sharing. 40+ shadcn components pre-installed. Use for complex interactive dashboards, data visualizations, demo pages, or any artifact requiring state management or routing. Triggers: "build artifact", "web artifact", "interactive HTML", "shadcn artifact", "React artifact", "single HTML", "bundle to HTML", "demo page".
---

# Web Artifacts Builder

> React 18 + TS + Vite + shadcn/ui → קובץ HTML יחיד שניתן לשתף.

**Stack:** React 18 + TypeScript + Vite + Tailwind CSS 3 + shadcn/ui + Parcel (bundling)

---

## מתי להשתמש

- Dashboard אינטראקטיבי עם charts/tables/filters
- Demo page לpresentation
- Multi-step wizard / form מורכב
- Data visualization עם state management
- כל artifact שצריך routing, context, או 40+ shadcn components

**לא לשימוש:** HTML פשוט, JSX בודד, static page ללא state

---

## 5-Step Workflow

### Step 1: Initialize Project
```bash
bash scripts/init-artifact.sh <project-name>
cd <project-name>
```

**מה נוצר:**
```
project-name/
├── src/
│   ├── App.tsx          # entry point
│   ├── components/      # shadcn components (40+ pre-installed)
│   └── lib/
│       └── utils.ts     # cn() helper
├── index.html
├── package.json         # React 18 + Vite + Tailwind + Radix UI
├── tailwind.config.js
├── tsconfig.json
└── .parcelrc            # bundler config
```

### Step 2: Develop
```bash
npm run dev   # dev server with hot reload
```

**shadcn components זמינים (40+):**
```
Button, Card, Dialog, Sheet, Table, Input, Select,
Tabs, Badge, Alert, Avatar, Calendar, Checkbox,
Command, DatePicker, DropdownMenu, Form, HoverCard,
Label, Menubar, NavigationMenu, Popover, Progress,
RadioGroup, ScrollArea, Separator, Skeleton, Slider,
Switch, Textarea, Toast, Toggle, Tooltip, Accordion,
AspectRatio, Collapsible, ContextMenu, Resizable...
```

**Design Guidelines:**
```
✅ Varied layouts — avoid all-centered
✅ Typography hierarchy — h1/h2/h3, not just same-size text
✅ Meaningful spacing — not uniform padding everywhere
✅ Subtle animations — framer-motion if needed
✅ Dark mode via CSS variables (already configured)

❌ Excessive centered layouts
❌ Purple gradients everywhere
❌ Uniform rounded corners on everything
❌ Only Inter font (boring)
```

### Step 3: Bundle to Single HTML
```bash
bash scripts/bundle-artifact.sh
# → creates bundle.html
```

**מה הscript עושה:**
1. מתקין parcel + dependencies
2. בונה עם Parcel (no source maps)
3. Inlines כל JS/CSS/assets לHTML יחיד
4. `bundle.html` — self-contained, ניתן לשתף ישירות

**Requirements:**
- חייב להיות `index.html` בroot
- Node 18+

### Step 4: Share Artifact
שתף את `bundle.html` בשיחה — מוצג כartifact.

### Step 5: Test (אופציונלי)
```bash
# רק אם נדרש — מוסיף latency
# עדיף לבדוק רק אם יש bugs ספציפיים
python scripts/test_artifact.py bundle.html
```

---

## Common Patterns

### Dashboard Layout
```tsx
// src/App.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function Dashboard() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid grid-cols-3 gap-4">
            <MetricCard title="Users" value="1,234" />
            <MetricCard title="Revenue" value="$12,345" />
            <MetricCard title="Growth" value="+23%" />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

### Data Table
```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Built-in sorting + filtering + pagination
```

### Interactive Form
```tsx
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
```

---

## Hebrew / RTL Support
```tsx
// index.html — הוסף ל-<html>
<html lang="he" dir="rtl">

// App.tsx
<div className="font-sans" style={{ direction: 'rtl' }}>

// Tailwind RTL
<div className="text-right mr-4">   {/* ✅ */}
<div className="text-left ml-4">    {/* ❌ בRTL */}
```

---

## Anti-Patterns
- **לא לtest מראש** — bundle → share → test רק אם יש בעיה
- **אל תשתמש בCDN** — Parcel ינהל dependencies, לא CDN links
- **אל תשכח `cn()` helper** — לmerge class names עם shadcn
- **הימנע מ-`any` ב-TypeScript** — כבד ב-type safety
