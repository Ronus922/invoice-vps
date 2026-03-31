---
name: fullstack-il
description: Israeli Fullstack Guidelines - Next.js 15, Tailwind v4, RTL, Hebrew. Use for any web development task.
---

# Fullstack IL - Hebrew Web Development Guidelines

## כיצד להשתמש

Skill זה מכיל הנחיות לפיתוח web בעברית. קרא את הקבצים הרלוונטיים לפי הצורך:

## קבצים זמינים

| קובץ | תוכן |
|------|------|
| **DESIGN.md** | מערכת עיצוב - Spacing, Typography, Colors, RTL, Palettes |
| **CHARTS.md** | גרפים - recharts patterns, RTL dashboards |
| **COMPONENTS.md** | קומפוננטות מורכבות - Toasts, Pagination, Alerts |
| **API.md** | Backend - Server Actions, Supabase, Validation |
| **SECURITY.md** | אבטחה - Auth, RLS, Headers |
| **MOBILE.md** | Expo & React Native |
| **CONTENT.md** | כתיבת תוכן בעברית |
| **WORKFLOWS.md** | n8n אוטומציות |
| **OPTIMIZATION.md** | ביצועים - Web Vitals, Caching |
| **FEATURES.md** | פיצ'רים נפוצים |
| **DEVTOOLS.md** | כלי פיתוח |
| **SUPABASE-AUTH.md** | אימות - Google OAuth, PKCE, 502 Fix, NGINX/Docker (30KB) |
| **SUPABASE-OAUTH-NEXTJS.md** | OAuth PKCE עם route.ts + cookies + Docker/Nginx — מ-PYE9 production |
| **SUPABASE-POSTGRES.md** | אופטימיזציה - Indexes, RLS, Pooling, Queries (20KB) |
| **MIGRATIONS.md** | מיגרציות DB — Supabase CLI, rolling migrations, rollback |
| **MONITORING.md** | ניטור שגיאות — Sentry, Better Stack, Error Boundaries |
| **COST-OPTIMIZATION.md** | עלויות Claude API — model selection, caching, token budget |
| **UI-UX-PRO-MAX.md** | שכבת UI/UX מתקדמת להחלטות עיצוב מורכבות (Auto + Manual) |
| **PRD.md** | יצירת PRD - User Stories, prd.json, אינטגרציה עם Ralph ו-GSD |

## 🌐 Website Cloning

| Skill | תוכן |
|-------|------|
| **/clone-website** | שכפול אתר מ-URL — Chrome MCP + parallel agents + pixel-perfect Next.js clone |

> **דרישה:** `claude --chrome` | **pipeline:** Recon → Foundation → Specs → Parallel Build → QA

## 🤖 Dual-Mode Orchestration (Ruflo)

| Skill | תוכן |
|-------|------|
| **/ruflo** | Dual-Mode Integration — Claude Code (🔵) + Codex (🟢) + Swarm + Shared Memory |

> **Setup:** `npx ruflo@latest init --wizard` → `claude mcp add claude-flow npx claude-flow@v3alpha mcp start`
> **Dual session:** `npx claude-flow-codex dual run --namespace collaboration`

---

## ⚡ Quick Reference (Skills נפרדים)

| Skill | תוכן |
|-------|------|
| **/animations** | **סקייל זמנים** - טבלת durations, stagger, easing. גישה מהירה! |
| **/ui-ux-pro-max** | **UI/UX מתקדם** - הפעלה אוטומטית לפי צורך במשימות מורכבות + הפעלה ידנית |
| **fullstack-il/ANIMATIONS.md** | מדריך מלא - GSAP, ScrollTrigger, Framer Motion, Lenis (58KB) |
| **/supabase-auth** | **Supabase מלא** - OAuth + Postgres. Auth flow, 502 fix, indexes, RLS |
| **fullstack-il/SUPABASE-AUTH.md** | מדריך Auth מפורט - PKCE, NGINX, Docker (30KB) — גישה: page.tsx (client callback) |
| **/supabase-oauth-nextjs** | **OAuth PKCE חלופי** — route.ts server callback + httpOnly:false (PYE9) |
| **fullstack-il/SUPABASE-OAUTH-NEXTJS.md** | גישה שנייה לOAuth: route.ts + cookies מפורטים. שווה לשתי הגישות לפי הפרויקט |
| **fullstack-il/SUPABASE-POSTGRES.md** | מדריך Postgres מפורט - 21 optimization rules (20KB) |

## כללי ברזל

1. **RTL First** - כל עיצוב מתחיל מימין לשמאל
2. **Mobile First** - responsive design תמיד
3. **TypeScript Strict** - אין `any`, אין `console.log`
4. **Gap Over Margin** - Parent שולט על ריווח
5. **globals.css קומפקטי** - מקסימום 1000 שורות (קיצון: 1200). עבר? פצל ל-partials
6. **DRY Components** - מבנה שחוזר על עצמו → קומפוננטה רוחבית עם props. אין copy-paste!

## Stack

- Next.js 15 App Router
- Tailwind CSS v4
- Supabase (Auth + Database)
- TypeScript 5
- Shadcn/ui + Radix
