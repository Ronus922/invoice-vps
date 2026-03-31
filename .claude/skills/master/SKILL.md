---
name: master
description: Master Orchestrator - כללי ברזל, בחירת סוכנים, ושמירה על שפה עיצובית
---

# Master Orchestrator

## כללי ברזל (מחייבים!)
1. **RTL First** - כל עיצוב מימין לשמאל
2. **Mobile First** - responsive תמיד
3. **TypeScript Strict** - אין `any`, אין `console.log`
4. **Gap Over Margin** - Parent שולט על ריווח
5. **PADDING תמיד!** - תוכן אף פעם לא נוגע בבורדר
6. **Touch Target** - מינימום 44x44px
7. **RTL Flex/Stepper** - השתמש ב-`flex-row-reverse` לרצף (1→2→3)
8. **שמור על שפה עיצובית** - בדוק קומפוננטות קיימות לפני יצירה!
9. **אסור להמציא צבעים** - רק מ-tailwind.config או קומפוננטות קיימות
10. **globals.css = תוכן עניינים** - רק `@import`. CSS בתת-קבצים ב-`app/styles/`
11. **DRY Components** - מבנה שחוזר → קומפוננטה רוחבית. אין קוד כפול!
12. **CSS Cleanup** - מחקת אלמנט? מחק את ה-CSS שלו!

---

## לפני כל UI חדש

### 1. בדוק צבעים קיימים
```bash
cat tailwind.config.* | grep -A 50 "colors"
grep -roh "bg-\[#[0-9A-Fa-f]\+\]" src/ | sort -u
```

### 2. בדוק קומפוננטות קיימות
```bash
ls src/components/
grep -r "Button\|Card\|Modal" src/components/
```

### 3. העתק סגנון קיים - אל תמציא!

---

## Minimum Padding
| Element | Minimum |
|---------|---------|
| Button | `px-4 py-2` |
| Card/Container | `p-4` |
| Input | `px-3 py-2` |
| Badge | `px-2 py-0.5` |
| Table Cell | `px-4 py-3` |
| List Item | `p-3` |
| Modal | `p-6` |

---

## RTL Patterns
```tsx
// Stepper/Progress - שלב 1 מימין
<div className="flex flex-row-reverse">
  {steps.map(step => <Step />)}
</div>

// Breadcrumbs
<nav className="flex flex-row-reverse gap-2">
  <span>בית</span> / <span>מוצרים</span>
</nav>

// Timeline/Process
<div className="flex flex-row-reverse items-center">
  {timeline.map(item => <TimelineItem />)}
</div>

// ❌ Never in Hebrew RTL
<div className="flex"> // LTR order - שגוי!
```

---

## Agent Selection Matrix

| Task Type | Primary Agent | Support Agents | Parallel? |
|-----------|---------------|----------------|-----------|
| UI/Component | Design | - | - |
| Feature (UI+API) | Fullstack | Design, API, Security | Yes |
| Bug (simple) | - | Explore | - |
| Bug (complex) | Fullstack | Explore, Security | Yes |
| Performance | Performance | API | Yes |
| Content | Content | Design | Yes |
| Security/Auth | Security | API | Yes |
| Animation | Animation | Design | Yes |
| Mobile | Mobile | API | Yes |
| Automation | n8n | API | Yes |
| QA/Testing | QA | Design, Security | Yes |
| **Clone Website** | **Clone Website** | Design, Parallel | **Yes** |
| **Multi-Agent Enterprise** | **Ruflo** | All Agents | **Yes** |

## Agent Profiles

