---
name: features
description: Ready-made feature patterns and components - Icons, Authentication, Dashboard, CRUD, Search, Forms, and common UI patterns.
---

# FEATURES.md - פיצ'רים מוכנים

**Version:** 2.0.0
**Purpose:** תבניות מוכנות לפיצ'רים נפוצים - העתק, התאם, השתמש.

---

## תוכן עניינים

1. [ספריות אייקונים](#ספריות-אייקונים)
2. [Authentication](#authentication)
3. [Dashboard Layout](#dashboard-layout)
4. [CRUD Operations](#crud-operations)
5. [Search & Filtering](#search--filtering)
6. [Data Tables](#data-tables)
7. [Forms](#forms)
8. [Modals & Dialogs](#modals--dialogs)
9. [Loading States](#loading-states)
10. [Error Handling](#error-handling)
11. [Toast Notifications](#toast-notifications)
12. [File Upload](#file-upload)
13. [Pagination](#pagination)
14. [Tabs & Navigation](#tabs--navigation)

---

## ספריות אייקונים

### Lucide React (מומלץ עם shadcn/ui)

**התקנה:**
```bash
pnpm add lucide-react
```

**שימוש בסיסי:**
```tsx
import { Home, Bell, Settings, Search, Plus, Trash2, Edit, ChevronRight } from 'lucide-react';

// בתוך קומפוננטה
<Home className="w-5 h-5" />
<Bell className="w-5 h-5 text-blue-500" />
<Settings className="w-5 h-5 text-muted-foreground" />
```

**עם כפתור shadcn:**
```tsx
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';

<Button>
  <Plus className="w-4 h-4 me-2" />
  הוסף חדש
</Button>

// Loading state
<Button disabled>
  <Loader2 className="w-4 h-4 me-2 animate-spin" />
  שומר...
</Button>
```

**אייקונים נפוצים:**
| שימוש | אייקון | קוד |
|-------|--------|-----|
| בית | 🏠 | `<Home />` |
| חיפוש | 🔍 | `<Search />` |
| הגדרות | ⚙️ | `<Settings />` |
| התראות | 🔔 | `<Bell />` |
| משתמש | 👤 | `<User />` |
| הוספה | ➕ | `<Plus />` |
| עריכה | ✏️ | `<Edit />` / `<Pencil />` |
| מחיקה | 🗑️ | `<Trash2 />` |
| סגירה | ✖️ | `<X />` |
| וי | ✓ | `<Check />` |
| טעינה | ⏳ | `<Loader2 className="animate-spin" />` |
| חץ | → | `<ChevronRight />` / `<ArrowRight />` |
| תפריט | ☰ | `<Menu />` |
| יותר | ⋯ | `<MoreHorizontal />` / `<MoreVertical />` |
| הורדה | ⬇️ | `<Download />` |
| העלאה | ⬆️ | `<Upload />` |
| קובץ | 📄 | `<File />` / `<FileText />` |
| תיקייה | 📁 | `<Folder />` |
| לוח שנה | 📅 | `<Calendar />` |
| שעון | 🕐 | `<Clock />` |
| מייל | ✉️ | `<Mail />` |
| טלפון | 📞 | `<Phone />` |
| מיקום | 📍 | `<MapPin />` |
| קישור | 🔗 | `<Link />` / `<ExternalLink />` |
| עין | 👁️ | `<Eye />` / `<EyeOff />` |
| מנעול | 🔒 | `<Lock />` / `<Unlock />` |
| כוכב | ⭐ | `<Star />` |
| לב | ❤️ | `<Heart />` |
| סינון | 🔽 | `<Filter />` |
| מיון | ↕️ | `<ArrowUpDown />` |

**קישור לדוקומנטציה:** https://lucide.dev/icons

---

### Hugeicons (מגוון סגנונות)

**התקנה:**
```bash
pnpm add @hugeicons/react
```

**שימוש:**
```tsx
import { Home01Icon, Notification01Icon, Settings01Icon } from '@hugeicons/react';

<Home01Icon className="w-5 h-5" />
<Notification01Icon className="w-5 h-5" />
```

**סגנונות זמינים:**
- `stroke-rounded` (ברירת מחדל)
- `stroke-sharp`
- `solid-rounded`
- `solid-sharp`
- `bulk-rounded`
- `duotone-rounded`
- `twotone-rounded`

**MCP Server - חיפוש אייקונים:**
```
# בתוך Claude Code
"חפש אייקון של בית"
"מצא אייקון notification"
```

**קישור:** https://hugeicons.com

---

### השוואה מהירה

| קריטריון | Lucide | Hugeicons |
|----------|--------|-----------|
| כמות אייקונים | ~1,400 | ~4,000+ |
| סגנונות | 1 | 9 |
| גודל Bundle | קטן | בינוני |
| אינטגרציה shadcn | מובנית | ידנית |
| MCP Server | ❌ | ✅ |
| **מומלץ ל** | UI יומיומי | מגוון/ייחודי |

---

## Authentication

### Supabase Auth עם Next.js 15

**התקנה:**
```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

**יצירת Client:**
```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Server Client:**
```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}
```

**Login Form:**
```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('אימייל או סיסמה שגויים')
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <Input
        type="email"
        placeholder="אימייל"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        dir="ltr"
      />
      <Input
        type="password"
        placeholder="סיסמה"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        dir="ltr"
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'התחברות'}
      </Button>
    </form>
  )
}
```

**Protected Route (Middleware):**
```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protected routes
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*'],
}
```

---

## Dashboard Layout

### Layout עם Sidebar

```tsx
// app/(dashboard)/layout.tsx
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 bg-muted/30">
          {children}
        </main>
      </div>
    </div>
  )
}
```

**Sidebar Component:**
```tsx
// components/layout/sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Home, Users, FolderKanban, CheckSquare,
  FileText, Settings, LogOut
} from 'lucide-react'

const navigation = [
  { name: 'דשבורד', href: '/dashboard', icon: Home },
  { name: 'לקוחות', href: '/clients', icon: Users },
  { name: 'פרויקטים', href: '/projects', icon: FolderKanban },
  { name: 'משימות', href: '/tasks', icon: CheckSquare },
  { name: 'דוחות', href: '/reports', icon: FileText },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-card border-e flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b">
        <span className="text-xl font-bold">לוגו</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted"
        >
          <Settings className="w-5 h-5" />
          הגדרות
        </Link>
        <button
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-red-500 hover:bg-red-50"
          onClick={() => {/* logout */}}
        >
          <LogOut className="w-5 h-5" />
          התנתקות
        </button>
      </div>
    </aside>
  )
}
```

---

## CRUD Operations

### React Query + Supabase Pattern

```typescript
// hooks/useClients.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Client } from '@/types'

const supabase = createClient()

// READ - List
export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data as Client[]
    },
  })
}

// READ - Single
export function useClient(id: string) {
  return useQuery({
    queryKey: ['clients', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data as Client
    },
    enabled: !!id,
  })
}

// CREATE
export function useCreateClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (client: Omit<Client, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('clients')
        .insert(client)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
  })
}

// UPDATE
export function useUpdateClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Client> & { id: string }) => {
      const { data, error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['clients', id] })
    },
  })
}

// DELETE
export function useDeleteClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
  })
}
```

---

## Search & Filtering

### Search Input with Debounce

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounce?: number
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'חיפוש...',
  debounce = 300,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(localValue)
    }, debounce)

    return () => clearTimeout(timer)
  }, [localValue, debounce, onChange])

  return (
    <div className="relative">
      <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="ps-9 pe-9"
      />
      {localValue && (
        <button
          onClick={() => setLocalValue('')}
          className="absolute end-3 top-1/2 -translate-y-1/2"
        >
          <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
        </button>
      )}
    </div>
  )
}
```

### Filter Bar

```tsx
'use client'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Filter, X } from 'lucide-react'

interface FilterBarProps {
  status: string
  onStatusChange: (status: string) => void
  onClear: () => void
}

export function FilterBar({ status, onStatusChange, onClear }: FilterBarProps) {
  const hasFilters = status !== 'all'

  return (
    <div className="flex items-center gap-3">
      <Filter className="w-4 h-4 text-muted-foreground" />

      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="סטטוס" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">הכל</SelectItem>
          <SelectItem value="active">פעיל</SelectItem>
          <SelectItem value="pending">ממתין</SelectItem>
          <SelectItem value="completed">הושלם</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="w-4 h-4 me-1" />
          נקה פילטרים
        </Button>
      )}
    </div>
  )
}
```

---

## Data Tables

### טבלה בסיסית עם מיון

```tsx
'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ArrowUpDown, MoreHorizontal, Edit, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface DataTableProps<T> {
  data: T[]
  columns: {
    key: keyof T
    label: string
    sortable?: boolean
  }[]
  onEdit?: (item: T) => void
  onDelete?: (item: T) => void
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  onEdit,
  onDelete,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const sortedData = [...data].sort((a, b) => {
    if (!sortKey) return 0
    const aVal = a[sortKey]
    const bVal = b[sortKey]
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const handleSort = (key: keyof T) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={String(col.key)}>
              {col.sortable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  <ArrowUpDown className="w-4 h-4 ms-1" />
                </Button>
              ) : (
                col.label
              )}
            </TableHead>
          ))}
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedData.map((item) => (
          <TableRow key={item.id}>
            {columns.map((col) => (
              <TableCell key={String(col.key)}>
                {String(item[col.key])}
              </TableCell>
            ))}
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(item)}>
                      <Edit className="w-4 h-4 me-2" />
                      עריכה
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={() => onDelete(item)}
                      className="text-red-500"
                    >
                      <Trash2 className="w-4 h-4 me-2" />
                      מחיקה
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

---

## Forms

### Form עם React Hook Form + Zod

```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Loader2 } from 'lucide-react'

const schema = z.object({
  name: z.string().min(2, 'שם חייב להכיל לפחות 2 תווים'),
  email: z.string().email('אימייל לא תקין'),
  phone: z.string().regex(/^05\d{8}$/, 'מספר טלפון לא תקין').optional(),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface ClientFormProps {
  defaultValues?: Partial<FormData>
  onSubmit: (data: FormData) => Promise<void>
  isLoading?: boolean
}

export function ClientForm({ defaultValues, onSubmit, isLoading }: ClientFormProps) {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      notes: '',
      ...defaultValues,
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>שם</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>אימייל</FormLabel>
              <FormControl>
                <Input {...field} type="email" dir="ltr" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>טלפון</FormLabel>
              <FormControl>
                <Input {...field} type="tel" dir="ltr" placeholder="05X-XXXXXXX" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>הערות</FormLabel>
              <FormControl>
                <Textarea {...field} rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
          שמירה
        </Button>
      </form>
    </Form>
  )
}
```

---

## Modals & Dialogs

### Dialog עם Form

```tsx
'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { ClientForm } from './client-form'
import { useCreateClient } from '@/hooks/useClients'
import { toast } from 'sonner'

export function CreateClientDialog() {
  const [open, setOpen] = useState(false)
  const createClient = useCreateClient()

  const handleSubmit = async (data: any) => {
    try {
      await createClient.mutateAsync(data)
      toast.success('לקוח נוצר בהצלחה')
      setOpen(false)
    } catch (error) {
      toast.error('שגיאה ביצירת לקוח')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 me-2" />
          לקוח חדש
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>יצירת לקוח חדש</DialogTitle>
        </DialogHeader>
        <ClientForm
          onSubmit={handleSubmit}
          isLoading={createClient.isPending}
        />
      </DialogContent>
    </Dialog>
  )
}
```

### Confirm Dialog

```tsx
'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onConfirm: () => void
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isLoading,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>ביטול</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-red-500 hover:bg-red-600"
          >
            {isLoading ? 'מוחק...' : 'מחיקה'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

---

## Loading States

### Skeleton Components

```tsx
import { Skeleton } from '@/components/ui/skeleton'

// Card Skeleton
export function CardSkeleton() {
  return (
    <div className="p-4 border rounded-lg space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
    </div>
  )
}

// Table Skeleton
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-20" />
        </div>
      ))}
    </div>
  )
}

