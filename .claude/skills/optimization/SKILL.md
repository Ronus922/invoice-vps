---
name: optimization
description: Performance optimization - Caching strategies, Core Web Vitals, bundle optimization for Next.js 15.
---

# **OPTIMIZATION.md \- Performance Guidelines (Next.js 15 Updated)**

This document defines performance optimization strategies and caching policies for Next.js 15\.

## **1\. Next.js 15 Caching Strategy (CRITICAL CHANGE)**

**Major Change:** In Next.js 15, fetch requests are **NOT cached** (no-store) by default.

You must opt-in to caching.

### **Caching Examples**

**Real-Time Data (Default):**

// Fetches fresh data on every request  
const data \= await fetch('\[https://api.example.com/data\](https://api.example.com/data)');

**Static Data (Force Cache):**

// Cache indefinitely (until rebuild)  
const data \= await fetch('\[https://api.example.com/data\](https://api.example.com/data)', { cache: 'force-cache' });

**ISR (Incremental Static Regeneration):**

// Cache for 1 hour (3600 seconds)  
const data \= await fetch('\[https://api.example.com/data\](https://api.example.com/data)', {  
  next: { revalidate: 3600 }  
});

## **2\. Core Web Vitals Targets**

| Metric | Target | What It Measures |
| :---- | :---- | :---- |
| **LCP** (Largest Contentful Paint) | \< 2.5s | Loading performance |
| **INP** (Interaction to Next Paint) | \< 200ms | Interactivity |
| **CLS** (Cumulative Layout Shift) | \< 0.1 | Visual stability |

## **3\. Bundle Optimization**

### **Tree Shaking**

Always use named imports to allow tree-shaking.

**✅ CORRECT:**

import { Menu, X } from "lucide-react";  
import { format } from "date-fns";

**❌ WRONG:**

import \* as Icons from "lucide-react"; // Imports entire library  
import moment from "moment";           // Heavy, use date-fns

### **Lazy Loading (Client Components)**

Use next/dynamic for heavy client components (Charts, Maps, Modals).

import dynamic from 'next/dynamic';

const HeavyChart \= dynamic(() \=\> import('@/components/HeavyChart'), {  
  loading: () \=\> \<p\>Loading...\</p\>,  
  ssr: false  
});

## **4\. Image Optimization**

See DESIGN.md for layout rules. For performance:

* **Priority**: Use priority prop for LCP element (Hero image).  
* **Sizes**: Always define sizes when using fill.  
* **Format**: Next.js automatically serves WebP/AVIF.

\<Image   
  src="/hero.jpg"   
  alt="Hero"   
  fill   
  priority   
  sizes="100vw"   
  className="object-cover"   
/\>

## **5\. Font Optimization**

Use next/font to prevent Layout Shift (CLS) and optimize loading.

// app/layout.tsx  
import { Rubik, Assistant } from 'next/font/google';

const rubik \= Rubik({  
  subsets: \['hebrew'\],  
  variable: '--font-rubik',  
  display: 'swap',  
});

const assistant \= Assistant({  
  subsets: \['hebrew'\],  
  variable: '--font-assistant',  
  display: 'swap',  
});

export default function RootLayout({ children }) {  
  return (  
    \<html lang="he" className={\`${rubik.variable} ${assistant.variable}\`}\>  
      \<body className="font-assistant"\>{children}\</body\>  
    \</html\>  
  );  
}

## **6\. Third-Party Scripts**

Use next/script with appropriate strategies.

* beforeInteractive: Critical scripts (Polyfills).  
* afterInteractive: Analytics, Chat widgets (Default).  
* lazyOnload: Low priority (Comments, Social feeds).

import Script from 'next/script';

\<Script   
  src="\[https://www.googletagmanager.com/\](https://www.googletagmanager.com/)..."   
  strategy="afterInteractive"   
/\>

## **7\. Performance Checklist**

* \[ \] **Lighthouse Score**: \> 90 on all metrics.  
* \[ \] **Images**: All images use next/image with proper sizes.  
* \[ \] **Fonts**: Using next/font with display: swap.  
* \[ \] **Caching**: API calls explicitly cache static data.  
* \[ \] **Bundle**: No large libraries (moment.js, lodash) in client bundle.  
* \[ \] **CLS**: All fill images have parent container with relative and height.