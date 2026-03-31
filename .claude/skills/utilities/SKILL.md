---
name: utilities
description: CRM utilities - Push notifications, context menus, email notifications, followups, activity log. Auto-adapts to current project stack (Supabase + Next.js 15 by default).
---

# Utilities — מערכות עזר ל-CRM

> **כלל ברזל:** לפני כתיבת קוד — סרוק את `package.json` ואת מבנה הפרויקט.
> התאם את כל הדפוסים למחסנית הנוכחית אוטומטית. אין לשאול.

---

## 🔍 זיהוי מחסנית — תמיד ראשון

```bash
# בדוק מה קיים
cat package.json | grep -E "supabase|prisma|drizzle|mongoose|airtable"
ls src/app/api/ 2>/dev/null || ls pages/api/ 2>/dev/null
ls src/lib/ | grep -E "db|supabase|prisma"
```

| אם קיים | השתמש ב |
|---------|---------|
| `@supabase/supabase-js` | Supabase Client + RLS |
| `prisma` | Prisma ORM |
| `drizzle-orm` | Drizzle ORM |
| `pages/api/` | Next.js Pages Router API |
| `src/app/api/` | Next.js App Router (Route Handlers) |
| `airtable` | Airtable SDK — המר ל-Supabase |
| `*.php` | PHP — המר ל-Next.js API Routes |

**ברירת מחדל:** Supabase + Next.js 15 App Router

---

## 1. Push Notifications

### מבנה טבלה — Supabase

```sql
create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_role   text,
  device_info jsonb,
  created_at  timestamptz default now()
);

-- RLS
alter table push_subscriptions enable row level security;
create policy "users manage own subscriptions"
  on push_subscriptions for all
  using (auth.uid() = user_id);
```

### Frontend — `src/lib/push.ts`

```typescript
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

export async function subscribeToPush(userId: string, userRole?: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription, userId, userRole }),
  });

  return subscription;
}

export async function unsubscribeFromPush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await subscription.unsubscribe();
  await fetch("/api/push/subscribe", { method: "DELETE" });
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
```

### Auto-register on login

```typescript
// src/components/providers/PushProvider.tsx
"use client";
import { useEffect } from "react";
import { useUser } from "@/hooks/useUser";
import { subscribeToPush } from "@/lib/push";

export function PushProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();

  useEffect(() => {
    if (!user) return;
    subscribeToPush(user.id, user.role).catch(() => {});
  }, [user]);

  return <>{children}</>;
}
```

### API Routes — App Router

#### `src/app/api/push/subscribe/route.ts`

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { subscription, userId, userRole } = await req.json();

  await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_role: userRole,
      device_info: { userAgent: req.headers.get("user-agent") },
    },
    { onConflict: "endpoint" }
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("push_subscriptions").delete().eq("user_id", user.id);
  return NextResponse.json({ success: true });
}
```

#### `src/app/api/push/send/route.ts`

```typescript
import { createClient } from "@/lib/supabase/server";
import webpush from "web-push";
import { NextRequest, NextResponse } from "next/server";

webpush.setVapidDetails(
  "mailto:" + process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

interface SendPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  targetUserIds?: string[];
  targetRoles?: string[];
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const payload: SendPayload = await req.json();

  let query = supabase.from("push_subscriptions").select("*");

  if (payload.targetUserIds?.length) {
    query = query.in("user_id", payload.targetUserIds);
  } else if (payload.targetRoles?.length) {
    query = query.in("user_role", payload.targetRoles);
  }

  const { data: subscriptions } = await query;
  if (!subscriptions?.length) return NextResponse.json({ sent: 0 });

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "/favicon/android-chrome-192x192.png",
    data: { url: payload.url ?? "/" },
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        notification
      ).catch(async (err) => {
        // נקה subscriptions פגי תוקף
        if (err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
        throw err;
      })
    )
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ sent, total: subscriptions.length });
}
```

### Service Worker — `public/sw-push.js`

```javascript
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};

  event.waitUntil(
    self.registration.showNotification(data.title ?? "התראה חדשה", {
      body: data.body ?? "",
      icon: data.icon ?? "/favicon/android-chrome-192x192.png",
      badge: "/favicon/android-chrome-192x192.png",
      dir: "rtl",
      lang: "he",
      vibrate: [200, 100, 200],
      requireInteraction: true,
      data: { url: data.data?.url ?? "/" },
      actions: [
        { action: "open", title: "פתח" },
        { action: "close", title: "סגור" },
      ],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "close") return;

  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.navigate(url).then(() => existing.focus());
      return clients.openWindow(url);
    })
  );
});
```

### Environment Variables

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=admin@yourdomain.com
```

