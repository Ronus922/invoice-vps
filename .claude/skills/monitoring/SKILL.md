---
name: monitoring
description: Error Monitoring & Alerting - Sentry + Next.js 15, Better Stack, Error Boundaries, production error tracking.
version: 1.0.0
---

# MONITORING.md — Error Monitoring & Alerting

> Sentry, Better Stack, Error Boundaries, Next.js 15 instrumentation — production-ready setup

---

## Table of Contents

1. [Sentry Setup — Next.js 15](#1-sentry-setup--nextjs-15)
2. [Error Boundaries — React](#2-error-boundaries--react)
3. [Better Stack (Logtail)](#3-better-stack-logtail)
4. [Docker & Nginx Log Monitoring](#4-docker--nginx-log-monitoring)
5. [Custom Error Handling Patterns](#5-custom-error-handling-patterns)
6. [Alerts & Notifications](#6-alerts--notifications)
7. [Production vs Development](#7-production-vs-development)

---

## 1. Sentry Setup — Next.js 15

### Install

```bash
npx @sentry/wizard@latest -i nextjs
# OR manual:
npm install @sentry/nextjs
```

### סט הקבצים הנדרשים

```
sentry.client.config.ts    # Browser errors
sentry.server.config.ts    # Server-side errors
sentry.edge.config.ts      # Edge runtime errors
instrumentation.ts         # Next.js 15 instrumentation hook
next.config.ts             # Sentry webpack plugin
```

### sentry.client.config.ts

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session Replay (optional — cost-heavy)
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,

  // Don't send in development
  enabled: process.env.NODE_ENV === "production",

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
```

### sentry.server.config.ts

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enabled: process.env.NODE_ENV === "production",
});
```

### sentry.edge.config.ts

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production",
});
```

### instrumentation.ts (Next.js 15)

```typescript
// app/instrumentation.ts OR src/instrumentation.ts (root level!)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
```

### next.config.ts

```typescript
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ... rest of config
};

export default withSentryConfig(nextConfig, {
  org: "your-org",
  project: "your-project",

  // Upload source maps to Sentry (production only)
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: false,
});
```

### Environment Variables

```env
# Public (client + server)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Server only (for source map upload)
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
SENTRY_AUTH_TOKEN=sntrys_xxx
```

### Manual Error Capture

```typescript
import * as Sentry from "@sentry/nextjs";

// Capture exception
try {
  await riskyOperation();
} catch (error) {
  Sentry.captureException(error, {
    tags: { operation: "payment_process" },
    user: { id: userId },
    extra: { orderId, amount },
  });
  throw error; // Re-throw after capture
}

// Capture message (non-exception)
Sentry.captureMessage("Payment webhook received", {
  level: "info",
  extra: { webhookId },
});

// Set user context
Sentry.setUser({ id: userId, email: userEmail });
```

### app/error.tsx (Next.js error page with Sentry)

```typescript
"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4" dir="rtl">
        <h1 className="text-2xl font-bold">משהו השתבש</h1>
        <p className="text-muted-foreground">אירעה שגיאה בלתי צפויה</p>
        {error.digest && (
          <p className="text-xs text-muted-foreground">קוד שגיאה: {error.digest}</p>
        )}
        <Button onClick={reset}>נסה שוב</Button>
      </div>
    </div>
  );
}
```

---

## 2. Error Boundaries — React

### Component-level Error Boundary

```typescript
"use client";

import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/5" dir="rtl">
            <p className="text-sm text-destructive">לא ניתן להציג רכיב זה כרגע</p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
```

### שימוש

```tsx
// עטוף sections קריטיים
<ErrorBoundary fallback={<ChartFallback />}>
  <ExpensiveChart data={data} />
</ErrorBoundary>

// עם הודעה מותאמת
<ErrorBoundary fallback={
  <div dir="rtl" className="text-center py-8">
    <p>לא ניתן לטעון את לוח הבקרה</p>
    <button onClick={() => window.location.reload()}>רענן</button>
  </div>
}>
  <Dashboard />
</ErrorBoundary>
```

---

## 3. Better Stack (Logtail)

Better Stack = Logtail (logs) + Uptime monitoring.

### Install

```bash
npm install @logtail/next
```

### lib/logger.ts

```typescript
import { Logtail } from "@logtail/node";

const logtail = process.env.LOGTAIL_SOURCE_TOKEN
  ? new Logtail(process.env.LOGTAIL_SOURCE_TOKEN)
  : null;

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "production" && logtail) {
      logtail.info(message, meta);
    } else {
      console.log(`[INFO] ${message}`, meta);
    }
  },

  warn: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "production" && logtail) {
      logtail.warn(message, meta);
    } else {
      console.warn(`[WARN] ${message}`, meta);
    }
  },

  error: (message: string, error?: unknown, meta?: Record<string, unknown>) => {
    const errorData = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { error };

    if (process.env.NODE_ENV === "production" && logtail) {
      logtail.error(message, { ...errorData, ...meta });
    } else {
      console.error(`[ERROR] ${message}`, errorData, meta);
    }
  },
};
```

### שימוש

```typescript
// Server Action
import { logger } from "@/lib/logger";

