---
name: api
description: Backend & API development guidelines for Next.js 15 - Route handlers, Server Actions, Supabase integration, authentication patterns.
---

# **API.md \- API Development Guidelines (Next.js 15 Updated)**

**Version:** 1.1.0

**Stack:** Next.js 15 \+ React 19 \+ TypeScript 5

**Update:** Adjusted for Next.js 15 Async Params

## **1\. Next.js 15 API Routes (Route Handlers)**

**MAJOR CHANGE:** Dynamic route parameters (params) are now asynchronous.

### **Basic GET Request**

// app/api/leads/route.ts  
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {  
  const searchParams \= request.nextUrl.searchParams;  
  const page \= searchParams.get("page") || "1";

  // ... fetch logic  
  return NextResponse.json({ success: true, data: \[\] });  
}

### **Dynamic Parameters (CRITICAL UPDATE)**

**You must await params in Next.js 15\.**

// app/api/leads/\[id\]/route.ts  
export async function GET(  
  request: NextRequest,   
  { params }: { params: Promise\<{ id: string }\> } // Type is Promise  
) {  
  const { id } \= await params; // Must await\!  
    
  // ... fetch lead by id  
  return NextResponse.json({ success: true, id });  
}

## **2\. Standard Response Format**

Always return JSON with a consistent shape.

type ApiResponse\<T\> \= {  
  success: boolean;  
  data?: T;  
  error?: string;  
  meta?: any;  
}

// Success  
return NextResponse.json({ success: true, data: user });

// Error  
return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

## **3\. Validation with Zod**

Every API route must validate input.

import { z } from "zod";

const schema \= z.object({  
  email: z.string().email(),  
  role: z.enum(\["user", "admin"\]),  
});

export async function POST(req: NextRequest) {  
  const body \= await req.json();  
  const result \= schema.safeParse(body);

  if (\!result.success) {  
    return NextResponse.json(  
      { success: false, error: "Validation failed", details: result.error },   
      { status: 400 }  
    );  
  }  
    
  // Proceed...  
}

## **4\. Error Handling**

Use a consistent error handling pattern.

try {  
  // Logic...  
} catch (error) {  
  console.error("API Error:", error);  
  return NextResponse.json(  
    { success: false, error: "Internal Server Error" },  
    { status: 500 }  
  );  
}

## **5\. Rate Limiting**

Implement basic rate limiting for public endpoints (Auth, Forms).

// lib/rate-limit.ts (simplified)  
const rateLimit \= new Map();

export function checkLimit(ip: string) {  
  const count \= rateLimit.get(ip) || 0;  
  if (count \> 100\) return false;  
  rateLimit.set(ip, count \+ 1);  
  return true;  
}

## **6\. Webhooks**

When receiving webhooks (e.g., from Stripe/Payment providers), verify signature.

export async function POST(req: NextRequest) {  
  const signature \= req.headers.get("x-signature");  
  // Verify signature before processing...  
}

## **7\. API Checklist**

* \[ \] **Async Params**: Updated all \[id\] routes to use await params.  
* \[ \] **Validation**: Zod schema for every POST/PUT body.  
* \[ \] **Auth**: Checked session for protected routes.  
* \[ \] **Response**: Consistent { success: boolean } format.  
* \[ \] **Error Handling**: Wrapped in try/catch.