> Generate keys: `npx web-push generate-vapid-keys`

---

## 2. Context Menu (Right-Click)

### קומפוננטה — `src/components/ui/RecordContextMenu.tsx`

```typescript
"use client";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Copy, Send, Bell, Trash2 } from "lucide-react";
import { useState } from "react";

export type RecordType = string; // מוגדר לפי הפרויקט

interface RecordContextMenuProps {
  recordId: string;
  recordType: RecordType;
  recordName: string;
  recordPath: string; // e.g. "leads", "tasks", "clients"
  onDelete?: () => Promise<void>;
  children: React.ReactNode;
  showMobileMenu?: boolean;
}

export function RecordContextMenu({
  recordId,
  recordType,
  recordName,
  recordPath,
  onDelete,
  children,
  showMobileMenu = true,
}: RecordContextMenuProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(recordName);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendPush = async (targetUserIds: string[]) => {
    await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `📨 רשומה שותפה איתך`,
        body: recordName,
        targetUserIds,
        url: `/${recordPath}?open=${recordId}`,
      }),
    });
  };

  const handleSetFollowup = async (date: string) => {
    await fetch("/api/followups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId, recordType, recordName, followupTime: date }),
    });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="relative" data-record-context-menu="true">
          {children}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent dir="rtl" className="w-52">
        <ContextMenuItem onClick={handleCopy}>
          <Copy className="ml-2 h-4 w-4" />
          {copied ? "הועתק!" : "העתק שם"}
        </ContextMenuItem>

        <ContextMenuItem onClick={() => handleSendPush([])}>
          <Send className="ml-2 h-4 w-4" />
          שלח למשתמש
        </ContextMenuItem>

        <ContextMenuItem onClick={() => handleSetFollowup(new Date().toISOString())}>
          <Bell className="ml-2 h-4 w-4" />
          הגדר פולואפ
        </ContextMenuItem>

        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={onDelete}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="ml-2 h-4 w-4" />
              מחק
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
```

### חסימת תפריט ברירת מחדל — `src/app/layout.tsx`

```typescript
// בתוך client component
"use client";
import { useEffect } from "react";

export function ContextMenuBlocker() {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-record-context-menu]")) e.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);
  return null;
}
```

### Mobile fallback — 3 נקודות

```typescript
import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

{showMobileMenu && (
  <div className="absolute top-2 start-2 md:hidden">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="p-1.5 bg-white/90 rounded-full shadow-sm border min-w-[44px] min-h-[44px] flex items-center justify-center">
          <MoreVertical className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent dir="rtl">
        {/* אותן פעולות */}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)}
```

---

## 3. Email Notifications (n8n Webhook)

### פונקציה גנרית — `src/lib/notifications.ts`

```typescript
const N8N_WEBHOOK = process.env.N8N_WEBHOOK_URL!; // https://n8n.yourdomain.com/webhook/...

interface EmailNotification {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmailNotification({ to, subject, html }: EmailNotification) {
  const params = new URLSearchParams({ user_email: to, subject, message: html });
  await fetch(`${N8N_WEBHOOK}?${params}`, { method: "GET" }).catch(() => {});
}

export function buildTaskAssignmentEmail({
  assignedUserName,
  assignerName,
  taskName,
  taskId,
  projectName,
  taskDueDate,
  baseUrl,
}: {
  assignedUserName: string;
  assignerName: string;
  taskName: string;
  taskId: string;
  projectName?: string;
  taskDueDate?: string;
  baseUrl: string;
}) {
  return /* html */ `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="direction:rtl;font-family:Arial,sans-serif;color:#1e293b;">
  <h1 style="font-size:20px;">📋 משימה חדשה הוקצתה לך</h1>
  <p>שלום ${assignedUserName},</p>
  <p>${assignerName} הקצה/הקצתה לך משימה חדשה:</p>

  <div style="background:#f1f5f9;border-radius:12px;padding:20px;margin:16px 0;">
    <h2 style="margin:0 0 8px;">${taskName}</h2>
    ${projectName ? `<p style="margin:4px 0;">פרויקט: ${projectName}</p>` : ""}
    ${taskDueDate ? `<p style="margin:4px 0;">תאריך יעד: ${taskDueDate}</p>` : ""}
  </div>

  <a href="${baseUrl}/tasks?open=${taskId}"
     style="display:inline-block;background:#3b82f6;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;">
    צפה במשימה
  </a>

  <p style="font-size:12px;color:#94a3b8;margin-top:24px;">
    זהו מייל אוטומטי. נא לא להשיב.
  </p>
