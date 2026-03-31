---
name: security
description: Security guidelines - Authentication, RLS policies, input validation, OWASP best practices for Next.js 15.
---

# **SECURITY.md \- Comprehensive Security Guidelines (Next.js 15 Updated)**

**Version:** 1.1.0

**Stack:** Next.js 15 \+ React 19 \+ TypeScript 5

**Update:** Adjusted for Next.js 15 Async Params & Headers

## **Table of Contents**

1. [Next.js 15 Critical Updates](https://www.google.com/search?q=%23nextjs-15-critical-updates)  
2. [Security Philosophy](https://www.google.com/search?q=%23security-philosophy)  
3. [Authentication](https://www.google.com/search?q=%23authentication)  
4. [Authorization](https://www.google.com/search?q=%23authorization)  
5. [Input Validation](https://www.google.com/search?q=%23input-validation)  
6. [XSS Prevention](https://www.google.com/search?q=%23xss-prevention)  
7. [CSRF Protection](https://www.google.com/search?q=%23csrf-protection)  
8. [Security Headers](https://www.google.com/search?q=%23security-headers)  
9. [API Security](https://www.google.com/search?q=%23api-security)  
10. [File Upload Security](https://www.google.com/search?q=%23file-upload-security)

## **Next.js 15 Critical Updates**

In Next.js 15, params, searchParams, headers(), and cookies() are **asynchronous**.

Accessing them synchronously will cause errors.

### **API Routes (Route Handlers)**

**❌ WRONG (Old Way):**

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {  
  const id \= params.id; // Error in Next.js 15  
}

**✅ CORRECT (Next.js 15):**

export async function GET(request: NextRequest, { params }: { params: Promise\<{ id: string }\> }) {  
  const { id } \= await params; // Must await\!  
}

### **Server Components**

import { headers, cookies } from 'next/headers';

export default async function Page() {  
  const headerList \= await headers(); // Must await\!  
  const cookieStore \= await cookies(); // Must await\!  
}

## **Security Philosophy**

1. **Never Trust User Input** \- Validate and sanitize ALL inputs.  
2. **Principle of Least Privilege** \- Minimal permissions needed.  
3. **Fail Securely** \- Errors should default to deny.  
4. **Secure by Default** \- Security shouldn't be opt-in.

## **Authentication**

### **Server-Side Validation (Supabase)**

Always validate session on the server for protected actions.

import { createClient } from '@/lib/supabase/server';

export async function getUser() {  
  const supabase \= await createClient();  
  const { data: { user }, error } \= await supabase.auth.getUser();

  if (error || \!user) return null;  
  return user;  
}

## **Authorization**

### **Role-Based Access Control (RBAC)**

Do not rely on client-side checks. Verify roles in API routes or Server Actions.

export async function requireRole(allowedRoles: string\[\]) {  
  const user \= await getUser();  
  if (\!user) throw new Error("Unauthorized");  
    
  // Fetch role from DB/Metadata  
  const role \= user.user\_metadata.role;   
    
  if (\!allowedRoles.includes(role)) {  
    throw new Error("Forbidden");  
  }  
}

## **Input Validation (Zod)**

Never process data without Zod validation.

import { z } from 'zod';

// Israeli phone number schema  
const phoneSchema \= z.string().regex(/^05\\d{8}$/, "מספר לא תקין");

export async function POST(req: Request) {  
  const body \= await req.json();  
  const schema \= z.object({  
    phone: phoneSchema,  
    email: z.string().email().optional(),  
  });

  const result \= schema.safeParse(body);  
  if (\!result.success) {  
    return Response.json({ error: result.error }, { status: 400 });  
  }  
    
  // Proceed...  
}

## **XSS Prevention**

### **Safe HTML Rendering**

When using dangerouslySetInnerHTML, always sanitize first.

import DOMPurify from "isomorphic-dompurify";

export function sanitizeHtml(dirty: string): string {  
  return DOMPurify.sanitize(dirty, {  
    ALLOWED\_TAGS: \["b", "i", "em", "strong", "a", "p", "br"\],  
    ALLOWED\_ATTR: \["href", "title", "target"\],  
  });  
}

## **CSRF Protection**

### **Server Actions**

Next.js Server Actions have built-in CSRF protection (origin check).

### **API Route CSRF**

For strict APIs, verify Origin header in Middleware.

// middleware.ts  
const origin \= request.headers.get("origin");  
const host \= request.headers.get("host");  
// Verify origin matches host if method is POST/PUT/DELETE

## **Security Headers**

Ensure middleware.ts sets these headers:

const cspHeader \= \`  
    default-src 'self';  
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https:;  
    style-src 'self' 'unsafe-inline';  
    img-src 'self' blob: data: https:;  
    font-src 'self';  
    object-src 'none';  
    base-uri 'self';  
    form-action 'self';  
    frame-ancestors 'none';  
    upgrade-insecure-requests;  
\`;

response.headers.set('Content-Security-Policy', cspHeader.replace(/\\n/g, ''));  
response.headers.set('X-Frame-Options', 'DENY');  
response.headers.set('X-Content-Type-Options', 'nosniff');

## **File Upload Security**

1. **Validate Type**: Check magic bytes, not just extension.  
2. **Limit Size**: Max 5MB usually.  
3. **Randomize Filename**: Never use user-provided filenames.

const ALLOWED\_TYPES \= \["image/jpeg", "image/png", "application/pdf"\];

if (\!ALLOWED\_TYPES.includes(file.type)) {  
  return Response.json({ error: "Invalid type" }, { status: 400 });  
}

## **Security Checklist**

* \[ \] **Auth**: Server-side session validation enabled.  
* \[ \] **RLS**: Row Level Security enabled on ALL Supabase tables.  
* \[ \] **Validation**: All API inputs validated with Zod.  
* \[ \] **Headers**: Security headers (CSP, HSTS) active.  
* \[ \] **Secrets**: No secrets in client-side code (NEXT\_PUBLIC\_).