// Page Skeleton
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-10 w-full max-w-sm" />
      <TableSkeleton />
    </div>
  )
}
```

---

## Error Handling

### Error Boundary

```tsx
'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
        <h2 className="text-xl font-semibold">משהו השתבש</h2>
        <p className="text-muted-foreground">
          אירעה שגיאה בטעינת העמוד
        </p>
        <Button onClick={reset}>
          <RefreshCw className="w-4 h-4 me-2" />
          נסה שוב
        </Button>
      </div>
    </div>
  )
}
```

### Empty State

```tsx
import { Inbox, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 space-y-4">
      <Inbox className="w-12 h-12 text-muted-foreground mx-auto" />
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
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

## Toast Notifications

### Setup עם Sonner

```bash
pnpm add sonner
```

**Layout:**
```tsx
// app/layout.tsx
import { Toaster } from 'sonner'

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          dir="rtl"
        />
      </body>
    </html>
  )
}
```

**שימוש:**
```tsx
import { toast } from 'sonner'

// הצלחה
toast.success('הפעולה בוצעה בהצלחה')

// שגיאה
toast.error('אירעה שגיאה')

// עם פרטים
toast.success('לקוח נוצר', {
  description: 'הלקוח נוסף למערכת בהצלחה',
})

// עם פעולה
toast('האם לשמור?', {
  action: {
    label: 'שמור',
    onClick: () => save(),
  },
})

// Promise
toast.promise(saveData(), {
  loading: 'שומר...',
  success: 'נשמר בהצלחה',
  error: 'שגיאה בשמירה',
})
```

---

## File Upload

### Drag & Drop Upload

```tsx
'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, FileIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileUploadProps {
  onUpload: (files: File[]) => void
  accept?: Record<string, string[]>
  maxFiles?: number
}

export function FileUpload({
  onUpload,
  accept = { 'image/*': ['.png', '.jpg', '.jpeg'] },
  maxFiles = 5,
}: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prev) => [...prev, ...acceptedFiles].slice(0, maxFiles))
  }, [maxFiles])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles,
  })

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpload = () => {
    onUpload(files)
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
        )}
      >
        <input {...getInputProps()} />
        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {isDragActive ? 'שחרר כאן...' : 'גרור קבצים או לחץ לבחירה'}
        </p>
      </div>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, i) => (
            <li key={i} className="flex items-center gap-2 p-2 bg-muted rounded">
              <FileIcon className="w-4 h-4" />
              <span className="flex-1 text-sm truncate">{file.name}</span>
              <button onClick={() => removeFile(i)}>
                <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

---

## Pagination

### קומפוננטת Pagination

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { ChevronRight, ChevronLeft } from 'lucide-react'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
  const visiblePages = pages.filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1
  )

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>

      {visiblePages.map((page, i) => {
        const prevPage = visiblePages[i - 1]
        const showEllipsis = prevPage && page - prevPage > 1

        return (
          <div key={page} className="flex items-center gap-1">
            {showEllipsis && <span className="px-2">...</span>}
            <Button
              variant={page === currentPage ? 'default' : 'outline'}
              size="icon"
              onClick={() => onPageChange(page)}
            >
              {page}
            </Button>
          </div>
        )
      })}

      <Button
        variant="outline"
        size="icon"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>
    </div>
  )
}
```

---

## Tabs & Navigation

### Tabs Component

```tsx
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function ProjectTabs() {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList>
        <TabsTrigger value="overview">סקירה</TabsTrigger>
        <TabsTrigger value="tasks">משימות</TabsTrigger>
        <TabsTrigger value="files">קבצים</TabsTrigger>
        <TabsTrigger value="settings">הגדרות</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6">
        {/* תוכן סקירה */}
      </TabsContent>

      <TabsContent value="tasks" className="mt-6">
        {/* תוכן משימות */}
      </TabsContent>

      <TabsContent value="files" className="mt-6">
        {/* תוכן קבצים */}
      </TabsContent>

      <TabsContent value="settings" className="mt-6">
        {/* תוכן הגדרות */}
      </TabsContent>
    </Tabs>
  )
}
```

---

## סיכום מהיר

| פיצ'ר | ספרייה | פקודת התקנה |
|-------|--------|-------------|
| אייקונים | lucide-react | `pnpm add lucide-react` |
| אייקונים+ | @hugeicons/react | `pnpm add @hugeicons/react` |
| Forms | react-hook-form + zod | `pnpm add react-hook-form @hookform/resolvers zod` |
| State | @tanstack/react-query | `pnpm add @tanstack/react-query` |
| Toast | sonner | `pnpm add sonner` |
| Upload | react-dropzone | `pnpm add react-dropzone` |
| Auth | @supabase/ssr | `pnpm add @supabase/supabase-js @supabase/ssr` |