</body>
</html>`;
}
```

### User Notification Preferences — Supabase

```sql
alter table users add column if not exists notification_preferences jsonb default '{
  "email_new_assignment": true,
  "email_mentions": true,
  "email_followup": true,
  "email_daily_summary": false,
  "email_weekly_summary": false,
  "push_enabled": true
}'::jsonb;
```

```typescript
// קריאת העדפות
const { data: user } = await supabase
  .from("users")
  .select("notification_preferences")
  .eq("id", userId)
  .single();

const prefs = user?.notification_preferences ?? {};
if (!prefs.email_new_assignment) return; // לא שולח
```

### API Route — `src/app/api/notifications/email/route.ts`

```typescript
import { sendEmailNotification, buildTaskAssignmentEmail } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json();

  const { data: user } = await supabase
    .from("users")
    .select("email, name, notification_preferences")
    .eq("id", body.assignedUserId)
    .single();

  if (!user?.notification_preferences?.email_new_assignment) {
    return NextResponse.json({ skipped: true });
  }

  await sendEmailNotification({
    to: user.email,
    subject: `📋 משימה חדשה: ${body.taskName}`,
    html: buildTaskAssignmentEmail({
      assignedUserName: user.name,
      assignerName: body.assignerName,
      taskName: body.taskName,
      taskId: body.taskId,
      projectName: body.projectName,
      taskDueDate: body.taskDueDate,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL!,
    }),
  });

  return NextResponse.json({ sent: true });
}
```

---

## 4. Followups

### Supabase Schema

```sql
create table followups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  record_type text not null,
  record_id   text not null,
  record_name text not null,
  followup_time timestamptz not null,
  status      text default 'pending' check (status in ('pending','completed','cancelled')),
  created_at  timestamptz default now()
);

create index on followups (user_id, status, followup_time);

alter table followups enable row level security;
create policy "users manage own followups"
  on followups for all using (auth.uid() = user_id);
```

### API Route — `src/app/api/followups/route.ts`

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("followups")
    .select("*")
    .eq("user_id", user!.id)
    .eq("status", "pending")
    .order("followup_time");

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const body = await req.json();

  const { data } = await supabase.from("followups").insert({
    user_id: user!.id,
    record_type: body.recordType,
    record_id: body.recordId,
    record_name: body.recordName,
    followup_time: body.followupTime,
  }).select().single();

  // שלח push reminder בזמן הפולואפ — דרך n8n/cron
  await fetch("/api/push/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      followupId: data?.id,
      userId: user!.id,
      scheduledTime: body.followupTime,
    }),
  }).catch(() => {});

  return NextResponse.json(data);
}
```

### React Query Hook

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useFollowups() {
  return useQuery({
    queryKey: ["followups"],
    queryFn: () => fetch("/api/followups").then((r) => r.json()),
  });
}

export function useCreateFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      recordId: string;
      recordType: string;
      recordName: string;
      followupTime: string;
    }) =>
      fetch("/api/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["followups"] }),
  });
}
```

---

## 5. Activity Log

### Supabase Schema

```sql
create table activity_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id),
  user_name   text,
  action      text not null check (action in ('create','update','delete')),
  record_type text not null,
  record_id   text not null,
  record_name text,
  changes     jsonb, -- [{field, oldValue, newValue}]
  created_at  timestamptz default now()
);

create index on activity_log (record_type, record_id);
create index on activity_log (created_at desc);

-- קריאה: רק מנהלים (דרך RLS)
alter table activity_log enable row level security;
create policy "admins read all logs"
  on activity_log for select
  using (
    exists (
      select 1 from users
      where id = auth.uid() and role in ('admin','manager')
    )
  );

-- כתיבה: כל משתמש מאומת
create policy "authenticated can insert"
  on activity_log for insert with check (auth.uid() is not null);
```

