---
name: supabase-oauth-nextjs
description: Next.js 15 + Supabase OAuth Integration - PKCE flow, cookies, and auth state management. Lessons from production debugging.
version: 1.0.0
author: Claude + Lior (PYE9 Project)
---

# Supabase OAuth with Next.js 15 - Complete Guide

**Stack:** Next.js 15.2 + @supabase/ssr + React 19 + Docker

**Based on:** Real production debugging session implementing Google OAuth for PYE9 project.

---

## Table of Contents

1. [Critical Lessons Learned](#critical-lessons-learned)
2. [The Journey - What Went Wrong](#the-journey---what-went-wrong)
3. [The Solution - What Works](#the-solution---what-works)
4. [Architecture Overview](#architecture-overview)
5. [Implementation Guide](#implementation-guide)
6. [Common Pitfalls](#common-pitfalls)
7. [Debugging Checklist](#debugging-checklist)

---

## Critical Lessons Learned

### ✅ DO THIS

1. **Use Default Supabase Storage**
   - `@supabase/ssr` has battle-tested browser storage
   - NO custom cookie handlers needed for browser client
   - Let Supabase handle cookie reading/writing automatically

2. **Force httpOnly: false in Callback**
   - Server-side callback route MUST set `httpOnly: false` explicitly
   - Overrides any defaults to ensure JavaScript can read cookies

3. **Use onAuthStateChange for UI Updates**
   - Don't wait for `getSession()` to resolve
   - Update `authUser` directly from listener's session parameter
   - Listener fires immediately when session exists

4. **Nginx Buffer Size for OAuth**
   - OAuth responses have large headers (chunked session cookies)
   - Set `proxy_buffer_size 16k` minimum
   - Also set `proxy_buffers 8 16k` and `proxy_busy_buffers_size 32k`

5. **Add X-Forwarded-Host Header**
   - Nginx must send `X-Forwarded-Host: $host`
   - Callback route needs this to resolve origin correctly in Docker

### ❌ DON'T DO THIS

1. **Custom Cookie Handlers on Browser Client**
   - Causes PKCE code_verifier to not be stored/sent
   - Breaks the OAuth flow completely
   - Supabase default storage "just works"

2. **Custom cookieOptions Name**
   - Don't override the default `sb-{project-ref}-auth-token` naming
   - Custom names break cookie chunking and PKCE flow

3. **Manual localStorage Management**
   - Don't manually store tokens in localStorage as "backup"
   - Supabase handles storage - trust the library

4. **Wait for getSession() to Resolve**
   - In production, `getSession()` can hang (unknown why)
   - Use `onAuthStateChange` listener instead for immediate UI updates

5. **Skip Nginx Buffer Configuration**
   - Default 4KB buffer is TOO SMALL for OAuth responses
   - Causes 502 Bad Gateway errors

---

## The Journey - What Went Wrong

### Problem 1: 502 Bad Gateway on Callback

**Symptom:**
```
GET /auth/callback?code=xxx → 502 Bad Gateway
```

**Root Cause:**
Nginx's default `proxy_buffer_size` (4KB) couldn't hold OAuth response headers.

Supabase returns:
- HTTP status line
- Location header (redirect)
- Multiple `Set-Cookie` headers (session chunks: .0, .1, code-verifier)
- Security headers
- **Total > 4KB** → Nginx fails

**Solution:**
```nginx
location / {
  proxy_buffer_size 16k;
  proxy_buffers 8 16k;
  proxy_busy_buffers_size 32k;
  proxy_set_header X-Forwarded-Host $host;  # Also critical!
  # ... rest of config
}
```

---

### Problem 2: PKCE Code Verifier Not Found

**Symptom:**
```
exchangeCodeForSession ERROR {
  message: 'PKCE code verifier not found in storage...'
}
```

**Root Cause:**
Custom cookie handlers in browser client prevented Supabase from storing the code_verifier cookie.

**What We Did Wrong:**
```typescript
// ❌ WRONG - Custom handlers break PKCE
return createSSRBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
  cookieOptions: {
    name: "pye9-sb-auth",  // Custom name breaks chunking
  },
  cookies: {
    getAll() { /* custom logic */ },
    setAll(cookiesToSet) { /* custom logic */ },
  },
});
```

**What Works:**
```typescript
// ✅ CORRECT - Default storage handles everything
return createSSRBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
```

---

### Problem 3: Cookies Not Readable by JavaScript

**Symptom:**
- Callback succeeds, sets cookies
- Browser receives cookies
- `document.cookie` shows 0 auth cookies

**Root Cause:**
Cookies were set with `httpOnly: true` (default in some contexts).

**Solution:**
```typescript
// In callback route.ts
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, {
      ...options,
      httpOnly: false,  // Force this!
    });
  });
}
```

---

### Problem 4: getSession() Hangs Indefinitely

**Symptom:**
```typescript
const { data: { session } } = await supabase.auth.getSession();
// Never resolves, no error thrown
```

**Root Cause:**
Unknown - possibly a bug in `@supabase/ssr` default storage or network issue.

**Solution:**
Use `onAuthStateChange` listener to get session directly:

```typescript
supabase.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    setAuthUser(session.user);  // Immediate UI update
  }
});
```

---

### Problem 5: Origin Resolution in Docker

**Symptom:**
Callback redirects to `http://0.0.0.0:3000/` instead of `https://pye9.ai2u.pro/`.

**Root Cause:**
Inside Docker, `request.url` resolves to internal address.

**Solution:**
```typescript
function getOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const host = request.headers.get("host");
  if (host) {
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}
```

---

## The Solution - What Works

### File Structure

```
src/
├── lib/
│   └── supabase/
│       ├── client.ts          # Browser client (default storage)
│       ├── server.ts          # Server client (service role)
│       ├── middleware.ts      # Session refresh helper
│       └── types.ts           # Database types
├── app/
│   └── auth/
│       └── callback/
│           └── route.ts       # OAuth callback handler
├── providers/
│   └── student-session-provider.tsx  # Auth state + DB linking
└── middleware.ts              # Route protection + session refresh
```

---

## Architecture Overview

### OAuth Flow (PKCE)

```
1. User clicks "Sign in with Google"
   ↓
2. Browser client calls signInWithOAuth()
   → Stores code_verifier in cookie (sb-xxx-auth-token-code-verifier)
   → Redirects to Google
   ↓
3. Google authenticates user
   → Redirects back to /auth/callback?code=xxx
   ↓
4. Callback route (server-side)
   → Reads code_verifier from request cookies
   → Calls exchangeCodeForSession(code)
   → Sets session cookies (chunked: .0, .1)
   → Redirects to / with Set-Cookie headers
   ↓
5. Browser receives redirect + cookies
   → Cookies stored by browser
   → Page loads at /
   ↓
6. Client-side provider initializes
   → onAuthStateChange fires with SIGNED_IN + session
   → Updates authUser state
   → UI shows logged-in state
```

### Cookie Flow

```
Client → Server (callback):
  Cookie: sb-xxx-auth-token-code-verifier=abc123

Server → Client (callback response):
  Set-Cookie: sb-xxx-auth-token.0=chunk1; path=/; httpOnly=false
  Set-Cookie: sb-xxx-auth-token.1=chunk2; path=/; httpOnly=false
  Set-Cookie: sb-xxx-auth-token-code-verifier=; max-age=0  (delete)
  Location: https://pye9.ai2u.pro/

Browser stores cookies → Available to JavaScript via document.cookie
```

---

## Implementation Guide

### 1. Install Dependencies

```bash
npm install @supabase/ssr @supabase/supabase-js
```

### 2. Browser Client (src/lib/supabase/client.ts)

```typescript
import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  // ✅ No custom handlers - use defaults
  return createSSRBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
```

### 3. Server Client (src/lib/supabase/server.ts)

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}
```

### 4. Middleware Helper (src/lib/supabase/middleware.ts)

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSupabaseSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  await supabase.auth.getUser();
  return supabaseResponse;
}
```

### 5. Middleware (src/middleware.ts)

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ✅ CRITICAL: Skip middleware for OAuth callback
  if (pathname.startsWith("/auth/callback")) {
    return NextResponse.next();
  }

  // Refresh Supabase session
  const supabaseResponse = await updateSupabaseSession(request);

  // Your custom auth logic here...

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|fonts|sw.js|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
```

### 6. OAuth Callback Route (src/app/auth/callback/route.ts)

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function getOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const host = request.headers.get("host");
  if (host) {
    const proto = host.includes("localhost") ? "http" : "https";
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const origin = getOrigin(request);

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/";

    if (!code) {
      return NextResponse.redirect(`${origin}/`);
    }

    const response = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              // ✅ CRITICAL: Force httpOnly: false
              response.cookies.set(name, value, {
                ...options,
                httpOnly: false,
              });
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("OAuth callback error:", error);
      return NextResponse.redirect(`${origin}/`);
    }

    return response;
  } catch (error) {
    console.error("OAuth callback exception:", error);
    return NextResponse.redirect(`${origin}/`);
  }
}
```

### 7. Session Provider (src/providers/student-session-provider.tsx)

```typescript
"use client";

import * as React from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase/client";

export function StudentSessionProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const isAuthenticated = authUser !== null;

  // ✅ Use onAuthStateChange for immediate UI updates
  React.useEffect(() => {
    const supabase = createBrowserClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Update authUser directly from listener
      if (session?.user) {
        setAuthUser(session.user);
      } else if (event === "SIGNED_OUT") {
        setAuthUser(null);
      }

      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sign in with Google
  const signInWithGoogle = React.useCallback(async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }, []);

  // Sign out
  const signOut = React.useCallback(async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
  }, []);

  const value = React.useMemo(
    () => ({
      authUser,
      isAuthenticated,
      isLoading,
      signInWithGoogle,
      signOut,
    }),
    [authUser, isAuthenticated, isLoading, signInWithGoogle, signOut]
  );

  return (
    <StudentSessionContext.Provider value={value}>
      {children}
    </StudentSessionContext.Provider>
  );
}
```

### 8. Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Main proxy
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # ✅ CRITICAL: Large buffers for OAuth responses
        proxy_buffer_size 16k;
        proxy_buffers 8 16k;
        proxy_busy_buffers_size 32k;

        # Headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;  # ✅ CRITICAL for Docker

        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}
```

---

## Common Pitfalls

### Pitfall 1: Mixing Old and New Supabase Patterns

**Wrong:**
```typescript
// Using deprecated @supabase/auth-helpers
import { createClient } from "@supabase/auth-helpers-nextjs";
```

**Correct:**
```typescript
// Use @supabase/ssr for Next.js 13+
import { createBrowserClient } from "@supabase/ssr";
```

---

### Pitfall 2: Not Awaiting Next.js 15 Async APIs

**Wrong:**
```typescript
export async function GET(req: NextRequest, { params }) {
  const id = params.id; // Error in Next.js 15!
}
```

**Correct:**
```typescript
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // Must await
}
```

---

### Pitfall 3: Testing OAuth Without SSL

OAuth providers require HTTPS for redirects. In local dev:

```bash
# Use ngrok or similar for HTTPS tunnel
ngrok http 3000

# Update Supabase redirect URL to ngrok URL
# https://abc123.ngrok.io/auth/callback
```

---

### Pitfall 4: Not Handling PKCE Cookie Domain

If your app is on a subdomain:

```typescript
// Callback route - ensure cookies work across subdomains
response.cookies.set(name, value, {
  ...options,
  httpOnly: false,
  domain: ".yourdomain.com",  // Leading dot for subdomains
});
```

---

## Debugging Checklist

When OAuth fails, check in this order:

### 1. Nginx Logs
```bash
tail -f /var/log/nginx/error.log
```
- Look for 502 errors → buffer size issue
- Look for upstream timeouts → backend dead

### 2. Docker Logs
```bash
docker logs your-container --tail 100
```
- Look for "PKCE code verifier not found" → cookie issue
- Look for "exchangeCodeForSession ERROR" → Supabase config issue

### 3. Browser DevTools
- **Network tab**: Check `/auth/callback` response
  - Should be 307 redirect
  - Should have `Set-Cookie` headers
- **Application tab → Cookies**: Check for `sb-*-auth-token.*` cookies
  - Should have .0 and .1 chunks
  - Should NOT be httpOnly (should show value)
- **Console**: Check for `onAuthStateChange` events
  - Should fire `SIGNED_IN` event
  - Should provide session with user

### 4. Supabase Dashboard
- Go to Authentication → Providers → Google
- Check redirect URL matches your callback route exactly
- Check Client ID and Secret are correct

### 5. Test Cookies Manually
```javascript
// In browser console after OAuth
document.cookie
// Should show: sb-xxx-auth-token.0=...; sb-xxx-auth-token.1=...
```

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...

# Optional: Service role key for admin operations
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
```

---

## Security Considerations

1. **Never use service role key on client**
   - Only in Server Components or API routes

2. **Always validate session on server**
   - Don't trust client-side auth state for sensitive operations

3. **Use Row Level Security (RLS)**
   - Even with auth, enable RLS on all Supabase tables

4. **httpOnly: false is safe for OAuth**
   - Session tokens need to be readable by JavaScript
   - Supabase handles token refresh and expiry
   - Use HTTPS to prevent token interception

---

## Related Resources

- [Supabase SSR Docs](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Next.js 15 Release Notes](https://nextjs.org/blog/next-15)
- [PKCE Flow Explained](https://oauth.net/2/pkce/)

---

## Production-Ready Provider (Complete Version)

The simplified provider above shows the **core pattern**. For production with **dual auth/anonymous flow + student linking**, see the complete implementation:

**Key additions in production:**
1. `initializeSession()` function that handles both authenticated and anonymous users
2. Account linking: anonymous localStorage students → Google auth users
3. Database integration: student records linked to `auth_user_id`
4. Debug logging for troubleshooting
5. Calls `initializeSession()` on SIGNED_IN/SIGNED_OUT to sync DB

**Complete code:**
```typescript
// The onAuthStateChange listener in production:
supabase.auth.onAuthStateChange(async (event, session) => {
  // eslint-disable-next-line no-console
  console.log("[SessionProvider] onAuthStateChange:", {
    event,
    hasSession: !!session,
    userId: session?.user?.id
  });

  // Update authUser directly from session (immediate UI update)
  if (session?.user) {
    setAuthUser(session.user);
  } else if (event === "SIGNED_OUT") {
    setAuthUser(null);
  }

  // Sync with database on auth state changes
  if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
    setIsLoading(true);
    await initializeSession();  // Links anonymous → auth, updates DB
  }
});
```

**Reference:** See `src/providers/student-session-provider.tsx` in PYE9 repo for full implementation with:
- Anonymous session creation/linking
- Student table queries with `auth_user_id`
- Error handling with logging
- Complete TypeScript types

---

## Version History

- **1.0.0** (2026-02-15): Initial version based on PYE9 production debugging

---

## Credits

Created during the implementation of Google OAuth for **PYE9** (AI-powered English practice for Israeli 9th graders).

Debugged and documented by Claude + Lior over a 3+ hour session.

**Real production code** with dual auth/anonymous flow at: `/var/www/pye9/src/providers/student-session-provider.tsx`