| Agent | Expertise | Skills | Triggers |
|-------|-----------|--------|----------|
| Design | UI/UX, Tailwind, RTL, A11y | /design, /components | עיצוב, UI, button, form |
| Security | Auth, RLS, Validation | /security, /supabase-auth | auth, login, RLS |
| API | Next.js, Supabase, DB | /api, /features | API, endpoint, query |
| Content | Hebrew copy, SEO | /content | תוכן, טקסט, copy |
| Performance | Web Vitals, Caching | /optimization | slow, optimize, cache |
| Animation | GSAP, Framer Motion | /animations | animation, scroll, parallax |
| Mobile | React Native, Expo | /mobile | mobile, app, expo |
| n8n | Automation, Webhooks | /workflows | automation, webhook |
| QA | E2E, Browser automation | /qa | test, QA, בדיקות, bug hunt |
| Fullstack | Everything | ALL | complex features |
| fs-dev | Hebrew + Playwright | /gsd, /prd, /fullstack-il | Hebrew instructions |
| **Clone Website** | Chrome MCP, reverse-engineer | /clone-website, /design-pro | clone, שכפל, העתק עיצוב |
| **Ruflo** | Dual-mode, Swarm, Shared Memory | /ruflo, /parallel-strategy | ruflo, dual-mode, swarm, enterprise |

---

## Decision Trees

### Which Agent?
```
UI-only? → Design Agent
API-only? → API Agent
Auth/Security? → Security Agent
Content-only? → Content Agent
Performance? → Performance Agent
Animation? → Animation Agent
Mobile? → Mobile Agent
Automation? → n8n Agent
Multi-domain? → Fullstack Agent (or parallel)
Clone Website? → Clone Website Agent (requires claude --chrome)
Enterprise/Dual-Mode? → Ruflo Orchestrator (Claude Code + Codex + Swarm)
```

### Parallel or Sequential?
```
Tasks independent? → Parallel
Task B needs Task A output? → Sequential
Exploration/debugging? → Sequential
Implementation? → Usually Parallel
```

---

## Task Decomposition Patterns

### Pattern A: New Feature
```
Input: "Add user profile page"
→ Design Agent: UI components (parallel)
→ API Agent: endpoints (parallel)
→ Security Agent: permissions (parallel)
```

### Pattern B: Bug Fix
```
Input: "Login broken"
→ Explore Agent: find cause (first)
→ Relevant Agent: fix (then)
→ fs-dev Agent: add test (last)
```

### Pattern C: Performance
```
Input: "Page slow"
→ Performance Agent: profile (first)
→ API Agent: optimize queries (parallel)
→ Design Agent: optimize renders (parallel)
```

### Pattern D: Content
```
Input: "Update landing page"
→ Content Agent: Hebrew text (parallel)
→ Design Agent: layout (parallel)
```

---

## Available Skills

| Skill | Purpose |
|-------|---------|
| /design-pro | **Full design stack** — כל 4 שכבות העיצוב ביחד |
| /design | UI/UX foundation — Spacing, tokens, RTL (Layer 1) |
| /ui-details | Micro-refinements — text-wrap, shadows, tabular-nums (Layer 2) |
| /ui-ux-pro-max | Strategic flows, hierarchy, accessibility (Layer 3) |
| /frontend-design | Creative direction, bold aesthetics (Layer 4) |
| /components | Complex UI (toasts, tables) |
| /security | Auth, RLS, OWASP |
| /supabase-auth | Supabase auth patterns |
| /api | Backend, Server Actions |
| /features | Common patterns |
| /content | Hebrew copywriting |
| /optimization | Performance, Web Vitals |
| /animations | GSAP, Framer Motion |
| /mobile | React Native, Expo |
| /workflows | n8n automation |
| /fullstack-il | Hebrew fullstack |
| /gsd | Get Shit Done |
| /prd | Product Requirements |
| /charts | Recharts RTL |
| /init | Update docs |
| /contentmaster | Article generation |
| /qa | QA Testing |
| /ralph | Autonomous agent loop |
| /clone-website | AI website cloner (Chrome MCP) |
| /side-panel | RTL side panel (replaces modals) |
| /ruflo | **Dual-Mode Orchestration** — Claude Code + Codex + Swarm |

---

## ContentMaster
Use `/contentmaster` for article generation (branded, non-branded, multi-brand).
Triggers: "create article", "write article", "generate content"

---

## Triggers
- "master", "כללי ברזל", "orchestrator"
- "בחר סוכן", "איזה agent"
- Agent selection, task decomposition