export async function processPayment(orderId: string) {
  logger.info("Payment processing started", { orderId });
  try {
    const result = await stripe.charges.create({ ... });
    logger.info("Payment succeeded", { orderId, chargeId: result.id });
    return result;
  } catch (error) {
    logger.error("Payment failed", error, { orderId });
    throw error;
  }
}
```

### Environment Variable

```env
LOGTAIL_SOURCE_TOKEN=xxx
```

---

## 4. Docker & Nginx Log Monitoring

### כלים קיימים בKIT

```bash
# server-monitor.sh — מריץ כל 5 דק, בודק:
# - disk usage (alert > 80%)
# - memory (alert > 90%)
# - docker containers (all running?)
# - load average
/home/ubuntu/DevOPS/server-monitor.sh

# הרצה ידנית לבדיקה
bash /home/ubuntu/DevOPS/server-monitor.sh
```

### Docker Logs — Real-time

```bash
# כל הcontainers
docker ps --format "{{.Names}}" | xargs -I{} docker logs {} --tail 20

# Container ספציפי עם follow
docker logs my-app --tail 100 -f

# סינון שגיאות בלבד
docker logs my-app 2>&1 | grep -i "error\|exception\|fatal"
```

### Nginx Logs

```bash
# Access log — בדיקת 5xx
tail -f /var/log/nginx/access.log | grep " 5[0-9][0-9] "

# Error log
tail -f /var/log/nginx/error.log

# סטטיסטיקות status codes
awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn
```

### Log Rotation (קיים בKIT)

```json
// /etc/docker/daemon.json — כבר מוגדר
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

---

## 5. Custom Error Handling Patterns

### Server Action Error Handling

```typescript
"use server";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function updateProfile(
  userId: string,
  data: ProfileUpdate
): Promise<ActionResult<Profile>> {
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .update(data)
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data: profile };
  } catch (error) {
    // Log to Sentry
    Sentry.captureException(error, { extra: { userId, data } });
    // Log to Logtail
    logger.error("Profile update failed", error, { userId });

    return {
      success: false,
      error: "לא ניתן לעדכן את הפרופיל כרגע",
    };
  }
}
```

### Global Error Handler (API Routes)

```typescript
// lib/api-handler.ts
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export function withErrorHandler(
  handler: (req: Request) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (error) {
      Sentry.captureException(error);
      logger.error("API handler error", error);

      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}

// שימוש
export const GET = withErrorHandler(async (req) => {
  // ... handler code
});
```

---

## 6. Alerts & Notifications

### Sentry Alerts

ב-Sentry Dashboard → Alerts → Create Alert:

```
Issue Alert:
- Trigger: New issue created
- Condition: Any environment
- Action: Send email / Slack notification

Performance Alert:
- Trigger: Transaction duration > 3s
- Condition: p95 > 3000ms
- Action: Send email
```

### Better Stack Uptime Monitor

```
# Add monitor in Better Stack dashboard:
URL: https://your-app.com/api/health
Check interval: 1 minute
Alert: Email + SMS after 2 failures
```

### Health Check Endpoint

```typescript
// app/api/health/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // בדיקת DB
    const { error } = await supabase.from("health_check").select("id").limit(1);
    if (error) throw error;

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || "unknown",
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: "Database connection failed" },
      { status: 503 }
    );
  }
}
```

---

## 7. Production vs Development

```typescript
// lib/monitoring.ts — Central monitoring config

export const monitoring = {
  // בprod — Sentry + Logtail
  // בdev — console only
  captureError: (error: unknown, context?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "production") {
      Sentry.captureException(error, { extra: context });
      logger.error("Error captured", error, context);
    } else {
      console.error("[DEV ERROR]", error, context);
    }
  },

  captureInfo: (message: string, context?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "production") {
      logger.info(message, context);
    } else {
      console.log(`[DEV INFO] ${message}`, context);
    }
  },
};
```

### Production Checklist

- [ ] Sentry DSN מוגדר ב-.env של production
- [ ] `NEXT_PUBLIC_SENTRY_DSN` בDocker environment
- [ ] Sentry source maps מוגדרים ב-next.config.ts
- [ ] `instrumentation.ts` בroot הפרויקט (לא בsrc/)
- [ ] app/error.tsx ו-app/global-error.tsx קיימים
- [ ] Health check endpoint פעיל
- [ ] Better Stack Uptime monitor מוגדר
- [ ] Alert rules ב-Sentry פעילות

---

## Related

- `/optimization` — Web Vitals, performance
- `/security` — Security headers, auth
- `DevOPS/server-monitor.sh` — Server-level monitoring
- `DevOPS/alert-setup.sh` — Server alerts setup