### פונקציה — `src/lib/activity.ts`

```typescript
import { createClient } from "@/lib/supabase/client";

interface LogEntry {
  action: "create" | "update" | "delete";
  recordType: string;
  recordId: string;
  recordName?: string;
  changes?: Array<{ field: string; oldValue: string; newValue: string }>;
}

export async function logActivity(entry: LogEntry) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from("activity_log").insert({
    user_id: user?.id,
    user_name: user?.user_metadata?.name ?? user?.email,
    ...entry,
    changes: entry.changes ? entry.changes : null,
  });
}
```

### שימוש

```typescript
// אחרי יצירה
await supabase.from("leads").insert(data);
await logActivity({ action: "create", recordType: "lead", recordId: id, recordName: data.name });

// אחרי עדכון
await supabase.from("tasks").update(patch).eq("id", id);
await logActivity({
  action: "update",
  recordType: "task",
  recordId: id,
  recordName: task.name,
  changes: [{ field: "סטטוס", oldValue: "פתוח", newValue: "בטיפול" }],
});

// אחרי מחיקה
await supabase.from("clients").delete().eq("id", id);
await logActivity({ action: "delete", recordType: "client", recordId: id, recordName: client.name });
```

### קומפוננטה — Activity Feed

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const ACTION_COLORS = {
  create: "text-green-600",
  update: "text-blue-600",
  delete: "text-red-600",
};

const ACTION_LABELS = {
  create: "נוצר",
  update: "עודכן",
  delete: "נמחק",
};

export function ActivityFeed({ recordType, recordId }: { recordType?: string; recordId?: string }) {
  const { data: logs } = useQuery({
    queryKey: ["activity", recordType, recordId],
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(50);
      if (recordType) q = q.eq("record_type", recordType);
      if (recordId) q = q.eq("record_id", recordId);
      const { data } = await q;
      return data ?? [];
    },
  });

  return (
    <div className="flex flex-col gap-2" dir="rtl">
      {logs?.map((log) => (
        <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
          <span className={`font-medium text-sm ${ACTION_COLORS[log.action as keyof typeof ACTION_COLORS]}`}>
            {ACTION_LABELS[log.action as keyof typeof ACTION_LABELS]}
          </span>
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium">{log.record_name}</span>
            <span className="text-gray-500 text-xs">
              {log.user_name} · {new Date(log.created_at).toLocaleString("he-IL")}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 🔄 זרם אירועים

```
User Action (UI)
       │
  ┌────┼────────────┐
  │    │            │
  ▼    ▼            ▼
DB   logActivity  Push/Email
(Supabase)  (activity_log)  (API Routes)
                        │
                   ┌────┴────┐
                   │         │
                   ▼         ▼
              Push API    n8n Webhook
           (web-push)    (email)
```

---

## ✅ Checklist

### Supabase Tables
- [ ] `push_subscriptions` נוצרה + RLS
- [ ] `followups` נוצרה + RLS
- [ ] `activity_log` נוצרה + RLS
- [ ] `notification_preferences` נוסף ל-`users`

### Environment Variables
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- [ ] `VAPID_PRIVATE_KEY`
- [ ] `VAPID_EMAIL`
- [ ] `N8N_WEBHOOK_URL`
- [ ] `NEXT_PUBLIC_APP_URL`

### Service Worker
- [ ] `public/sw-push.js` נוצר
- [ ] רישום SW ב-`layout.tsx` / `app.tsx`

### API Routes
- [ ] `/api/push/subscribe` — POST/DELETE
- [ ] `/api/push/send` — POST
- [ ] `/api/followups` — GET/POST
- [ ] `/api/notifications/email` — POST

### Frontend
- [ ] `PushProvider` עוטף את האפליקציה
- [ ] `RecordContextMenu` מוגדר עם `recordPath` נכון
- [ ] `ContextMenuBlocker` ב-layout
- [ ] `ActivityFeed` מחובר ל-Supabase

### Dependencies
```bash
npm i web-push @types/web-push
npm i @tanstack/react-query  # אם לא קיים
```
